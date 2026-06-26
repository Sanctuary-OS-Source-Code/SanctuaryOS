import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { useModalStore } from './store/modalStore';
import { ViewHeader, CustomDropdown, GameVersionMultiSelect, ModSearchDropdown, SidePanel, CustomComplianceDropdown, loadDLCMap, HubTabButton, StatTile, standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardAccentGlassButtonClass, CustomDatePicker, extractPostImage, stripMarkdown } from './shared';
import ArchitectSupportTickets from './ArchitectSupportTickets';
import SASupportSettings from './SASupportSettings';
import MasonPostViewer from './MasonPostViewer';
import { FileVerificationSidePanel } from './ArchitectHub';
import ComplianceManualFlagSidePanel from './ComplianceManualFlagSidePanel';
import { IdentityMatrix, SharedIdentityEditor, CustomRoleSelect, ROLES } from './IdentityMatrix';
import { SharedMetadataEditorSidePanel } from './SharedMetadataEditorSidePanel';
import SAOversightReports from './SAOversightReports';

function TabButton({ id, label, activeTab, setTab }: any) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2
        ${isActive
          ? 'theme-bg-accent text-[var(--bg)] shadow-lg'
          : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5'
        }`}
    >
      {label}
    </button>
  );
}

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

export default function SeniorArchitect({ onOpenMasonProfile }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");
  const [defconOpen, setDefconOpen] = useState(false);
  const [complianceFilter, setComplianceFilter] = useState("ALL");
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);
  const [verifyPanelInitialHash, setVerifyPanelInitialHash] = useState<string>("");
  const [showManualFlagModal, setShowManualFlagModal] = useState(false);
  const [initialManualFlagQuery, setInitialManualFlagQuery] = useState("");
  const [initialHeuristicEdit, setInitialHeuristicEdit] = useState<any>(null);
  const [defconLevel, setDefconLevel] = useState<number>(5);

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase.from('global_network_status').select("defcon_level").single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchStatus();
    
    const sub = supabase.channel('public:global_network_status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_network_status' }, payload => {
        setDefconLevel(payload.new.defcon_level);
      }).subscribe();
      
    return () => { supabase.removeChannel(sub); };
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-32 relative">
      <ViewHeader 
         title={t("sa_title") || "Oversight Command"} 
         subtitle={t("sa_subtitle") || "Compliance, enforcement, audit control, and emergency authority"}
         icon={t("ui_icon_shield") || "security"}
         iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
         <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
           {/* Verify Hash Button */}
           <button 
             onClick={() => setIsVerifyPanelOpen(true)}
             className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
           >
             <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_verified") || "verified_user"}</span>
             <span className="text-[10px] font-black uppercase tracking-widest">{t("architect_btn_verify_hash") || "VERIFY HASH"}</span>
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
           <HubTabButton id="command_center" icon={t("ui_icon_pc") || "desktop_windows"} label={t("sa_tab_command_screen") || "Command"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="identities" icon={t("ui_icon_group") || "group"} label={t("sa_tab_identities") || "Identity"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="linker" icon={t("ui_icon_link") || "link"} label={t("sa_tab_linker") || "Masons"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="compliance" icon={t("ui_icon_policy") || "policy"} label={t("sa_tab_compliance") || "Compliance"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="oversight_reports" icon={t("ui_icon_threat_intelligence") || "threat_intelligence"} label={t("hub_tab_malware_logs") || "Manifests"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="mass_update" icon={t("ui_icon_dynamic_feed") || "dynamic_feed"} label={t("sa_tab_mass_update") || "Mass Update"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="game_versions" icon={t("ui_icon_settings") || "settings"} label={t("sa_tab_game_versions") || "Management"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="sanctuary_tickets" icon={t("ui_icon_local_activity") || "local_activity"} label={t("wf_tab_tickets") || "SUPPORT"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="support_settings" icon={t("ui_icon_support_agent") || "support_agent"} label={t("sa_tab_support_settings") || "SETTINGS"} activeTab={activeTab} setTab={setActiveTab} />
           <HubTabButton id="audit_logs" icon={t("ui_icon_history") || "history"} label={t("sa_tab_audit") || "Logs"} activeTab={activeTab} setTab={setActiveTab} />
         </div>
      </div>

        <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <CommandScreen setTab={setActiveTab} onOpenDefcon={() => setDefconOpen(true)} setComplianceFilter={setComplianceFilter} setViewingPost={setViewingPost} />}
        {activeTab === "identities" && <IdentityMatrix />}
        {activeTab === "linker" && <MasonLinker />}
        {activeTab === "compliance" && <ComplianceOversight initialFilter={complianceFilter} setInitialFilter={setComplianceFilter} onOpenManualFlag={(query: string, sig?: any) => { 
           setInitialManualFlagQuery(query); 
           if (sig) setInitialHeuristicEdit(sig);
           setShowManualFlagModal(true); 
        }} />}
        {activeTab === "mass_update" && <MassUpdateOversight />}
        {activeTab === "game_versions" && <GameManagementOversight />}
        {activeTab === "oversight_reports" && <SAOversightReports />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab === "sanctuary_tickets" && <ArchitectSupportTickets userRole="senior_architect" onOpenDNA={(hash) => {
           setVerifyPanelInitialHash(hash);
           setIsVerifyPanelOpen(true);
        }} />}
        {activeTab === "support_settings" && <SASupportSettings />}
      </div>

      <DefconSidePanel isOpen={defconOpen} onClose={() => setDefconOpen(false)} />
      <FileVerificationSidePanel 
        isOpen={isVerifyPanelOpen} 
        onClose={() => setIsVerifyPanelOpen(false)} 
        isSeniorArchitect={true} 
        initialHash={verifyPanelInitialHash}
        onManualFlag={(hash) => {
           setInitialManualFlagQuery(hash);
           setShowManualFlagModal(true);
        }}
      />
      <ComplianceManualFlagSidePanel 
        isOpen={showManualFlagModal}
        onClose={() => { setShowManualFlagModal(false); setInitialHeuristicEdit(null); }}
        initialQuery={initialManualFlagQuery}
        initialHeuristicSig={initialHeuristicEdit}
      />
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId="senior_architect" onOpenMasonProfile={onOpenMasonProfile} />}
    </div>
  );
}

function DefconPanel() {
  const { t } = useLexicon();
  const [defconLevel, setDefconLevel] = useState<number>(5);
  const [showDefconConfirmModal, setShowDefconConfirmModal] = useState(false);

  useEffect(() => {
    const fetchDefcon = async () => {
      const { data } = await supabase.from('global_network_status').select("defcon_level").eq('id', 1).single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchDefcon();
  }, []);

  const triggerDefcon = async () => {
    const newLevel = defconLevel === 1 ? 5 : 1;
    const msg = newLevel === 1 ? t("sa_defcon_msg_emergency") || "Emergency Patch Detected" : t("sa_defcon_msg_normal") || "System Nominal";
    
    setDefconLevel(newLevel);
    
    const { error } = await supabase.from('global_network_status')
      .update({ defcon_level: newLevel, message: msg })
      .eq('id', 1);
    
    if (error) {
      console.warn("Supabase RLS blocked global defcon sync.", error.message);
    }
  };

  return (
    <div className={`w-full max-w-xl mx-auto mt-12 theme-glass-panel border rounded-[3rem] p-8 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden shrink-0 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-white/5'}`}>
      {defconLevel === 1 && <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none" />}
      
      <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center relative z-10 ${defconLevel === 1 ? 'border-amber-900/50 shadow-lg' : 'border-white/10'}`}>
        <span className={`text-4xl material-symbols-outlined ${defconLevel === 1 ? 'animate-bounce text-amber-500' : 'text-white'}`}>{t("ui_icon_warning") || "warning_amber"}</span>
      </div>
      
      <div className="flex flex-col gap-2 relative z-10">
        <h3 className={`text-xl font-black uppercase tracking-tighter drop-shadow-md ${defconLevel === 1 ? 'text-amber-400' : 'text-[var(--text)]'}`}>{t("hub_defcon_override_title") || "Global Network Override"}</h3>
        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">
          {t("hub_defcon_override_desc") || "Initiate a DEFCON 1 protocol. This will instantly force all connected Sanctuary OS clients to seal their vaults and trigger emergency backups. Use only during imminent game patch deployments."}
        </p>
      </div>

      <button 
        onClick={() => setShowDefconConfirmModal(true)}
        className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all relative z-10 theme-glass-inner ${
          defconLevel === 1 
            ? 'border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5' 
            : 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:text-amber-400 hover:bg-amber-500/10'
        }`}
      >
        {defconLevel === 1 ? t("hub_defcon_stand_down") || "Stand Down (Return to Normal)" : t("hub_defcon_initiate") || "Initiate DEFCON 1 Lock Down"}
      </button>      {showDefconConfirmModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-md animate-in fade-in duration-300 p-8">
          <div className="relative w-full max-w-4xl theme-glass-panel border-2 border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[3rem] p-12 shadow-2xl flex flex-col gap-8 overflow-hidden">
            {defconLevel === 5 && (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(245,158,11,0.03)_25%,transparent,25%,transparent,50%,rgba(245,158,11,0.03),50%,rgba(245,158,11,0.03),75%,transparent,75%,transparent)] bg-[length:64px_64px] pointer-events-none opacity-50"></div>
                <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-80"></div>
              </>
            )}
            
            <div className="flex items-start gap-8 relative z-10 text-left">
              <div className={`relative w-32 h-32 rounded-3xl flex items-center justify-center text-6xl shrink-0 shadow-lg ${defconLevel === 5 ? 'bg-amber-900/10 border border-amber-900/50' : 'bg-white/5 border border-white/10'}`}>
                {defconLevel === 5 && <div className="absolute inset-0 rounded-3xl border-2 border-amber-500/20 animate-spin-slow"></div>}
                <span className={`drop-shadow-md animate-pulse material-symbols-outlined ${defconLevel === 5 ? 'text-amber-500' : 'text-white'}`}>{t("ui_icon_warning") || "warning_amber"}</span>
              </div>
              <div className="flex flex-col gap-4 pt-2 flex-1">
                <h2 className={`text-5xl font-black uppercase tracking-tighter drop-shadow-md leading-none ${defconLevel === 5 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                  {t("hub_defcon_confirm_title") || "Global Override Confirm"}
                </h2>
                <div className={`w-full h-px my-2 ${defconLevel === 5 ? 'bg-gradient-to-r from-amber-500/50 to-transparent' : 'bg-gradient-to-r from-white/10 to-transparent'}`}></div>
                <p className={`text-xs font-bold uppercase tracking-[0.2em] leading-relaxed max-w-2xl whitespace-pre-line ${defconLevel === 5 ? 'text-amber-200/80' : 'text-[var(--text)]/80'}`}>
                  {defconLevel === 1 
                    ? t("hub_defcon_confirm_stand_down") || "Are you sure you want to stand down the global alert? This will lift the lockdown for all clients."
                    : t("hub_defcon_confirm_execute") || "Are you absolutely sure you want to broadcast a DEFCON 1 global alert? This will immediately lock down all connected clients and force emergency backups."}
                </p>
              </div>
            </div>

            <div className="flex gap-4 w-full mt-4 relative z-10">
              <button 
                onClick={() => { triggerDefcon(); setShowDefconConfirmModal(false); }}
                className={`flex-1 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all theme-glass-inner shadow-lg ${
                  defconLevel === 5 
                    ? 'border border-amber-900/50 text-amber-400 hover:border-amber-500 hover:bg-amber-500/10' 
                    : 'border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5'
                }`}
              >
                {defconLevel === 1 ? t("hub_btn_confirm_stand_down") || "Confirm Stand Down" : t("hub_btn_execute_defcon") || "Execute DEFCON 1"}
              </button>
              <button 
                onClick={() => setShowDefconConfirmModal(false)}
                className="flex-1 py-6 theme-glass-inner border border-white/10 text-[var(--text)] hover:border-white/30 hover:bg-white/5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all shadow-sm"
              >
                {t("hub_btn_abort") || "Abort"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSearchDropdown({ value, onChange, profiles }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedProfile = profiles.find((p: any) => p.id === value);
  const displayValue = selectedProfile ? `${selectedProfile.username || 'Unknown'} (${selectedProfile.id.substring(0,8)})` : query;

  const filtered = profiles.filter((p: any) => 
    !query || 
    p.username?.toLowerCase().includes(query.toLowerCase()) || 
    p.id?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="relative w-full">
      <div className="relative z-[10]">
        <input 
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => { 
             if (!value) {
                setQuery(e.target.value); 
                setIsOpen(true);
             }
          }}
          onFocus={() => { if (!value) setIsOpen(true); }}
          placeholder={t("sa_search_profile") || "SEARCH PROFILE NAME OR ID..."}
          readOnly={!!value}
          className={`w-full h-12 theme-glass-inner rounded-xl px-5 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all relative cursor-text ${value ? 'theme-text-accent' : ''}`}
        />
        {value ? (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold" onClick={() => { onChange(""); setQuery(""); setIsOpen(true); inputRef.current?.focus(); }}>
            {t("emote_close")}
          </button>
        ) : (
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "▲" : "▼"}
          </button>
        )}
      </div>
      
      {isOpen && !value && createPortal(
        <>
          <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
          <div className="fixed mt-2 theme-glass-panel border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-[50001] animate-in fade-in slide-in-from-top-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar" style={{
            top: inputRef.current?.getBoundingClientRect().bottom,
            left: inputRef.current?.getBoundingClientRect().left,
            width: inputRef.current?.getBoundingClientRect().width,
          }}>
            {filtered.map((p: any) => (
              <button 
                key={p.id} 
                onClick={() => { onChange(p.id); setIsOpen(false); setQuery(""); }} 
                className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
              >
                <span className="text-[11px] font-black uppercase text-[var(--text)]">{p.username || "UNKNOWN"}</span>
                <span className="text-[8px] font-mono opacity-50">{p.id}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-4 text-center text-[10px] font-black uppercase tracking-widest opacity-50">{t("sa_no_profiles") || "NO PROFILES FOUND"}</div>}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export function MasonLinker() {
  const { t } = useLexicon();
  const [masons, setMasons] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all"|"verified"|"unverified">("all");
  const [loading, setLoading] = useState(true);

  const [selectedMason, setSelectedMason] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [linkedProfileId, setLinkedProfileId] = useState<string>("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from('masons').select('id, name, profile_id, is_verified, created_at').order('name');
    if (mData) setMasons(mData);

    const { data: pData } = await supabase.from('profiles').select('id, username, role').order('username');
    if (pData) setProfiles(pData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenPanel = (m: any = null) => {
    setStatus("");
    if (m) {
      setSelectedMason(m);
      setIsCreating(false);
      setEditName(m.name || "");
      setIsVerified(m.is_verified || false);
      setLinkedProfileId(m.profile_id || "");
    } else {
      setSelectedMason(null);
      setIsCreating(true);
      setEditName("");
      setIsVerified(false);
      setLinkedProfileId("");
    }
  };

  const handleClosePanel = () => {
    setSelectedMason(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      setStatus("Mason Name is required.");
      return;
    }
    
    setIsSubmitting(true);
    setStatus(t("sa_status_linking") || "LINKING..."); 
    
    const userRes = await supabase.auth.getUser();
    const myId = userRes.data.user?.id;
    
    let masonId = selectedMason?.id;

    if (isCreating) {
      const { data, error } = await supabase.from('masons').insert({
        name: editName.trim(),
        profile_id: linkedProfileId || null,
        is_verified: isVerified
      }).select().single();
      
      if (error) {
        setStatus("Failed to create: " + error.message);
        setIsSubmitting(false);
        return;
      }
      masonId = data.id;
      
      await supabase.from('audit_logs').insert({
         action: `Created new Mason: ${editName.trim()}`,
         target_table: 'masons',
         target_name: editName.trim(),
         actor_id: myId,
         reason: "Mason Creation"
      });
    } else {
      const { data, error } = await supabase.from('masons').update({ 
        name: editName.trim(),
        profile_id: linkedProfileId || null,
        is_verified: isVerified 
      }).eq('id', masonId).select();
      
      if (error || !data || data.length === 0) {
        setStatus("Failed to update: " + (error?.message || "Permission Denied."));
        setIsSubmitting(false);
        return;
      }
      
      await supabase.from('audit_logs').insert({
         action: `Updated Mason: ${editName.trim()} (Verified: ${isVerified}, Linked: ${linkedProfileId || 'None'})`,
         target_table: 'masons',
         target_name: editName.trim(),
         actor_id: myId,
         reason: "Mason Update/Link"
      });
    }
    
    if (linkedProfileId) {
       const linkedProfile = profiles.find(p => p.id === linkedProfileId);
       if (linkedProfile && (linkedProfile.role === 'citizen' || !linkedProfile.role)) {
          await supabase.from('profiles').update({ role: 'mason' }).eq('id', linkedProfileId);
       }
    }
    
    setStatus(t("sa_identities_updated") || "ROLE UPDATED");
    fetchData();
    setTimeout(() => {
      handleClosePanel();
      setIsSubmitting(false);
    }, 1500);
  };

  const filteredMasons = masons.filter((m: any) => {
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase()) || m.id?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === "all" ? true : filterType === "verified" ? m.is_verified : !m.is_verified;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_link") || "link"}</span>
          </div>
          <span className="truncate">{t("sa_linker_title") || "Mason Verification"}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={t("sa_linker_search_mason") || "Search Mason..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
          
          <div className="w-48 z-40">
            <CustomDropdown disableTint={true}   
              value={filterType} 
              onChange={(v: string[]) => setFilterType(v[0] as any)} 
              options={[
                { id: "all", label: "ALL MASONS" },
                { id: "verified", label: "VERIFIED" },
                { id: "unverified", label: "UNVERIFIED" }
              ]}
              placeholder="FILTER STATUS"
            />
          </div>

          <button 
            onClick={() => handleOpenPanel(null)}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("ui_icon_add") || "add"}</span>
            {t("sa_btn_create_mason_naked") || "LINK MASON"}
          </button>
        </div>
      </div>
      
      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
      {loading ? (
        <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("sa_identities_fetching") || "Fetching Records..."}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {filteredMasons.map((m: any) => (
            <div 
              key={m.id} 
              onClick={() => handleOpenPanel(m)} 
              className={`theme-glass-panel rounded-[1.5rem] flex flex-col group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] cursor-pointer ${m.is_verified ? 'hover:border-green-500/50 hover:shadow-[0_0_40px_rgba(34,197,94,0.15)]' : 'hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'} hover:-translate-y-1.5`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${m.is_verified ? 'from-green-500/5' : 'from-[var(--accent)]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
              
              <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${m.is_verified ? 'bg-green-500/50 group-hover:bg-green-500 group-hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'theme-bg-accent/50 group-hover:theme-bg-accent group-hover:shadow-[0_0_20px_var(--accent)]'}`} />
              
              <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                <div className="flex justify-between items-start gap-4">
                  <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${m.is_verified ? 'group-hover:border-green-500/30' : 'group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                      <span className={`material-symbols-outlined !text-[24px] text-[var(--text)] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${m.is_verified ? 'group-hover:text-green-400' : 'group-hover:theme-text-accent'}`}>
                          architecture
                      </span>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors ${m.is_verified ? 'bg-green-500/10 text-green-400 border-green-500/20 group-hover:bg-green-500/20' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] opacity-60 border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                      {m.is_verified ? t("sa_verified") || "Verified" : t("sa_unverified") || "Unverified"}
                  </span>
                </div>
                
                <div className="flex flex-col gap-1 mt-auto pt-2">
                    <span className={`text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors ${m.is_verified ? 'group-hover:text-green-400' : 'group-hover:theme-text-accent'}`}>
                      {m.name || t("sa_identities_unknown") || "UNKNOWN"}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center">
                        <span className="material-symbols-outlined !text-[12px] opacity-70">{t("ui_icon_fingerprint") || "fingerprint"}</span>
                        {m.id.substring(0,8)}
                    </span>
                </div>
                
                <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-3">
                   <span className={`text-[10px] font-bold uppercase flex items-center gap-1.5 truncate ${m.profile_id ? 'text-[var(--text)] opacity-80' : 'text-red-400 opacity-80'}`}>
                     <span className="material-symbols-outlined !text-[12px] opacity-70">{m.profile_id ? "link" : "link_off"}</span>
                     {m.profile_id ? (profiles.find(p => p.id === m.profile_id)?.username || m.profile_id.substring(0,8)) : (t("sa_unlinked") || "Unlinked")}
                   </span>
                </div>
              </div>
            </div>
          ))}
          {filteredMasons.length === 0 && (
             <div className="col-span-full py-20 text-center text-[var(--subtext)] opacity-50 font-black uppercase tracking-widest">
                {t("sa_no_masons") || "No Masons Found"}
             </div>
          )}
        </div>
      )}
      </div>

      <SidePanel
        isOpen={!!selectedMason || isCreating}
        onClose={handleClosePanel}
        title={isCreating ? "LINK NEW MASON" : "EDIT MASON"}
        icon={t("ui_icon_link") || "link"}
        subtitle={selectedMason ? `UUID: ${selectedMason.id}` : t("sa_create_mason_subtitle") || "Link a new verified or unverified Mason"}
        footer={
          <div className="flex flex-col gap-4 w-full">
            {status && (
              <div className="text-center bg-black/20 p-3 rounded-xl border border-white/5 w-full">
                <p className={`text-[10px] font-black uppercase tracking-widest ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
              </div>
            )}
            <div className="flex justify-center items-center gap-4 w-full">
              <button type="button" onClick={handleClosePanel} disabled={isSubmitting} className={standardButtonClass}>
                {t("ui_btn_cancel") || "CANCEL"}
              </button>
              <button 
                onClick={handleSave} 
                disabled={isSubmitting || !editName.trim()} 
                className={standardAccentGlassButtonClass}
              >
                {isSubmitting ? t("sa_identities_updating") || "UPDATING ROLE..." : (isCreating ? t("sa_btn_create_mason_naked") || "LINK MASON" : t("registry_commit_changes") || "Commit Changes")}
              </button>
            </div>
          </div>
        }
      >
        <div className="p-6 flex flex-col h-full gap-8">
          
          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_info") || "info"}</span>
              {t("sa_metadata") || "METADATA"}
            </h4>
            
            <div className="flex flex-col gap-2 relative z-50">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_mason_name") || "MASON NAME"}</label>
              <input 
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t("sa_placeholder_mason_name") || "Enter Mason Name"}
                className="w-full theme-glass-panel rounded-2xl pl-5 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />
            <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_link") || "link"}</span>
              {t("sa_linking_verification") || "LINKING & VERIFICATION"}
            </h4>

            <div className="flex flex-col gap-2 relative z-40">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_link_profile") || "LINK TO PROFILE"}</label>
              <ProfileSearchDropdown 
                 value={linkedProfileId} 
                 profiles={profiles} 
                 onChange={setLinkedProfileId}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-2 flex items-center gap-2">
                 <span className={`w-2 h-2 rounded-full ${isVerified ? 'theme-bg-success shadow-[0_0_10px_var(--success)]' : 'bg-gray-500'}`}></span>
                 {t("sa_mark_verified") || "MARK AS VERIFIED"}
              </label>
              <button 
                onClick={() => setIsVerified(!isVerified)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isVerified ? 'theme-bg-success' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVerified ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

        </div>
      </SidePanel>
    </div>
  );
}

function HeuristicsReadOnlyList({ onEditClick }: { onEditClick: (sig: any) => void }) {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const config = await invoke<any>('get_saved_coordinates');
      const sigs = await invoke<any[]>('get_heuristic_signatures', { vaultPath: config.vault_path });
      setSignatures(sigs);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const handleRefresh = () => load();
    window.addEventListener('force-heuristics-refresh', handleRefresh);
    return () => window.removeEventListener('force-heuristics-refresh', handleRefresh);
  }, []);

  return (
    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
      {loading ? (
        <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">Loading Signatures...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {signatures.map(sig => {
            const isMalware = sig.severity === 'malware';
            const isExplicit = sig.severity === 'explicit';
            const sColor = isMalware ? 'text-red-500' : isExplicit ? 'text-[#fbbf24]' : 'text-[#3b82f6]';
            const sBorder = isMalware ? 'border-red-500' : isExplicit ? 'border-[#fbbf24]' : 'border-[#3b82f6]';
            const sBg = isMalware ? 'from-red-500/10' : isExplicit ? 'from-[#fbbf24]/10' : 'from-[#3b82f6]/10';
            const sLine = isMalware ? 'bg-red-500/50 group-hover:bg-red-500' : isExplicit ? 'bg-[#fbbf24]/50 group-hover:bg-[#fbbf24]' : 'bg-[#3b82f6]/50 group-hover:bg-[#3b82f6]';

            return (
              <div 
                key={sig.id} 
                onClick={() => onEditClick(sig)}
                className={`theme-glass-panel rounded-[1.5rem] flex flex-col group border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] border-white/5 hover:${sBorder}/50 hover:shadow-[0_0_40px_rgba(0,0,0,0.2)] cursor-pointer ${!sig.enabled ? 'opacity-50 grayscale' : ''}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${sBg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                
                <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${sLine}`} />
                
                <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                  <div className="flex justify-between items-start gap-4">
                    <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:${sBorder}/30`}>
                        <span className={`material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${sColor}`}>
                            bug_report
                        </span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 text-[var(--subtext)] border-white/10 group-hover:${sBorder}/30 group-hover:${sColor}`}>
                        {sig.severity}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 mt-auto pt-2">
                      <span className={`text-lg font-mono opacity-80 font-bold truncate leading-tight transition-colors ${sColor} group-hover:opacity-100`}>
                        {sig.signature}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center truncate">
                          <span className="material-symbols-outlined !text-[12px] opacity-70">account_tree</span>
                          {sig.match_type}
                      </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-3">
                     <span className="text-[10px] font-bold uppercase flex justify-between items-center w-full text-[var(--subtext)] opacity-80">
                       <span className="flex items-center gap-1.5 truncate">
                         <span className="material-symbols-outlined !text-[12px] opacity-70">shield</span>
                         {sig.enabled ? (t("sa_comp_enabled") || "ENABLED") : (t("sa_comp_disabled") || "DISABLED")}
                       </span>
                     </span>
                  </div>
                </div>
              </div>
            );
          })}
          {signatures.length === 0 && (
            <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest">
              {t("sa_comp_no_heuristics") || "No active heuristic signatures."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ComplianceOversight({ initialFilter, setInitialFilter, onOpenManualFlag }: any) {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [metadataMod, setMetadataMod] = useState<any>(null);
  const [filterTier, setFilterTier] = useState<number | null>(() => {
     if (initialFilter === "nsfw") return 1;
     if (initialFilter === "explicit") return 2;
     if (initialFilter === "malware" || initialFilter === "quarantined") return 3;
     return null;
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
     if (initialFilter === "quarantined") return "verified";
     if (initialFilter === "all") return "all";
     return "pending";
  });
  const [search, setSearch] = useState("");
  
  // Side Panel
  const [selectedMod, setSelectedMod] = useState<any | null>(null);
  const [editTier, setEditTier] = useState<number>(0);
  const [editReason, setEditReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const fetchMods = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('mods')
      .select('id, name, master_author, compliance_tier, status, mason_id')
      .or('compliance_tier.gt.0,status.in.(under_review,pending,blacklisted)')
      .order('compliance_tier', { ascending: false });
    
    if (data) setMods(data);
    const { data: mData } = await supabase.from('profiles').select('id, username').eq('role', 'mason');
    if (mData) setMasonsList(mData);
    setLoading(false);
  };

  const handleClearFlag = async (e: React.MouseEvent, mod: any) => {
    e.stopPropagation();
    if (!editReason.trim()) {
      setStatus(t("sa_identities_req_reason") || "A reason is required to process this change.");
      return;
    }
    setLoading(true);
    try {
      await supabase.from('mods').update({ compliance_tier: 0, status: 'verified' }).eq('id', mod.id);
      const userRes = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        action: `Cleared compliance flag for artifact: ${mod.name}`,
        target_table: 'mods',
        target_name: mod.id,
        actor_id: userRes.data?.user?.id,
        reason: editReason
      });
      setEditReason("");
      fetchMods();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSetFlag = async (e: React.MouseEvent, mod: any) => {
    e.stopPropagation();
    if (!editReason.trim()) {
      setStatus(t("sa_identities_req_reason") || "A reason is required to process this change.");
      return;
    }
    setLoading(true);
    try {
      await supabase.from('mods').update({ compliance_tier: 3, status: 'blacklisted' }).eq('id', mod.id);
      const userRes = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        action: `Set compliance flag for artifact: ${mod.name} to Tier 3`,
        target_table: 'mods',
        target_name: mod.id,
        actor_id: userRes.data?.user?.id,
        reason: editReason
      });
      setEditReason("");
      fetchMods();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => { fetchMods(); }, []);

  const handleOpenPanel = (mod: any) => {
    setSelectedMod(mod);
    setEditTier(mod.compliance_tier);
    setEditReason("");
    setStatus("");
  };

  const handleSaveTier = async () => {
    if (!selectedMod) return;
    if (editTier !== selectedMod.compliance_tier && !editReason.trim()) {
       setStatus("Reason is required when changing compliance tier.");
       return;
    }

    setIsSubmitting(true);
    setStatus("Updating...");

    try {
      const { error } = await supabase.from('mods').update({ compliance_tier: editTier }).eq('id', selectedMod.id);
      if (error) throw error;

      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;
      
      await supabase.from('audit_logs').insert({
         action: `Changed compliance tier from ${selectedMod.compliance_tier} to ${editTier}`,
         target_table: 'mods',
         target_name: selectedMod.name || selectedMod.id,
         actor_id: myId,
         reason: editReason.trim() || "Compliance Update"
      });

      setStatus("Success");
      setSelectedMod(null);
      fetchMods();
      if (editTier === 3) {
         window.dispatchEvent(new CustomEvent('force-radar-sweep'));
      }
    } catch (err: any) {
      setStatus("Failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMods = mods.filter(m => {
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase());
    const matchesTier = filterTier ? m.compliance_tier === filterTier : true;
    
    let matchesStatus = true;
    if (filterStatus === "pending") {
       matchesStatus = ["under_review", "pending", "blacklisted"].includes(m.status?.toLowerCase() || "");
    } else if (filterStatus === "verified") {
       matchesStatus = ["verified", "clean", "ok"].includes(m.status?.toLowerCase() || "");
    }

    return matchesSearch && matchesTier && matchesStatus;
  });

  const getTierDetails = (tier: number) => {
    switch(tier) {
      case 1: return { label: t("sa_rating_nsfw") || "NSFW (18+)", color: 'theme-text-warning', bg: 'theme-bg-warning' };
      case 2: return { label: t("sa_rating_explicit") || "EXPLICIT", color: 'theme-text-danger', bg: 'theme-bg-danger' };
      case 3: return { label: t("sa_rating_malware") || "MALWARE", color: 'text-red-500', bg: 'bg-red-500' };
      default: return { label: t("sa_rating_clean") || "CLEAN", color: 'theme-text-success', bg: 'theme-bg-success' };
    }
  };

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_policy") || "policy"}</span>
          </div>
          <span className="truncate">{t("sa_comp_title") || "Compliance Oversight"}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={t("sa_comp_search_mods") || "Search Artifacts..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
          
          <div className="w-48 z-40">
            <CustomDropdown disableTint={true}   
              value={filterTier === null ? "all" : filterTier} 
              onChange={(v: any[]) => setFilterTier(v[0] === "all" ? null : v[0])} 
              options={[
                { id: "all", label: t("sa_comp_filter_all_alerts") || "ALL ALERTS" },
                { id: 1, label: getTierDetails(1).label },
                { id: 2, label: getTierDetails(2).label },
                { id: 3, label: getTierDetails(3).label }
              ]}
              placeholder={t("sa_comp_filter_tier") || "FILTER TIER"}
            />
          </div>

          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 h-12 shrink-0 z-40">
            <button 
              onClick={() => setFilterStatus("pending")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterStatus === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("ui_tab_pending") || "Pending"}
            </button>
            <button 
              onClick={() => setFilterStatus("verified")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterStatus === 'verified' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_verified") || "Verified"}
            </button>
            <button 
              onClick={() => setFilterStatus("heuristics")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterStatus === 'heuristics' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_heuristics_tab") || "HEURISTICS"}
            </button>
          </div>

          <button 
            onClick={() => onOpenManualFlag("")} 
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group !w-auto"
          >
            <span className="material-symbols-outlined !text-[18px] group-hover:scale-110 transition-transform">{t("ui_icon_flag") || "flag"}</span>
            {t("sa_comp_btn_manual_flag") || "MANUAL FLAG"}
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {filterStatus === "heuristics" ? (
          <HeuristicsReadOnlyList onEditClick={(sig) => {
             onOpenManualFlag("", sig);
          }} />
        ) : (
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {loading ? (
            <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("sa_comp_scanning") || "Scanning Global Registry..."}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredMods.map(mod => {
                const td = getTierDetails(mod.compliance_tier);
                const isMalware = mod.compliance_tier === 3;
                return (
                  <div 
                    key={mod.id} 
                    onClick={() => handleOpenPanel(mod)} 
                    className={`theme-glass-panel rounded-[1.5rem] flex flex-col group border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] cursor-pointer hover:-translate-y-1.5 ${isMalware ? 'border-red-900/50 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${isMalware ? 'from-red-500/10' : 'from-[var(--accent)]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                    
                    <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${isMalware ? 'bg-red-500/50 group-hover:bg-red-500 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'theme-bg-accent/50 group-hover:theme-bg-accent group-hover:shadow-[0_0_20px_var(--accent)]'}`} />
                    
                    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${isMalware ? 'group-hover:border-red-500/30' : 'group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                          <span className={`material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${isMalware ? 'text-red-500' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>
                              policy
                          </span>
                      </div>
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 ${td.color}`}>
                          {td.label}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-auto pt-2">
                        <span className={`text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors ${isMalware ? 'group-hover:text-red-400' : 'group-hover:theme-text-accent'}`}>
                          {mod.name}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center">
                            <span className="material-symbols-outlined !text-[12px] opacity-70">{t("ui_icon_person") || "person"}</span>
                            {mod.master_author || t("sa_comp_unknown_mason") || "UNKNOWN MASON"}
                        </span>
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-3">
                       <span className="text-[10px] font-bold uppercase flex justify-between items-center w-full text-[var(--subtext)] opacity-80">
                         <span className="flex items-center gap-1.5 truncate">
                           <span className="material-symbols-outlined !text-[12px] opacity-70">{t("ui_icon_fingerprint") || "fingerprint"}</span>
                           {mod.id.substring(0,8)}
                         </span>
                         <span className="text-[10px] font-black theme-text-accent uppercase opacity-0 group-hover:opacity-100 transition-opacity">{t("hub_btn_review") || "REVIEW"} &rarr;</span>
                       </span>
                    </div>

                    </div>
                  </div>
                );
              })}
            {filteredMods.length === 0 && (
              <div className="col-span-full py-20 text-center opacity-50 font-black uppercase tracking-widest">
                {t("sa_comp_no_alerts") || "No active compliance alerts."}
              </div>
            )}
          </div>
        )}
        </div>
        )}
      </div>

      <SidePanel
        isOpen={!!selectedMod}
        onClose={() => setSelectedMod(null)}
        title={t("sa_comp_edit_tier") || "EDIT COMPLIANCE TIER"}
        icon={t("ui_icon_policy") || "policy"}
        subtitle={selectedMod ? `UUID: ${selectedMod.id}` : undefined}
        footer={
          <div className="flex flex-col gap-4 w-full">
            {status && (
              <div className="text-center bg-black/20 p-3 rounded-xl border border-white/5 w-full">
                <p className={`text-[10px] font-black uppercase tracking-widest ${status.includes('Failed') || status.includes('required') ? 'text-red-400' : 'theme-text-accent'}`}>{status}</p>
              </div>
            )}
            <div className="flex justify-center items-center gap-4 w-full">
                {(selectedMod?.status === 'pending' || selectedMod?.status === 'under_review') ? (
                  <>
                    <button 
                      onClick={(e) => { e.preventDefault(); handleClearFlag(e, selectedMod); setSelectedMod(null); }}
                      className={standardSuccessButtonClass}
                      disabled={isSubmitting || !editReason.trim()}
                    >
                      {t("sa_btn_clear_flag") || "CLEAR FLAG"}
                    </button>
                    <button 
                      onClick={(e) => { e.preventDefault(); handleSetFlag(e, selectedMod); setSelectedMod(null); }}
                      className={standardDangerButtonClass}
                      disabled={isSubmitting || !editReason.trim()}
                    >
                      {t("sa_btn_set_flag") || "SET FLAG"}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleSaveTier} 
                    disabled={isSubmitting || !editReason.trim()} 
                    className={standardSuccessButtonClass}
                  >
                    {isSubmitting ? t("sa_identities_updating") || "UPDATING ROLE..." : t("registry_commit_changes") || "Commit Changes"}
                  </button>
                )}
            </div>
          </div>
        }
      >
        <div className="p-6 flex flex-col h-full gap-8">
          
          <div className="flex flex-col gap-6 relative">
            <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_info") || "info"}</span>
              {t("mason_bug_inspect_report") || "View"}
            </h4>
            
            <div className="flex flex-col gap-2 relative z-10">
              <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none">{selectedMod?.name}</h3>
              <button 
                onClick={() => setMetadataMod(selectedMod)}
                className="mt-2 text-[10px] font-black uppercase tracking-widest theme-text-accent hover:text-[var(--text)] transition-colors flex items-center gap-1 w-max"
              >
                <span className="material-symbols-outlined !text-[12px]">edit</span>
                {t("ui_edit_metadata") || "EDIT METADATA"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6 relative">
            <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
              <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_policy") || "policy"}</span>
              {t("sa_comp_enforcement") || "ENFORCEMENT"}
            </h4>

            <div className="flex flex-col gap-2 relative z-50">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_assign_tier") || "ASSIGN TIER"}</label>
              <CustomComplianceDropdown 
                value={editTier} 
                onChange={setEditTier} 
                includeTier3={true}
              />
            </div>

            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 relative z-40 mt-2">
               <label className="text-[9px] font-black text-red-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                  {t("sa_tier_reason_req") || "REASON FOR TIER CHANGE (REQUIRED)"}
               </label>
               <textarea 
                 value={editReason} 
                 onChange={e => setEditReason(e.target.value)} 
                 placeholder={t("sa_comp_reason_placeholder") || "Reason for compliance flag/adjustment..."} 
                 className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none border border-red-500/30 bg-red-500/5 focus:border-red-500/60 shadow-[inset_0_0_20px_rgba(255,0,0,0.1)]" 
               />
            </div>
          </div>
        </div>
      </SidePanel>

      <SharedMetadataEditorSidePanel 
        isOpen={!!metadataMod}
        onClose={() => setMetadataMod(null)}
        activeMod={metadataMod}
        masonsList={masonsList}
        onModUpdated={fetchMods}
      />
    </div>
  );
}

function DashboardStatTile({ icon, number, label, colorClass, onClick }: any) {
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

function CommandScreen({ setTab, onOpenDefcon, setComplianceFilter, setViewingPost }: any) {
  const { t } = useLexicon();
  const defconLevel = useStore((state: any) => state.defconLevel);
  const [stats, setStats] = useState({ masons: 0, citizens: 0, explicit: 0, malware: 0, nsfw: 0, tickets: 0, architects: 0, artifacts: 0, blacklists: 0, oversightQueue: 0, oversightQueueNew: 0 });
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const { data } = await supabase.from('system_broadcasts')
        .select('*')
        .in('target_audience', ['All', 'Senior Architects', 'all', 'senior architects'])
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
  
            if (dest === 'mod_author') {
              const modAuthorId = t.target_mod_id ? modAuthorMap[t.target_mod_id] : null;
              if (!modAuthorId) dest = 'architect';
            }
  
            return dest === 'senior_architect';
          }).length;
        }
        
      const { count: architectsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['architect', 'senior_architect']);
      const { count: blacklistsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true);
      const { count: oversightCount } = await supabase.from('malware_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { count: oversightNewCount } = await supabase.from('malware_reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gte('created_at', thirtyDaysAgo.toISOString());

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
        oversightQueueNew: oversightNewCount || 0
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
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pr-4 pb-32 mt-8">
      {/* Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_warning") || "warning_amber"}</span>} number={defconLevel} label={t("hub_stat_global_defcon") || "GLOBAL DEFCON"} colorClass={getDefconColor(defconLevel)} onClick={onOpenDefcon} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_nsfw") || "18_up_rating"}</span>} number={stats.nsfw} label={t("hub_stat_nsfw_flags") || "NSFW FLAGS"} colorClass="border-orange-500/30 text-orange-500 hover:border-orange-500 bg-orange-500/10 hover:bg-orange-500/20" onClick={() => { setComplianceFilter('nsfw'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_explicit") || "block"}</span>} number={stats.explicit} label={t("hub_stat_explicit_flags") || "EXPLICIT FLAGS"} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { setComplianceFilter('explicit'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_malware_skull") || "skull"}</span>} number={stats.malware} label={t("hub_stat_quarantined") || "QUARANTINED"} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => { setComplianceFilter('malware'); setTab("compliance"); }} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>} number={stats.oversightQueueNew} label={t("hub_stat_malware_logs") || "MALWARE MANIFESTS"} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" onClick={() => setTab("oversight_reports")} />
        <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">{t("ui_icon_local_activity") || "local_activity"}</span>} number={stats.tickets} label={t("hub_stat_support_tickets") || "SUPPORT TICKETS"} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" onClick={() => setTab("sanctuary_tickets")} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        {/* Left Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6 shrink-0">{t("wayfinder_comms") || "Latest Dispatch"}</h2>
          
          <div className="flex flex-col gap-8 w-full">
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
               {broadcasts.length > 0 ? broadcasts.map((post, index) => {
                 const isFeatured = index === 0;
                 return (
                 <div key={post.id} onClick={() => setViewingPost({ ...post, content: post.message, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className={`group cursor-pointer w-full theme-glass-panel rounded-[2rem] overflow-hidden hover:scale-[1.01] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 flex flex-col ${isFeatured ? 'xl:flex-row xl:col-span-2 min-h-[12rem] xl:min-h-[14rem]' : 'min-h-[10rem]'}`}>
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
                      {isFeatured && <p className="text-xs text-[var(--subtext)] leading-relaxed font-bold opacity-80 mb-6 line-clamp-3">{stripMarkdown(post.message)}</p>}
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

             <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mt-4 mb-2 shrink-0">{t("hub_metrics") || "HUB METRICS"}</h2>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-[var(--accent)]/30 transition-all text-center h-32">
                   <span className="text-3xl font-black theme-text-accent">{stats.citizens + stats.masons}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_users") || "USERS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-[var(--accent)]/30 transition-all text-center h-32">
                   <span className="text-3xl font-black theme-text-accent">{stats.masons}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_masons") || "MASONS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-purple-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-purple-400">{stats.architects}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_architects") || "ARCHITECTS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-red-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-red-500">{stats.blacklists}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_stat_blacklists") || "BLACKLISTS"}</span>
                </div>
                <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg hover:bg-white/5 hover:border-emerald-500/30 transition-all text-center h-32">
                   <span className="text-3xl font-black text-red-700">{stats.oversightQueue}</span>
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-70 text-[var(--subtext)] leading-tight">{t("hub_tab_malware_logs") || "MALWARE LOGS"}</span>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column - Quick Links */}
        <div className="w-[380px] shrink-0 flex flex-col">
           <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] mb-6">{t("hub_quick_links") || "QUICK LINKS"}</h2>
           <div className="flex flex-col gap-4">
             <button onClick={() => setTab("linker")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_link") || "link"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_mason_linker") || "MASON VERIFICATION"}</h3>
                   <span className="text-[8px] uppercase font-bold text-blue-400 opacity-80 group-hover:text-blue-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span> {t("hub_ql_link_profiles") || "LINK PROFILES"}</span>
                 </div>
               </div>
             </button>
             
             <button onClick={() => setTab("compliance")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_policy") || "policy"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sa_comp_title") || "Compliance Oversight"}</h3>
                   <span className="text-[8px] uppercase font-bold text-amber-400 opacity-80 group-hover:text-amber-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span> {t("hub_ql_global_review") || "GLOBAL REVIEW"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("oversight_reports")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("sa_oversight_dashboard") || "OVERSIGHT REPORTS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-red-500 opacity-80 group-hover:text-red-500 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-red-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span> {t("hub_ql_sys_reports") || "SYSTEM REPORTS"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("mass_update")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_dynamic_feed") || "dynamic_feed"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_mass_update") || "MASS UPDATE UTILITY"}</h3>
                   <span className="text-[8px] uppercase font-bold text-rose-400 opacity-80 group-hover:text-rose-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"></span> {t("hub_ql_bulk_actions") || "BULK ACTIONS"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("game_versions")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_settings") || "settings"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_game_versions") || "GAME MANAGEMENT"}</h3>
                   <span className="text-[8px] uppercase font-bold text-emerald-400 opacity-80 group-hover:emerald-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span> {t("hub_ql_registry_config") || "REGISTRY CONFIG"}</span>
                 </div>
               </div>
             </button>

             <button onClick={() => setTab("audit_logs")} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[1.5rem] hover:bg-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] transition-all text-left group relative overflow-hidden h-24">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
               <div className="flex items-center gap-5 h-full">
                 <div className="w-12 h-12 rounded-xl theme-glass-inner border border-white/10 flex items-center justify-center shrink-0 group-hover:border-[var(--accent)]/30 transition-colors">
                   <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_history") || "history"}</span>
                 </div>
                 <div className="flex flex-col gap-1 flex-1 min-w-0">
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{t("hub_ql_audit_logs") || "AUDIT LOGS"}</h3>
                   <span className="text-[8px] uppercase font-bold text-indigo-400 opacity-80 group-hover:text-indigo-300 tracking-widest flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"></span> {t("hub_ql_system_history") || "SYSTEM HISTORY"}</span>
                 </div>
               </div>
             </button>
                     </div>
        </div>
      </div>
    </div>
  );
}

export function WayfinderComms() {
  const { t } = useLexicon();
  const [commsInput, setCommsInput] = useState("");
  const [commsMessages, setCommsMessages] = useState<any[]>([]);
  const [editingCommId, setEditingCommId] = useState<number | string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    const fetchComms = async () => {
      const { data, error } = await supabase.from('wayfinder_comms').select('*').order('created_at', { ascending: false }).limit(50);
      if (data) {
        const senderIds = Array.from(new Set(data.map(m => m.sender_id).filter(id => id)));
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', senderIds);
          const profileMap: any = {};
          profiles?.forEach((p: any) => profileMap[p.id] = p.username || p.id.substring(0,8));
          
          const enriched = data.map(m => ({
            ...m,
            sender_name: profileMap[m.sender_id] || m.sender_id.substring(0,8)
          }));
          setCommsMessages(enriched.reverse());
        } else {
          setCommsMessages(data.reverse());
        }
      }
    };
    fetchComms();

    const commsSub = supabase.channel('wayfinder-comms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wayfinder_comms' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const fetchSender = async () => {
            const { data: profile } = await supabase.from('profiles').select('username').eq('id', payload.new.sender_id).single();
            const name = profile?.username || payload.new.sender_id.substring(0,8);
            setCommsMessages(prev => [...prev, { ...payload.new, sender_name: name }]);
          };
          fetchSender();
        }
        if (payload.eventType === 'UPDATE') setCommsMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        if (payload.eventType === 'DELETE') setCommsMessages(prev => prev.filter(m => m.id !== payload.old.id));
      }).subscribe();

    return () => { supabase.removeChannel(commsSub); };
  }, []);

  const sendComm = async () => {
    if (!commsInput.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    if (editingCommId) {
      const { error } = await supabase.from('wayfinder_comms').update({ message: commsInput.trim() }).eq('id', editingCommId);
      if (error) useStore.getState().pushStatus(t("sa_comms_update_error") || "Update Error:" + " " + error.message);
      setEditingCommId(null);
    } else {
      const { error } = await supabase.from('wayfinder_comms').insert({
        sender_id: user.id,
        message: commsInput.trim()
      });
      if (error) useStore.getState().pushStatus(t("sa_comms_insert_error") || "Insert Error:" + " " + error.message);
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    const { error } = await supabase.from('wayfinder_comms').delete().eq('id', id);
    if (error) useStore.getState().pushStatus(t("sa_comms_delete_error") || "Delete Error:" + " " + error.message);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
      <div className="absolute top-[-100px] left-[-100px] w-96 h-96 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none z-0" />
      
      <div className="flex-1 bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border border-white/5 rounded-[2.5rem] flex flex-col mb-6 overflow-y-auto p-8 gap-5 custom-scrollbar shadow-inner relative z-10 backdrop-blur-[3px]">
         {commsMessages.length === 0 ? (
           <div className="flex-1 flex flex-col items-center justify-center opacity-40">
             <span className="text-5xl mb-6 grayscale drop-shadow-2xl">{t("emote_broadcast")}</span>
             <span className="text-xs font-black text-[var(--text)] uppercase tracking-[0.3em] text-center px-8 leading-loose opacity-70">
               {t("hub_comms_offline") || "Secure transmission channel currently offline."}<br/>{t("hub_comms_handshake") || "Awaiting Cryptographic Handshake."}
             </span>
           </div>
         ) : (
           commsMessages.map((msg, i) => (
             <div key={msg.id || i} className="flex flex-col gap-3 text-left theme-glass-inner p-6 rounded-[2rem] animate-in fade-in slide-in-from-bottom-4 border border-white/5 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all shadow-lg group relative overflow-hidden">
               <div className="absolute left-0 top-0 bottom-1 w-1 theme-bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
               <div className="flex justify-between items-center opacity-70 mb-1">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] flex items-center gap-2">
                   <span className="w-4 h-4 rounded flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[8px]">{(msg.sender_name || msg.sender_id)?.charAt(0)}</span>
                   {msg.sender_name || msg.sender_id?.substring(0,8)}
                 </span>
                 <div className="flex gap-4 items-center">
                   {currentUserId === msg.sender_id && (
                       <div className="flex gap-3 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingCommId(msg.id); setCommsInput(msg.message); }} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-accent transition-colors hover:scale-110">{t("emote_edit") || "EDIT"}</button>
                        <button onClick={() => deleteComm(msg.id)} className="text-[9px] uppercase font-black tracking-widest hover:theme-text-danger transition-colors hover:scale-110">{t("emote_close")}</button>
                      </div>
                   )}


                   <span className="text-[9px] font-black tracking-widest text-[var(--subtext)] opacity-60">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                 </div>
               </div>
               <p className="text-sm font-medium text-[var(--text)] leading-relaxed opacity-90 pl-1">{msg.message}</p>
             </div>
           ))
         )}
      </div>
      
      <div className="flex gap-3 relative z-10 bg-black/20 p-2.5 rounded-[2rem] border border-white/5 backdrop-blur-md shadow-2xl">
        <input 
          type="text" 
          value={commsInput}
          onChange={(e) => setCommsInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendComm()}
          className="flex-1 bg-transparent rounded-2xl px-6 py-3 text-[var(--text)] text-sm font-bold focus:outline-none transition-all placeholder-[color-mix(in_srgb,var(--subtext)_50%,transparent)]" 
          placeholder={t("sa_comms_placeholder") || "Transmit priority message to Wayfinders..."} 
        />
        <button 
          onClick={sendComm}
          disabled={!commsInput.trim()}
          className="px-10 py-4 theme-bg-accent text-[var(--bg)] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] shrink-0"
        >
          {editingCommId ? t("sa_comms_btn_update") || "Update" : t("sa_comms_btn_send") || "Send"}
        </button>
      </div>
    </div>
  );
}


function MassUpdateOversight() {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterGameVersions, setFilterGameVersions] = useState<string[]>([]);

  // Mass fields
  const [massStatus, setMassStatus] = useState<string>("");
  const [massGameVersions, setMassGameVersions] = useState<string[]>([]);
  const [massCategory, setMassCategory] = useState<string>("");
  const [massSubCategory, setMassSubCategory] = useState<string>("");
  const [massCompliance, setMassCompliance] = useState<string>("");
  const [massConflictId, setMassConflictId] = useState<any>(null);

  const [editReason, setEditReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, status, category_override, sub_type, compliance_tier, compatible_versions, master_author').order('name'));
    if (data) setMods(data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const executeMassUpdate = async () => {
    if (selectedIds.size === 0 || !editReason.trim()) return;
    setIsUpdating(true);
    
    const updates: any = {};
    if (massStatus) updates.status = massStatus;
    if (massCategory) updates.category_override = massCategory;
    if (massSubCategory) updates.sub_type = massSubCategory;
    if (massCompliance) updates.compliance_tier = parseInt(massCompliance);
    if (massGameVersions.length > 0) updates.compatible_versions = massGameVersions;
    
    updates.updated_at = new Date().toISOString();
    
    try {
      for (const id of Array.from(selectedIds)) {
        let modUpdates = { ...updates };
        if (massConflictId) {
           const mod = mods.find(m => m.id === id);
           if (mod) {
              await supabase.from('logical_conflicts').insert([{ mod_a_id: id, mod_b_id: massConflictId.id, mod_a: mod.name, mod_b: massConflictId.name, severity_rank: 4 }]);
           }
        }
        
        if (Object.keys(modUpdates).length > 0) {
          await supabase.from('mods').update(modUpdates).eq('id', id);
        }
      }
      
      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;
      
      let actionStr = `Mass Updated ${selectedIds.size} Artifacts: `;
      const changes = [];
      if (massStatus) changes.push(`Status->${massStatus}`);
      if (massCategory) changes.push(`Cat->${massCategory}`);
      if (massCompliance) changes.push(`Tier->${massCompliance}`);
      if (massGameVersions.length > 0) changes.push(`Versions Modified`);
      if (massConflictId) changes.push(`Added Conflict`);
      actionStr += changes.join(", ");
      
      await supabase.from('audit_logs').insert({
         action: actionStr,
         target_table: 'mods',
         target_name: 'BATCH OPERATION',
         actor_id: myId,
         reason: editReason.trim()
      });
      
      // Reset mass fields & reload
      setMassStatus(""); setMassCategory(""); setMassSubCategory(""); setMassCompliance(""); setMassGameVersions([]); setMassConflictId(null); setEditReason("");
      setSelectedIds(new Set());
      await loadData();
      useStore.getState().pushStatus("Mass update completed successfully.");
    } catch (e) {
      console.error(e);
      useStore.getState().pushStatus("Mass update failed.");
    }
    setIsUpdating(false);
  };

  const filteredMods = mods.filter(m => {
    if (showOnlySelected && !selectedIds.has(m.id)) return false;
    if (filterCategory && m.category_override !== filterCategory) return false;
    if (filterGameVersions.length > 0) {
      if (!m.compatible_versions || m.compatible_versions.length === 0) return false;
      const hasMatch = filterGameVersions.some(v => m.compatible_versions.includes(v));
      if (!hasMatch) return false;
    }
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    setVisibleCount(100);
  }, [searchQuery, showOnlySelected, filterCategory, filterGameVersions]);

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedIds);
    let allSelected = true;
    for (const m of filteredMods) {
      if (!next.has(m.id)) allSelected = false;
    }
    if (allSelected) {
      filteredMods.forEach(m => next.delete(m.id));
    } else {
      filteredMods.forEach(m => next.add(m.id));
    }
    setSelectedIds(next);
  };

  const hasAnyAction = !!(massStatus || massCategory || massCompliance || massGameVersions.length > 0 || massConflictId);

  return (
    <div className="flex flex-col w-full relative h-full">
      
      {/* GLOBAL HEADER */}
      <div className="flex flex-col md:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_dynamic_feed") || "dynamic_feed"}</span>
          </div>
          <span className="truncate">{t("mass_update_title") || "Mass Update Utility"}</span>
        </h2>
        
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex flex-col items-end">
             <span className="text-2xl font-black theme-text-accent drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] leading-none">{selectedIds.size}</span>
             <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{t("sa_artifacts_selected") || "ARTIFACTS SELECTED"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in h-full w-full mx-auto p-6 pt-6">
        
        {/* LEFT PANEL: SELECTION & SEARCH */}
        <div className="flex-1 min-w-0 theme-glass-panel rounded-3xl flex flex-col h-[850px] border border-white/5 overflow-hidden shadow-inner">
          {/* Sticky Header */}
          <div className="p-6 border-b border-white/5 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-xl z-20 flex flex-col gap-4">
             
             <div className="flex flex-wrap gap-4 items-center">
               <div className="relative flex-1 min-w-[200px]">
                 <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
                 <input 
                   type="text" 
                   placeholder={t("sa_comp_search_mods") || "Search Artifacts..."} 
                   value={searchQuery} 
                   onChange={e => setSearchQuery(e.target.value)} 
                   className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                 />
               </div>
               <div className="w-48 z-40 shrink-0">
                 <CustomDropdown disableTint={true}   
                   value={filterCategory} 
                   onChange={(v: string[]) => setFilterCategory(v[0])} 
                   options={[
                     { id: "", label: "ALL CATEGORIES" },
                     { id: "Script", label: "SCRIPT" },
                     { id: "Core", label: "CORE" },
                     { id: "Tuning", label: "TUNING" },
                     { id: "CC", label: "CUSTOM CONTENT" }
                   ]}
                   placeholder="FILTER CATEGORY"
                 />
               </div>
               <button 
                 onClick={() => setShowOnlySelected(!showOnlySelected)} 
                 className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm shrink-0 ${showOnlySelected ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]" : "theme-glass-inner border-white/10 text-[var(--text)] hover:bg-white/5 hover:theme-border-accent"}`}
               >
                 {showOnlySelected ? "SHOWING SELECTED" : "SHOW SELECTED ONLY"}
               </button>
               <button onClick={handleSelectAllFiltered} className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all theme-glass-inner border-white/10 text-[var(--text)] hover:bg-white/5 hover:theme-border-accent shrink-0">
                 TOGGLE ALL VISIBLE
               </button>
             </div>
             
             <div className="w-full z-30 relative mt-1">
                <GameVersionMultiSelect selectedVersions={filterGameVersions} onChange={setFilterGameVersions} />
             </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 p-6 bg-black/10">
            {loading ? (
               <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest animate-pulse">{t("sa_loading_registry") || "Loading Registry..."}</div>
            ) : (
              <>
                {filteredMods.slice(0, visibleCount).map(m => (
              <div 
                key={m.id} 
                onClick={() => handleToggle(m.id)}
                className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center gap-5 border shadow-sm group ${selectedIds.has(m.id) ? "theme-border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] scale-[1.01]" : "border-white/5 theme-glass-inner hover:theme-border-accent hover:bg-white/5"}`}
              >
                <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedIds.has(m.id) ? "theme-bg-accent theme-border-accent text-[var(--bg)] shadow-[0_0_10px_var(--accent)]" : "border-white/20 bg-black/20 group-hover:border-white/40"}`}>
                  {selectedIds.has(m.id) && <span className="text-sm font-black">{t("emote_check")}</span>}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-sm font-black uppercase truncate leading-tight transition-colors ${selectedIds.has(m.id) ? "theme-text-accent drop-shadow-md" : "text-[var(--text)] group-hover:text-white"}`}>{m.name}</span>
                  <span className="text-[9px] font-bold uppercase text-[var(--subtext)] opacity-60 mt-1 truncate">
                    {m.master_author ? `${m.master_author} | ` : ""}STATUS: {(m.status || "UNVERIFIED").replace(/_/g, ' ')} | TIER: {m.compliance_tier}
                  </span>
                </div>
              </div>
            ))}
            
            {filteredMods.length > visibleCount && (
              <button 
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] font-black uppercase tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "LOAD MORE"} ({visibleCount} / {filteredMods.length})
              </button>
            )}
            
            {!loading && filteredMods.length === 0 && (
               <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest">{t("sa_no_artifacts") || "No artifacts found."}</div>
            )}
            </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: BATCH ACTIONS CONTROL TERMINAL */}
        <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0 h-[850px]">
          <div className="theme-glass-panel rounded-3xl p-8 border border-white/5 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] flex-1 overflow-hidden relative">
             
             <div className="absolute top-0 right-0 w-64 h-64 bg-red-500 opacity-5 blur-[100px] pointer-events-none" />
             <div className="absolute bottom-0 left-0 w-64 h-64 theme-bg-accent opacity-5 blur-[100px] pointer-events-none" />

             <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-6 z-10 shrink-0">
               <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_var(--danger)]" />
               <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-widest italic">{t("mass_update_apply") || "Apply Changes"}</h3>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-2 z-10">
                 
                 {/* Terminal Block Without Outer Borders */}
                 <div className="flex flex-col gap-2 relative z-50">
                    <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massStatus ? 'theme-text-accent drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                       {t("mass_status_protocol") || "Status Protocol"}
                    </label>
                    <CustomDropdown disableTint={true}   
                      value={massStatus} 
                      onChange={(v: string[]) => setMassStatus(v[0])} 
                      options={[
                        { id: "", label: "-- LEAVE UNCHANGED --" },
                        { id: "verified", label: "VERIFIED" },
                        { id: "unverified", label: "UNVERIFIED" },
                        { id: "deprecated", label: "DEPRECATED" },
                        { id: "quarantined", label: "QUARANTINED" }
                      ]}
                    />
                 </div>

                 <div className="flex flex-col gap-2 relative z-40">
                    <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massCompliance ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                       {t("mass_compliance_tier") || "Compliance Tier"}
                    </label>
                    <CustomDropdown disableTint={true}   
                      value={massCompliance} 
                      onChange={(v: string[]) => setMassCompliance(v[0])} 
                      options={[
                        { id: "", label: "-- LEAVE UNCHANGED --" },
                        { id: "0", label: "CLEAN (TIER 0)" },
                        { id: "1", label: "NSFW 18+ (TIER 1)" },
                        { id: "2", label: "EXPLICIT (TIER 2)" },
                        { id: "3", label: "MALWARE (TIER 3)" }
                      ]}
                    />
                 </div>

                 <div className="flex flex-col gap-2 relative z-30">
                    <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massCategory ? 'theme-text-warning drop-shadow-[0_0_5px_rgba(var(--warning-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                       {t("mass_category_override") || "Category Override"}
                    </label>
                    <CustomDropdown disableTint={true}   
                      value={massCategory} 
                      onChange={(v: string[]) => setMassCategory(v[0])} 
                      options={[
                        { id: "", label: "-- LEAVE UNCHANGED --" },
                        { id: "Script", label: "SCRIPT" },
                        { id: "Core", label: "CORE" },
                        { id: "Tuning", label: "TUNING" },
                        { id: "CC", label: "CUSTOM CONTENT" }
                      ]}
                    />
                 </div>

                 <div className="flex flex-col gap-2 relative z-20">
                    <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massGameVersions.length > 0 ? 'theme-text-accent drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                       REPLACE GAME VERSIONS
                    </label>
                    <GameVersionMultiSelect selectedVersions={massGameVersions} onChange={setMassGameVersions} />
                 </div>

                 <div className="flex flex-col gap-2 relative z-10">
                    <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massConflictId ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                       {t("mass_assign_conflict") || "Assign Conflict"}
                    </label>
                    <ModSearchDropdown 
                      placeholder="Select Artifact to Conflict..." 
                      selectedItem={massConflictId} 
                      onSelect={setMassConflictId} 
                      onClear={() => setMassConflictId(null)} 
                      modList={mods} 
                    />
                 </div>

             </div>

             <div className="mt-6 pt-6 border-t border-white/10 shrink-0 flex flex-col gap-4 z-10">
               <div className="flex flex-col gap-2">
                 <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_var(--danger)]"></span>
                    {t("sa_batch_reason_req") || "BATCH REASON (REQUIRED)"}
                 </label>
                 <textarea 
                   value={editReason} 
                   onChange={e => setEditReason(e.target.value)} 
                   placeholder={t("sa_reason_update") || "Reason for mass update..."} 
                   className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-danger transition-all border border-white/5" 
                 />
               </div>

               <button 
                 disabled={isUpdating || selectedIds.size === 0 || !hasAnyAction || !editReason.trim()}
                 onClick={executeMassUpdate}
                 className={`!w-full !rounded-[2rem] !py-5 ${standardSuccessButtonClass}`}
               >
                 {isUpdating ? "EXECUTING..." : "INITIATE MASS UPDATE"}
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function GameManagementOversight() {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<'versions'|'dlc'>('versions');

  // --- Global State ---
  const [versions, setVersions] = useState<any[]>([]);
  const [versionSearch, setVersionSearch] = useState("");
  const [dlcs, setDlcs] = useState<any[]>([]);
  const [dlcSearch, setDlcSearch] = useState("");
  const [dlcTypeFilter, setDlcTypeFilter] = useState("ALL");

  // --- Side Panel State ---
  const [sidePanelMode, setSidePanelMode] = useState<"add_version"|"edit_version"|"delete_version"|"add_dlc"|"edit_dlc"|"delete_dlc"|null>(null);
  const [panelTarget, setPanelTarget] = useState<any>(null);
  const [panelInput1, setPanelInput1] = useState("");
  const [panelInput2, setPanelInput2] = useState("");
  const [panelInput3, setPanelInput3] = useState("EP");
  const [panelInput4, setPanelInput4] = useState("");
  const [panelReason, setPanelReason] = useState("");
  const [isPanelSubmitting, setIsPanelSubmitting] = useState(false);

  const fetchVersions = async () => {
    const { data } = await supabase.from('game_versions').select('*').order('version', { ascending: false });
    if (data) setVersions(data);
  };

  const fetchDlcs = async () => {
    const { data } = await supabase.from('dlc_registry').select('*').order('id', { ascending: true });
    if (data) setDlcs(data);
  };

  useEffect(() => {
    fetchVersions();
    fetchDlcs();
  }, []);

  const openPanel = (mode: string, target: any = null) => {
    setSidePanelMode(mode as any);
    setPanelTarget(target);
    setPanelReason("");
    if (mode === 'add_version') {
        setPanelInput1("");
    } else if (mode === 'edit_version') {
        setPanelInput1(target);
    } else if (mode === 'add_dlc') {
        setPanelInput1("");
        setPanelInput2("");
        setPanelInput3("EP");
    } else if (mode === 'edit_dlc') {
        setPanelInput1(target.id);
        setPanelInput2(target.name);
        setPanelInput3(target.type || "EP");
    }
  };

  const handlePanelCommit = async (isDelete: boolean = false) => {
    setIsPanelSubmitting(true);
    const userRes = await supabase.auth.getUser();

    const resolvedType = panelInput3 === "CUSTOM" ? panelInput4 : panelInput3;

    if (isDelete) {
        if (sidePanelMode === 'edit_version') {
            await supabase.from('game_versions').delete().eq('version', panelTarget);
            await supabase.from('audit_logs').insert({
               action: `Deleted Game Version ${panelTarget}`, target_table: 'game_versions', target_name: panelTarget, actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Deleted Game Version ${panelTarget}`, "success");
            fetchVersions();
        } else if (sidePanelMode === 'edit_dlc') {
            await supabase.from('dlc_registry').delete().eq('id', panelTarget.id);
            await loadDLCMap();
            await supabase.from('audit_logs').insert({
               action: `Deleted DLC Pack ${panelTarget.id}`, target_table: 'dlc_registry', target_name: panelTarget.id, actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Deleted DLC Pack ${panelTarget.id}`, "success");
            fetchDlcs();
        }
    } else {
        if (sidePanelMode === 'add_version') {
            await supabase.from('game_versions').insert([{ version: panelInput1 }]);
            await supabase.from('audit_logs').insert({
               action: `Added Game Version ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Added Game Version ${panelInput1}`, "success");
            fetchVersions();
        } else if (sidePanelMode === 'edit_version') {
            await supabase.from('game_versions').update({ version: panelInput1 }).eq('version', panelTarget);
            await supabase.from('audit_logs').insert({
               action: `Edited Game Version ${panelTarget} -> ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Edited Game Version ${panelTarget} -> ${panelInput1}`, "success");
            fetchVersions();
        } else if (sidePanelMode === 'add_dlc') {
            await supabase.from('dlc_registry').insert([{ id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType }]);
            await loadDLCMap();
            await supabase.from('audit_logs').insert({
               action: `Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, "success");
            fetchDlcs();
        } else if (sidePanelMode === 'edit_dlc') {
            await supabase.from('dlc_registry').update({ id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType }).eq('id', panelTarget.id);
            await loadDLCMap();
            await supabase.from('audit_logs').insert({
               action: `Edited DLC Pack [${panelTarget.id}] -> [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
            });
            useStore.getState().pushStatus(`Edited DLC Pack [${panelTarget.id}]`, "success");
            fetchDlcs();
        }
    }

    setIsPanelSubmitting(false);
    setSidePanelMode(null);
  };

  const filteredDlcs = dlcs.filter(d => 
     (dlcTypeFilter === "ALL" || d.type === dlcTypeFilter) &&
     (!dlcSearch || 
     d.id.toLowerCase().includes(dlcSearch.toLowerCase()) || 
     d.name.toLowerCase().includes(dlcSearch.toLowerCase()))
  );

  const filteredVersions = versions.filter(v => 
     !versionSearch || v.version.toLowerCase().includes(versionSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex flex-col lg:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_settings") || "settings"}</span>
          </div>
          <span className="truncate">{t("sa_title_game_versions") || "Game Management"}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              type="text" 
              placeholder={activeTab === 'versions' ? "Search Patches..." : "Search DLC..."} 
              value={activeTab === 'versions' ? versionSearch : dlcSearch} 
              onChange={e => activeTab === 'versions' ? setVersionSearch(e.target.value) : setDlcSearch(e.target.value)} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          {activeTab === 'dlc' && (
             <div className="w-48 z-40 shrink-0">
               <CustomDropdown disableTint={true}
                 value={dlcTypeFilter}
                 onChange={(v: string[]) => setDlcTypeFilter(v[0])}
                 options={["ALL", ...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: x === "ALL" ? "ALL TYPES" : x }))}
                 placeholder={t("sa_gm_type_filter_placeholder") || "Filter Type..."}
               />
             </div>
          )}

          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 h-12 shrink-0 z-40">
            <button 
              onClick={() => setActiveTab("versions")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeTab === 'versions' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_game_versions") || "Patch Versions"}
            </button>
            <button 
              onClick={() => setActiveTab("dlc")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeTab === 'dlc' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_dlc_registry") || "DLC Registry"}
            </button>
          </div>

          <button 
             onClick={() => openPanel(activeTab === 'versions' ? 'add_version' : 'add_dlc')} 
             className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:rotate-90 transition-transform duration-500">{t("ui_icon_add") || "add"}</span>
            {activeTab === 'versions' ? "REGISTER PATCH" : `REGISTER DLC`}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-8 animate-in fade-in">

        {activeTab === 'versions' && (
          <>

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 w-full">
               {filteredVersions.map(v => (
                  <div key={v.version} onClick={() => openPanel('edit_version', v.version)} className="flex flex-col justify-between p-6 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[140px] cursor-pointer hover:-translate-y-1.5">
                     <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                     
                     <div className="flex justify-between items-start w-full relative z-10 mb-4">
                       <div className="flex items-start gap-4">
                         <div className="w-14 h-14 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                           <span className="material-symbols-outlined !text-[28px] theme-text-accent drop-shadow-md">{t("ui_icon_gamepad") || "gamepad"}</span>
                         </div>
                         <div className="flex flex-col pt-1">
                           <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">{t("sa_patch_release") || "PATCH RELEASE"}</span>
                           <span className="text-xl font-mono font-black text-[var(--text)] group-hover:theme-text-accent transition-colors truncate drop-shadow-sm">{v.version}</span>
                         </div>
                       </div>
                     </div>
                     
                     <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sa_release_date") || "RELEASED"}</span>
                           <span className="text-xs font-bold text-[var(--text)] opacity-90 mt-1">
                             {v.release_date ? new Date(v.release_date).toLocaleDateString() : (v.created_at ? new Date(v.created_at).toLocaleDateString() : "UNKNOWN")}
                           </span>
                        </div>
                        
                        <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                            VIEW <span className="text-lg leading-none">&rarr;</span>
                        </button>
                     </div>
                  </div>
               ))}
               {filteredVersions.length === 0 && <div className="col-span-full py-12 text-center text-xs font-black opacity-30 uppercase tracking-widest">{t("sa_no_versions") || "NO VERSIONS FOUND"}</div>}
            </div>
          </>
        )}

        {activeTab === 'dlc' && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 w-full">
               {filteredDlcs.map(d => (
                  <div key={d.id} onClick={() => openPanel('edit_dlc', d)} className="flex flex-col justify-between p-6 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[140px] cursor-pointer hover:-translate-y-1.5">
                     <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                     
                     <div className="flex justify-between items-start w-full relative z-10 mb-2">
                       <div className="flex items-start gap-4 w-full truncate">
                         <div className="w-14 h-14 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-transparent pointer-events-none" />
                            <span className="relative z-10 text-sm font-black theme-text-accent drop-shadow-md tracking-wider">{d.id}</span>
                         </div>
                         <div className="flex flex-col truncate pt-1 flex-1">
                           <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">
                              {d.type ? (t(`sa_dlc_type_${d.type.toLowerCase().replace(/ /g, '_')}`) || `${d.type}PACK`) : "UNKNOWN"}
                           </span>
                           <span className="text-lg font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm pr-4">{d.name}</span>
                         </div>
                       </div>
                     </div>
                     
                     <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                        <div className="flex flex-col items-start gap-0.5">
                           <span className="text-[8px] font-black tracking-widest text-[var(--subtext)] opacity-50 uppercase">{t("sa_released") || "RELEASED"}</span>
                           <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-[var(--text)] opacity-70 group-hover:opacity-100 transition-opacity">
                             {d.release_date ? new Date(d.release_date).toLocaleDateString() : d.id}
                           </span>
                        </div>
                        <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                            VIEW <span className="text-lg leading-none">&rarr;</span>
                        </button>
                     </div>
                  </div>
               ))}
               {filteredDlcs.length === 0 && <div className="col-span-full py-12 text-center text-xs font-black opacity-30 uppercase tracking-widest">{t("sa_no_dlc") || "NO DLC PACKS FOUND"}</div>}
            </div>
          </>
        )}

      </div>

      <SidePanel
        isOpen={!!sidePanelMode}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === 'add_version' ? (t("sa_btn_register_patch_naked") || "REGISTER PATCH") :
          sidePanelMode === 'edit_version' ? (t("sa_panel_edit_patch") || "EDIT PATCH") :
          sidePanelMode === 'edit_dlc' ? (t("sa_panel_edit_dlc") || "EDIT DLC") : 
          (t("sa_panel_add_dlc") || "REGISTER DLC")
        }
        subtitle={sidePanelMode?.includes('version') ? (t("sa_panel_sub_version") || "GAME VERSION REGISTRY") : (t("sa_panel_sub_dlc") || "DLC REGISTRY")}
        icon={sidePanelMode?.includes('version') ? "gamepad" : "extension"}
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            {(sidePanelMode === 'add_version' || sidePanelMode === 'add_dlc') && (
              <button onClick={() => setSidePanelMode(null)} className={standardButtonClass}>
                {t("shared_cancel") || "CANCEL"}
              </button>
            )}
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && (
              <button 
                disabled={!panelReason.trim() || isPanelSubmitting}
                onClick={() => handlePanelCommit(true)}
                className={standardDangerButtonClass}
              >
                {isPanelSubmitting ? t("ui_btn_processing") || "PROCESSING..." : (t("ui_btn_delete") || "DELETE")}
              </button>
            )}
            <button 
              onClick={() => handlePanelCommit(false)}
              disabled={
                isPanelSubmitting || 
                !panelReason.trim() || 
                ((sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && !panelInput1.trim()) ||
                ((sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (!panelInput1.trim() || !panelInput2.trim()))
              }
              className={standardSuccessButtonClass}
            >
              {isPanelSubmitting ? (t("ui_btn_processing") || "PROCESSING...") : (t("ui_btn_commit") || "COMMIT CHANGES")}
            </button>
          </div>
        }
      >
        <div className="p-8">
          <div className="flex flex-col gap-6">
             {/* Read-Only display if editing */}
             {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && panelTarget && (
               <div className="p-4 theme-glass-inner rounded-xl border border-white/5 opacity-80">
                 <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-1">{t("hub_ql_targeting") || "TARGETING"}</p>
                 <p className="text-sm font-bold theme-text-accent">{panelTarget?.name || panelTarget}</p>
               </div>
             )}
             
             {/* Dynamic Form Inputs */}
             {(sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && (
               <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                 <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                 <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2 relative z-10">
                   <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_info") || "info"}</span>
                   {t("sa_metadata") || "METADATA"}
                 </h4>
                 <div className="flex flex-col gap-2 relative z-10">
                   <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_game_version") || "PATCH VERSION"}</label>
                   <div className="relative">
                     <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("ui_icon_gamepad") || "gamepad"}</span>
                     <input 
                       value={panelInput1} 
                       onChange={e => setPanelInput1(e.target.value)} 
                       placeholder={t("ph_game_version") || "e.g. 1.108.329.1020"} 
                       className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 bg-transparent" 
                     />
                   </div>
                 </div>
               </div>
             )}

             {(sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (
               <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                 <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                 <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2 relative z-10">
                   <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_extension") || "extension"}</span>
                   {t("sa_dlc_metadata") || "DLC METADATA"}
                 </h4>
                 
                 <div className="flex flex-col gap-2 relative z-50">
                   <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_dlc_id_code") || "DLC ID CODE"}</label>
                   <div className="relative">
                     <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("ui_icon_fingerprint") || "fingerprint"}</span>
                     <input 
                       value={panelInput1} 
                       onChange={e => setPanelInput1(e.target.value)} 
                       placeholder={t("ph_pack_code") || "e.g. EP18"} 
                       className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-transparent" 
                     />
                   </div>
                 </div>

                 <div className="flex flex-col gap-2 relative z-40">
                   <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_pack_type") || "PACK TYPE"}</label>
                   <CustomDropdown disableTint={true}   
                     value={panelInput3} 
                     onChange={(v: string[]) => setPanelInput3(v[0])} 
                     options={[
                       ...[...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: t(`sa_dlc_type_${x.toLowerCase().replace(/ /g, '_')}`) || `${x} PACK` })),
                       { id: "CUSTOM", label: "+ CUSTOM TYPE" }
                     ]}
                     placeholder="Select Type..." 
                   />
                 </div>

                 {panelInput3 === "CUSTOM" && (
                   <div className="flex flex-col gap-2 relative z-30 animate-in fade-in slide-in-from-top-2">
                     <label className="text-[9px] font-black theme-text-accent uppercase tracking-widest ml-2 flex items-center gap-2 drop-shadow-md">
                        <span className="material-symbols-outlined !text-[12px]">{t("ui_icon_edit") || "edit"}</span>
                        NEW PACK TYPE
                     </label>
                     <div className="relative">
                       <input 
                         value={panelInput4} 
                         onChange={e => setPanelInput4(e.target.value.toUpperCase())} 
                         placeholder={t("ph_pack_type") || "e.g. BUNDLE"} 
                         className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]" 
                       />
                     </div>
                   </div>
                 )}

                 <div className="flex flex-col gap-2 relative z-30">
                   <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("sa_pack_name") || "PACK NAME"}</label>
                   <div className="relative">
                     <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("ui_icon_badge") || "badge"}</span>
                     <input 
                       value={panelInput2} 
                       onChange={e => setPanelInput2(e.target.value)} 
                       placeholder={t("ph_pack_name") || "e.g. Dream Home Decorator"} 
                       className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-transparent" 
                     />
                   </div>
                 </div>
               </div>
             )}


             {/* Mandatory Reason */}
             <div className="flex flex-col gap-2 mt-4">
                 <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_var(--danger)]"></span>
                    {t("sa_audit_reason_req") || "AUDIT LOG REASON (REQUIRED)"}
                 </label>
                 <textarea 
                   value={panelReason} 
                   onChange={e => setPanelReason(e.target.value)} 
                   placeholder={t("sa_mutation_reason") || "Enter reason for database mutation..."} 
                   className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none focus:theme-border-danger transition-all border border-white/5" 
                 />
             </div>
             
          </div>
        </div>
      </SidePanel>
    </div>
  );
}

export function DefconSidePanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [confirmMode, setConfirmMode] = useState<"execute" | "standDown" | null>(null);
  const setConfirmDialog = useModalStore((state: any) => state.setConfirmDialog);

  const fetchStatus = async () => {
    setLoading(true);
    const { data } = await supabase.from('global_network_status').select('*').single();
    if (data) setStatus(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setActionStatus("");
      setConfirmMode(null);
    }
  }, [isOpen]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (confirmMode) {
      timeout = setTimeout(() => {
        setConfirmMode(null);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [confirmMode]);

  const executeDefcon = async () => {
    setSubmitting(true);
    setActionStatus("Executing Lock Down...");
    const userRes = await supabase.auth.getUser();
    
    await supabase.from('global_network_status').update({ defcon_level: 1, message: "EMERGENCY: SYSTEM LOCKDOWN", status_message: "Global DEFCON 1 override active. Patch imminent.", updated_at: new Date().toISOString() }).eq('id', 1);
    await supabase.from('audit_logs').insert({
      action: "Triggered Global DEFCON 1 Override", target_table: "global_network_status", target_name: "GLOBAL NETWORK", actor_id: userRes.data.user?.id, reason: "Game Patch Imminent Override"
    });
    
    await fetchStatus();
    setActionStatus("LOCK DOWN EXECUTED.");
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 2000);
  };

  const standDown = async () => {
    setSubmitting(true);
    setActionStatus("Lifting Lock Down...");
    const userRes = await supabase.auth.getUser();
    
    await supabase.from('global_network_status').update({ defcon_level: 5, message: "System Normal", status_message: "Network Secure. All systems nominal.", updated_at: new Date().toISOString() }).eq('id', 1);
    await supabase.from('audit_logs').insert({
      action: "Stood Down Global DEFCON Alert", target_table: "global_network_status", target_name: "GLOBAL NETWORK", actor_id: userRes.data.user?.id, reason: "Game Patch Concluded"
    });
    
    await fetchStatus();
    setActionStatus("STAND DOWN EXECUTED.");
    setSubmitting(false);
    setConfirmMode(null);
    setTimeout(onClose, 2000);
  };



  return (
    <SidePanel 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t("sa_defcon_title") || "DEFCON OVERRIDE"} 
      subtitle={t("sa_defcon_auth_req") || "OVERSIGHT AUTHORIZATION REQUIRED"}
      icon={status?.defcon_level === 1 ? 'warning' : 'security'}
      iconColorClass={status?.defcon_level === 1 ? "text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"}
      widthClass="w-[600px]"
    >
      <div className="flex flex-col gap-6 h-full p-8 animate-in fade-in duration-500 relative">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50 z-0"></div>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50 relative z-10">
            <span className="material-symbols-outlined animate-spin text-4xl text-amber-500">{t("ui_icon_sync") || "sync"}</span>
            <div className="text-center font-black animate-pulse uppercase tracking-widest text-xs text-amber-500">{t("sa_defcon_accessing") || "Accessing Global Core..."}</div>
          </div>
        ) : (
          <>
            {/* Status Display Screen */}
            <div className={`rounded-[2rem] flex flex-col items-center justify-center p-10 text-center border-2 relative overflow-hidden transition-all duration-700 z-10 shadow-2xl min-h-[280px] ${status?.defcon_level === 1 ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_80px_rgba(239,68,68,0.2)]' : 'theme-glass-panel border-[var(--accent)]/20'}`}>
               
               {/* Scanline Effect - Only active during lockdown */}
               {status?.defcon_level === 1 && (
                 <>
                   <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none z-20"></div>
                   <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-[var(--text)]/10 to-transparent -translate-y-full animate-[scan_3s_ease-in-out_infinite] pointer-events-none z-20"></div>
                   <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
                   {/* Warning Stripes */}
                   <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80" />
                   <div className="absolute bottom-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(239,68,68,0.5)_10px,rgba(239,68,68,0.5)_20px)] opacity-80" />
                 </>
               )}

               <div className="flex justify-center mb-6 relative z-30">
                 <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${status?.defcon_level === 1 ? 'border-red-500/30 bg-red-500/10' : 'border-[var(--success)]/20 bg-[var(--success)]/5'} shadow-inner relative`}>
                    {status?.defcon_level === 1 && <div className="absolute inset-0 rounded-full border-4 border-red-500/50 animate-ping opacity-50"></div>}
                    {status?.defcon_level === 5 && <div className="absolute inset-0 rounded-full border border-[var(--success)]/30 animate-[spin_10s_linear_infinite] border-t-transparent border-l-transparent"></div>}
                    <span className={`material-symbols-outlined text-5xl drop-shadow-lg ${status?.defcon_level === 1 ? 'text-red-500 animate-pulse' : 'theme-text-success opacity-80'}`}>
                      {status?.defcon_level === 1 ? 'warning' : 'verified_user'}
                    </span>
                 </div>
               </div>

               <span className={`text-4xl font-black tracking-tighter relative z-30 mb-2 ${status?.defcon_level === 1 ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : 'text-[var(--text)]'}`}>
                 {status?.defcon_level === 1 ? t("sa_defcon_active") || "DEFCON 1 ACTIVE" : t("sa_defcon_normal") || "SYSTEM NORMAL"}
               </span>
               <span className={`text-[11px] font-black uppercase tracking-[0.4em] relative z-30 ${status?.defcon_level === 1 ? 'text-red-300/80' : 'theme-text-success opacity-80'}`}>
                 {status?.defcon_level === 1 ? t("sa_defcon_active_sub") || "VAULT LOCKDOWN ENGAGED ACROSS ALL CLIENTS" : t("sa_defcon_normal_sub") || "NO EMERGENCY PATCH DETECTED"}
               </span>
               
               {/* Simulated Data Readout */}
               <div className="flex gap-4 mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full justify-center relative z-30">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("sa_tab_network") || "NETWORK"}</span>
                    <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'LOCKED' : 'SECURE'}</span>
                  </div>
                  <div className="w-px h-6 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"></div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("sa_tab_vaults") || "VAULTS"}</span>
                    <span className={`text-[10px] font-mono font-bold ${status?.defcon_level === 1 ? 'text-red-400' : 'theme-text-success'}`}>{status?.defcon_level === 1 ? 'SEALED' : 'ONLINE'}</span>
                  </div>
               </div>
            </div>

            {/* Warning Cards */}
            <div className="flex flex-col gap-4 relative z-10">
              <div className="theme-glass-panel border-l-4 border-l-amber-500 p-5 rounded-2xl flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                  <span className="material-symbols-outlined text-amber-500 !text-xl">{t("ui_icon_info") || "info"}</span>
                </div>
                <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed pt-0.5">
                  {t("sa_defcon_warning") || "Initiating a DEFCON Override will immediately flag the Global Network status as LOCKED. All connected Sanctuary OS clients will automatically seal their vaults and run emergency backups to protect their loadouts against a surprise game update."}
                </p>
              </div>
              
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_20px,rgba(239,68,68,0.05)_20px,rgba(239,68,68,0.05)_40px)] pointer-events-none"></div>
                 <span className="material-symbols-outlined text-red-500 !text-2xl animate-pulse">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>
                 <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center max-w-[80%] leading-relaxed">
                   {t("sa_defcon_warning_red") || "Do not use unless an official game patch is actively rolling out."}
                 </p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-4 relative z-10 pt-4">
              {actionStatus && (
               <div className="text-center bg-black/40 p-4 rounded-xl border border-white/10 shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-widest theme-text-accent animate-pulse">{actionStatus}</p>
                </div>
              )}
              {status?.defcon_level === 1 ? (
                <>
                  {confirmMode === 'standDown' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black uppercase tracking-widest text-amber-500 mb-1 animate-pulse">{t("sa_confirm_sure") || "Are you absolutely sure?"}</p>
                      <button 
                        onClick={standDown} disabled={submitting}
                        className={`w-full py-6 text-xs ${standardSuccessButtonClass} !bg-amber-500/20 !border-amber-500/50 !text-amber-400 hover:!bg-amber-500/40 hover:!text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.2)]`}
                      >
                        {t("modal_btn_proceed") || "PROCEED"}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmMode('standDown')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardSuccessButtonClass}`}
                    >
                      <span className="material-symbols-outlined !text-xl">{t("ui_icon_lock_open") || "lock_open"}</span>
                      {t("sa_defcon_stand_down") || "STAND DOWN (RETURN TO NORMAL)"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {confirmMode === 'execute' ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300 relative">
                      <p className="text-[10px] text-center font-black uppercase tracking-widest text-red-500 mb-1 animate-pulse">{t("hub_defcon_confirm_execute") || "Are you absolutely sure you want to broadcast a DEFCON 1 global alert? This will immediately lock down all connected clients and force emergency backups."}</p>
                      <button 
                        onClick={executeDefcon} disabled={submitting}
                        className={`w-full py-6 text-xs ${standardDangerButtonClass} shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-[pulse_2s_ease-in-out_infinite] bg-red-600/40`}
                      >
                        PROCEED
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmMode('execute')} disabled={submitting}
                      className={`w-full py-6 text-xs ${standardDangerButtonClass} hover:bg-red-600/30 active:scale-95 transition-all shadow-[0_0_30px_rgba(220,38,38,0.2)]`}
                    >
                      <span className="material-symbols-outlined !text-xl group-hover:animate-bounce">{t("ui_icon_warning") || "warning_amber"}</span> 
                      {t("sa_defcon_execute") || "EXECUTE OVERRIDE"}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}

export function AuditLogViewer() {
  const { t } = useLexicon();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*');

    if (dateStart) {
      query = query.gte('created_at', new Date(dateStart).toISOString());
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    const { data: rawLogs, error: logError } = await query
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (logError || !rawLogs) {
       console.error("Audit Logs Error", logError);
       setLoading(false);
       return;
    }

    // 2. Extract unique actor IDs
    const actorIds = [...new Set(rawLogs.map(log => log.actor_id).filter(id => id))];
    
    // 3. Fetch profiles for those IDs
    let profileMap: Record<string, any> = {};
    if (actorIds.length > 0) {
       const { data: profiles } = await supabase
         .from('profiles')
         .select('id, username, role, is_banned, blacklist_reason')
         .in('id', actorIds);
       
       if (profiles) {
          profileMap = profiles.reduce((acc, p) => ({...acc, [p.id]: p}), {});
       }
    }

    // 4. Merge
    const mergedLogs = rawLogs.map(log => ({
       ...log,
       actor: profileMap[log.actor_id] || null
    }));

    setLogs(mergedLogs);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [dateStart, dateEnd]);

  const uniqueTargets = ["ALL", ...Array.from(new Set(logs.map(log => log.target_table).filter(Boolean)))];
  const filterOptions = uniqueTargets.map(target => ({
     id: target,
     label: target === "ALL" ? "ALL LOGS" : target.replace(/_/g, ' ').toUpperCase()
  }));

  const filteredLogs = logs.filter(log => {
     const matchesAction = filterAction === "ALL" || log.target_table === filterAction;
     const term = search.toLowerCase();
     const matchesSearch = !search || 
       log.action?.toLowerCase().includes(term) || 
       log.target_name?.toLowerCase().includes(term) || 
       log.actor?.username?.toLowerCase().includes(term) ||
       log.reason?.toLowerCase().includes(term);
     
     return matchesAction && matchesSearch;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex flex-col md:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest whitespace-nowrap flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] opacity-70 theme-text-accent drop-shadow-lg">{t("ui_icon_history") || "history"}</span>
          </div>
          <span className="truncate">{t("sa_audit_title") || "Audit Logs"}</span>
        </h2>
        
        <div className="flex gap-4 flex-1 w-full justify-end items-center flex-wrap">
          <div className="relative flex-1 max-w-[300px] min-w-[200px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              type="text" 
              placeholder={t("sa_audit_search") || "Search Logs..."} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 font-inter" 
            />
          </div>
          <div className="w-48 z-40 shrink-0">
            <CustomDropdown disableTint={true}   
              value={filterAction} 
              onChange={(v: string[]) => setFilterAction(v[0])} 
              options={filterOptions}
              placeholder="FILTER LOGS"
              searchable={true}
            />
          </div>
          <div className="flex items-center gap-2 text-[var(--subtext)] z-30">
             <div className="w-36">
               <CustomDatePicker value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder="START" />
             </div>
             <span className="opacity-50">-</span>
             <div className="w-36">
               <CustomDatePicker value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder="END" />
             </div>
          </div>
        </div>
      </div>

      <div className="p-6 w-full flex flex-col gap-6 animate-in fade-in">

         {loading ? (
            <div className="p-12 text-center text-[var(--subtext)] opacity-50 font-black uppercase tracking-widest animate-pulse">{t("sa_audit_fetching") || "Fetching Records..."}</div>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
               {filteredLogs.map(log => (
                 <div key={log.id} onClick={() => setSelectedLog(log)} className="flex flex-col justify-between p-6 rounded-[2rem] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[160px] cursor-pointer hover:-translate-y-1.5">
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="flex justify-between items-start w-full relative z-10 mb-4">
                      <div className="flex items-start gap-4 w-full">
                        <div className="w-12 h-12 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                          <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">{t("ui_icon_history") || "history"}</span>
                        </div>
                        <div className="flex flex-col pt-1 min-w-0 flex-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1 truncate">{log.target_table.replace(/_/g, ' ')}</span>
                          <span className="text-xs font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 drop-shadow-sm leading-tight">{log.action}</span>
                          {log.reason && (
                             <span className="text-[9px] font-bold text-[var(--subtext)] truncate w-full opacity-50 mt-1">{log.reason}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                       <div className="flex flex-col min-w-0 flex-1 pr-2">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sa_audit_actor") || "ACTOR:"}</span>
                          <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1 flex items-center gap-1 truncate">
                            <span className="material-symbols-outlined !text-[12px] theme-text-accent shrink-0">{t("ui_icon_person") || "person"}</span>
                            <span className="truncate">{log.actor?.username || log.actor_id.substring(0, 8)}</span>
                          </span>
                       </div>
                       
                       <div className="flex flex-col items-end shrink-0 pl-2 border-l border-white/5">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sa_sort_date") || "DATE"}</span>
                          <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1">
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                       </div>
                    </div>
                 </div>
               ))}
               {filteredLogs.length === 0 && <div className="col-span-full py-12 text-center text-xs font-black opacity-30 uppercase tracking-widest">{t("sa_audit_no_logs") || "No audit logs found"}</div>}
            </div>
         )}
      </div>

      <SidePanel 
        isOpen={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        title={t("sa_audit_details_title") || "AUDIT LOG DETAILS"} 
        subtitle={`${t("sa_audit_log_id") || "LOG ID"}: ${selectedLog?.id?.substring(0, 8).toUpperCase()}`}
        icon="history"
      >
        {selectedLog && (
          <div className="flex flex-col h-full">
             <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8 pb-32">
                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{t("sa_audit_target_table") || "TARGET TABLE:"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)]">
                     {selectedLog.target_table}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{t("sa_audit_target_key") || "TARGET KEY"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)] break-all">
                     {selectedLog.target_name || selectedLog.target_id || 'UNKNOWN'}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{t("sa_audit_action") || "ACTION"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] text-sm font-bold text-[var(--text)] break-all whitespace-pre-wrap">
                     {selectedLog.action}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)]">{t("sa_audit_reason") || "REASON:"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--danger)_10%,transparent)] text-sm font-bold text-[var(--text)] whitespace-pre-wrap">
                     {selectedLog.reason}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{t("sa_audit_timestamp") || "TIMESTAMP"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)]">
                     {new Date(selectedLog.created_at).toLocaleString()}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{t("sa_audit_actor") || "ACTOR:"}</h3>
                   <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)] flex items-center justify-between">
                     <span>
                        {selectedLog.actor ? `${selectedLog.actor.username} ${selectedLog.actor.is_banned ? '(BANNED)' : ''}` : selectedLog.actor_id}
                     </span>
                     {selectedLog.actor && (
                        <button 
                          onClick={() => setSelectedProfile(selectedLog.actor)}
                          className={`h-10 !py-0 px-6 ${standardButtonClass}`}
                        >
                          <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_person") || "person"}</span>
                          {t("sa_edit_identity") || "EDIT IDENTITY"}
                        </button>
                     )}
                   </div>
                </div>
             </div>
          </div>
        )}
      </SidePanel>

      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchLogs} isSkinny={true} />
    </div>
  );
}
