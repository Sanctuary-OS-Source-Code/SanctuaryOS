import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { ViewHeader, CustomDropdown, GameVersionMultiSelect, ModSearchDropdown } from './shared';

function TabButton({ id, label, activeTab, setTab }: any) {
  const active = activeTab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
        active 
          ? 'theme-bg-accent text-[var(--bg)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]' 
          : 'bg-transparent text-[var(--text)] hover:bg-white/5 opacity-60 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  );
}

export default function SeniorArchitect() {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full">
      <ViewHeader title={t("sa_title") || "Senior Architect Oversight"} subtitle={t("sa_subtitle") || "Global Network Administration"} />
      
      <div className="flex flex-wrap theme-glass-inner p-1.5 rounded-2xl w-fit mb-2">
        <TabButton id="command_center" label={t("sa_tab_command_screen") || "Command Screen"} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="identities" label={t("sa_tab_identities") || "Identity Matrix"} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="linker" label={t("sa_tab_linker") || "Mason Linker"} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="compliance" label={t("sa_tab_compliance") || "Compliance"} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="mass_update" label="Mass Update" activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="game_versions" label="Game Versions" activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="audit_logs" label={t("sa_tab_audit") || "Audit Logs"} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="defcon" label={t("sa_tab_defcon") || "DEFCON Override"} activeTab={activeTab} setTab={setActiveTab} />
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar pr-4 pb-48">
        {activeTab === "command_center" && <CommandScreen setTab={setActiveTab} />}
        {activeTab === "identities" && <IdentityMatrix />}
        {activeTab === "linker" && <MasonLinker />}
        {activeTab === "compliance" && <ComplianceOversight />}
        {activeTab === "mass_update" && <MassUpdateOversight />}
        {activeTab === "game_versions" && <GameVersionsRegistry />}
        {activeTab === "audit_logs" && <AuditLogViewer />}
        {activeTab === "defcon" && <DefconPanel />}
      </div>
    </div>
  );
}

function DefconPanel() {
  const { t } = useLexicon();
  const [defconLevel, setDefconLevel] = useState<number>(5);
  const [showDefconConfirmModal, setShowDefconConfirmModal] = useState(false);

  useEffect(() => {
    const fetchDefcon = async () => {
      const { data } = await supabase.from('global_network_status').select('defcon_level').eq('id', 1).single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchDefcon();
  }, []);

  const triggerDefcon = async () => {
    const newLevel = defconLevel === 1 ? 5 : 1;
    const msg = newLevel === 1 ? 'Emergency Patch Detected' : 'System Normal';
    
    setDefconLevel(newLevel);
    
    const { error } = await supabase.from('global_network_status')
      .update({ defcon_level: newLevel, message: msg })
      .eq('id', 1);
    
    if (error) {
      console.warn("Supabase RLS blocked global defcon sync.", error.message);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-12 theme-glass-panel theme-border-danger border rounded-[3rem] p-8 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden shadow-[inset_0_0_100px_rgba(255,0,0,0.1)] shrink-0">
      {defconLevel === 1 && <div className="absolute inset-0 theme-bg-danger opacity-10 animate-pulse pointer-events-none" />}
      
      <div className="w-24 h-24 rounded-full border-4 theme-border-danger flex items-center justify-center shadow-[0_0_50px_rgba(255,0,0,0.2)]">
        <span className={`text-4xl ${defconLevel === 1 ? 'animate-bounce' : ''}`}>{t("ui_icon_warning") || "⚠️"}</span>
      </div>
      
      <div className="flex flex-col gap-2 relative z-10">
        <h3 className="text-xl font-black theme-text-danger uppercase tracking-tighter drop-shadow-md">{t("hub_defcon_override_title") || "DEFCON OVERRIDE"}</h3>
        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">
          {t("hub_defcon_override_desc") || "Force global shutdown"}
        </p>
      </div>

      <button 
        onClick={() => setShowDefconConfirmModal(true)}
        className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl border relative z-10 ${
          defconLevel === 1 
            ? 'theme-bg-success text-[var(--bg)] border-transparent hover:opacity-90' 
            : 'bg-transparent theme-text-danger theme-border-danger hover:theme-bg-danger hover:text-[var(--bg)]'
        }`}
      >
        {defconLevel === 1 ? (t("hub_defcon_stand_down") || "STAND DOWN") : (t("hub_defcon_initiate") || "INITIATE LOCKDOWN")}
      </button>      {showDefconConfirmModal && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-md animate-in fade-in duration-300 p-8">
          <div className="w-full max-w-md theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[3rem] p-10 shadow-[0_0_100px_rgba(0,0,0,0.3)] flex flex-col items-center gap-6 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 theme-bg-danger shadow-[0_0_20px_var(--danger)]" />
            <span className="text-6xl animate-bounce drop-shadow-md relative z-10">{t("ui_icon_warning") || "⚠️"}</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1 relative z-10">
              <h2 className="text-xl font-black theme-text-danger uppercase tracking-tighter">{t("hub_defcon_confirm_title") || "CONFIRM PROTOCOL"}</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest leading-relaxed opacity-80 mt-2">
                {defconLevel === 1 
                  ? (t("hub_defcon_confirm_stand_down") || "Are you sure you want to stand down?")
                  : (t("hub_defcon_confirm_execute") || "Are you sure you want to execute lockdown?")}
              </p>
            </div>
            <div className="flex gap-3 w-full mt-2 relative z-10">
              <button 
                onClick={() => { triggerDefcon(); setShowDefconConfirmModal(false); }}
                className="flex-1 py-4 theme-bg-danger text-[var(--bg)] rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)] transition-all"
              >
                {defconLevel === 1 ? (t("hub_btn_confirm_stand_down") || "STAND DOWN") : (t("hub_btn_execute_defcon") || "EXECUTE")}
              </button>
              <button 
                onClick={() => setShowDefconConfirmModal(false)}
                className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl font-black text-[10px] uppercase tracking-widest text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all shadow-sm"
              >
                {t("hub_btn_abort") || "ABORT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomRoleSelect({ value, onChange, roles, isBlacklisted }: any) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`theme-glass-inner border rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest focus:outline-none transition-all flex items-center justify-between gap-3 min-w-[150px] shadow-sm hover:border-white/30 hover:bg-white/5 ${
          isBlacklisted 
            ? 'text-red-500 bg-red-500/10 border-red-500/30 hover:bg-red-500/20' 
            : 'text-[var(--text)] border-white/10 hover:border-white/30 hover:bg-white/5'
        }`}
      >
        {value.replace('_', ' ')}
        <span className={`opacity-50 text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 min-w-[150px] bg-black/95 backdrop-blur-3xl border border-white/10 rounded-xl overflow-hidden z-[9999] shadow-2xl flex flex-col animate-in fade-in slide-in-from-top-2 p-1">
            {roles.map((r: string) => (
              <button
                key={r}
                onClick={() => { onChange(r); setIsOpen(false); }}
                className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition-colors rounded-lg ${
                  r === value 
                    ? 'theme-bg-accent text-black shadow-md' 
                    : 'text-[var(--text)] hover:bg-white/10'
                } ${r === 'blacklisted' && r !== value ? '!text-red-500 hover:!bg-red-500/20' : ''}`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IdentityMatrix() {
  const { t } = useLexicon();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('id, username, role').order('username');
    if (data) setProfiles(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpdateRole = async (profileId: string, newRole: string) => {
    const reason = window.prompt("Reason for this role change:", "Routine Access Update");
    if (!reason) return;
    
    setStatus("UPDATING ROLE...");
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    if (error) {
      setStatus("FAILED: " + error.message);
    } else {
      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;
      
      const targetProfile = profiles.find((p: any) => p.id === profileId);
      
      await supabase.from('audit_logs').insert({
         action: `Updated role to ${newRole}`,
         target_table: 'profiles',
         target_name: targetProfile?.username || profileId,
         actor_id: myId,
         reason: reason
      });
      
      setStatus(`ROLE UPDATED`);
      fetchData();
    }
  };

  const filteredProfiles = profiles.filter((p: any) => p.username?.toLowerCase().includes(search.toLowerCase()) || p.role?.toLowerCase().includes(search.toLowerCase()));
  const ROLES = ['citizen', 'mason', 'architect', 'senior_architect', 'wayfinder', 'blacklisted'];

  if (loading) return <div className="p-12 text-center animate-pulse theme-text-accent font-black tracking-widest uppercase">Fetching Records...</div>;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full pb-12 w-full max-w-5xl mx-auto">
       <div className="theme-glass-inner rounded-[2.5rem] p-8 flex flex-col h-[700px]">
         <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">{t("sa_identities_title") || "Identity Matrix"}</h2>
         <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-6">{t("sa_identities_subtitle") || "Global Role & Access Management"}</p>
         
         <input type="text" placeholder={t("sa_identities_search") || "Search global registry..."} value={search} onChange={e => setSearch(e.target.value)} className="w-full theme-glass-panel border border-white/10 rounded-xl px-4 py-4 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all mb-6" />
         
         <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
           {filteredProfiles.map(p => (
              <div key={p.id} className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${p.role === 'blacklisted' ? 'border-red-500/30 bg-red-500/5 shadow-[inset_0_0_20px_rgba(255,0,0,0.1)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                 <div className="flex flex-col">
                   <p className={`text-sm font-black uppercase truncate flex items-center gap-2 ${p.role === 'blacklisted' ? 'text-red-500' : 'text-[var(--text)]'}`}>
                     {p.role === 'blacklisted' && <span className="animate-pulse">⚠️</span>}
                     {p.username || 'UNKNOWN'}
                   </p>
                   <p className="text-[10px] font-bold uppercase opacity-60 mt-1">ID: {p.id.substring(0,8)}</p>
                 </div>
                 
                 <div className="flex items-center gap-4">
                   <span className="text-[10px] font-black uppercase opacity-60">ROLE:</span>
                   <CustomRoleSelect 
                     value={p.role || 'citizen'} 
                     roles={ROLES} 
                     onChange={(newRole: string) => handleUpdateRole(p.id, newRole)}
                     isBlacklisted={p.role === 'blacklisted'}
                   />
                 </div>
              </div>
           ))}
         </div>

         {status && (
           <div className="mt-6 text-center">
             <p className="text-xs font-black theme-text-accent uppercase tracking-widest">{status}</p>
           </div>
         )}
       </div>
    </div>
  );
}

function MasonLinker() {
  const { t } = useLexicon();
  const [proles, setProles] = useState<any[]>([]);
  const [masons, setMasons] = useState<any[]>([]);
  
  const [proleSearch, setProleSearch] = useState("");
  const [masonSearch, setMasonSearch] = useState("");

  const [selectedProle, setSelectedProle] = useState<any>(null);
  const [selectedMason, setSelectedMason] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: mData } = await supabase.from('masons').select('id, name, profile_id').order('name');
    if (mData) setMasons(mData);

    const { data: pData } = await supabase.from('profiles').select('id, username, role').order('username');
    if (pData) setProles(pData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleLink = async () => {
    if (!selectedProle || !selectedMason) return;
    setStatus("LINKING...");
    
    const { error: masonErr } = await supabase.from('masons').update({ profile_id: selectedProle.id }).eq('id', selectedMason.id);
    if (masonErr) { setStatus("FAILED: " + masonErr.message); return; }
    
    if (selectedProle.role === 'citizen' || !selectedProle.role) {
       await supabase.from('profiles').update({ role: 'mason' }).eq('id', selectedProle.id);
    }
    
    setStatus(` LINKED ${selectedProle.username} TO ${selectedMason.name}`);
    setSelectedProle(null);
    setSelectedMason(null);
    fetchData();
  };

  const filteredProles = proles.filter((p: any) => p.username?.toLowerCase().includes(proleSearch.toLowerCase()));
  const filteredMasons = masons.filter((m: any) => m.name?.toLowerCase().includes(masonSearch.toLowerCase()));

  if (loading) return <div className="p-12 text-center animate-pulse theme-text-accent font-black tracking-widest uppercase">Fetching Records...</div>;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full pb-12 w-full max-w-4xl mx-auto">
       <div className="theme-glass-inner rounded-[2.5rem] p-8">
         <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">{t("sa_linker_title") || "Prole to Mason Linker"}</h2>
         <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-6">{t("sa_linker_subtitle") || "Bind an authenticated Citizen to a Creator ID."}</p>
         
         <div className="grid grid-cols-2 gap-8 h-[500px]">
            <div className="flex flex-col gap-4 border border-white/10 rounded-3xl theme-glass-inner p-4">
               <input type="text" placeholder={t("sa_linker_search_citizen") || "Search Citizens (Proles)..."} value={proleSearch} onChange={e => setProleSearch(e.target.value)} className="w-full theme-glass-panel rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all" />
               <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
                 {filteredProles.map(p => (
                    <div key={p.id} onClick={() => setSelectedProle(p)} className={`p-4 rounded-xl cursor-pointer border transition-all flex flex-col gap-1 ${selectedProle?.id === p.id ? 'theme-bg-accent text-black border-transparent shadow-lg scale-[1.02]' : 'bg-white/5 border-white/5 hover:bg-white/10 text-[var(--text)]'}`}>
                       <p className="text-sm font-black uppercase truncate">{p.username || 'UNKNOWN'}</p>
                       <p className="text-[10px] font-bold uppercase opacity-60">ROLE: {p.role || 'CITIZEN'}</p>
                    </div>
                 ))}
               </div>
            </div>

            <div className="flex flex-col gap-4 border border-white/10 rounded-3xl theme-glass-inner p-4">
               <input type="text" placeholder={t("sa_linker_search_mason") || "Search Creator IDs (Masons)..."} value={masonSearch} onChange={e => setMasonSearch(e.target.value)} className="w-full theme-glass-panel rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all" />
               <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
                 {filteredMasons.map(m => (
                    <div key={m.id} onClick={() => setSelectedMason(m)} className={`p-4 rounded-xl cursor-pointer border transition-all relative flex flex-col gap-1 ${selectedMason?.id === m.id ? 'theme-bg-accent text-black border-transparent shadow-lg scale-[1.02]' : 'bg-white/5 border-white/5 hover:bg-white/10 text-[var(--text)]'}`}>
                       <p className="text-sm font-black uppercase truncate pr-20">{m.name}</p>
                       {m.profile_id && <span className="absolute top-4 right-4 text-[9px] font-black uppercase text-red-400">ALREADY LINKED</span>}
                    </div>
                 ))}
               </div>
            </div>
         </div>

         <div className="mt-8 flex items-center justify-between theme-glass-inner p-6 rounded-3xl border border-white/5 shadow-inner">
            <div className="flex flex-col">
               <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 mb-1">Status</p>
               <p className="text-sm font-black theme-text-accent uppercase">{status || "AWAITING SELECTION"}</p>
            </div>
            
            <button 
              disabled={!selectedProle || !selectedMason} 
              onClick={handleLink}
              className="px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all theme-bg-accent text-[var(--bg)] hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:scale-100 shadow-lg"
            >
               {t("sa_linker_btn") || "ESTABLISH LINK"}
            </button>
         </div>
       </div>
    </div>
  );
}

function ComplianceOversight() {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<number | null>(null);
  
  const [showManualFlagModal, setShowManualFlagModal] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSelectedMod, setManualSelectedMod] = useState<any>(null);
  const [manualTier, setManualTier] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!manualSearchQuery.trim() || manualSelectedMod) {
      setManualSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      const { data } = await supabase
        .from('mods')
        .select('id, name, master_author, compliance_tier')
        .ilike('name', `%${manualSearchQuery.trim()}%`)
        .limit(10);
      if (data) setManualSearchResults(data);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [manualSearchQuery, manualSelectedMod]);

  const handleManualFlag = async () => {
    if (!manualSelectedMod) {
      alert("Please select a mod from the registry.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('mods').update({ compliance_tier: manualTier }).eq('id', manualSelectedMod.id);
      if (error) throw error;
      
      alert("Mod flagged manually successfully.");
      setShowManualFlagModal(false);
      setManualSelectedMod(null);
      setManualSearchQuery("");
      fetchMods();
    } catch (err: any) {
      alert("Failed to manual flag: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchMods = async () => {
    setLoading(true);
    // Fetch all mods that are not tier 0 (clean)
    const { data } = await supabase
      .from('mods')
      .select('id, name, master_author, compliance_tier, status')
      .gt('compliance_tier', 0)
      .order('compliance_tier', { ascending: false });
    
    if (data) setMods(data);
    setLoading(false);
  };

  useEffect(() => { fetchMods(); }, []);

  const filteredMods = filterTier ? mods.filter(m => m.compliance_tier === filterTier) : mods;

  const updateTier = async (modId: string, newTier: number) => {
    const { error } = await supabase.from('mods').update({ compliance_tier: newTier }).eq('id', modId);
    if (!error) {
      fetchMods();
    } else {
      alert("Failed to update tier: " + error.message);
    }
  };

  const getTierDetails = (tier: number) => {
    switch(tier) {
      case 1: return { label: 'NSFW (18+)', color: 'theme-text-warning', bg: 'theme-bg-warning' };
      case 2: return { label: 'EXPLICIT', color: 'theme-text-danger', bg: 'theme-bg-danger' };
      case 3: return { label: 'MALWARE', color: 'text-red-600', bg: 'bg-red-600' };
      default: return { label: 'CLEAN', color: 'theme-text-success', bg: 'theme-bg-success' };
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full pb-12 w-full max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)]">{t("sa_comp_title") || "Compliance Oversight"}</h2>
          <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("sa_comp_subtitle") || "Global Flag Management"}</p>
        </div>
        
        <div className="flex gap-2">
          {[null, 3, 2, 1].map(tier => (
            <button
              key={tier || 'all'}
              onClick={() => setFilterTier(tier)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                filterTier === tier 
                  ? 'theme-bg-accent text-[var(--bg)] border-transparent' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-[var(--text)]'
              }`}
            >
              {tier === null ? 'ALL ALERTS' : getTierDetails(tier).label}
            </button>
          ))}
          <button onClick={() => setShowManualFlagModal(true)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border bg-red-900/20 text-red-400 border-red-500/20 hover:bg-red-900/40 hover:border-red-500/50 flex items-center gap-2">
            + MANUAL FLAG
          </button>
        </div>
      </div>

      <div className="theme-glass-panel rounded-3xl p-6 h-[600px] overflow-y-auto custom-scrollbar border border-white/5 shadow-inner">
        {loading ? (
          <div className="py-20 text-center opacity-50 font-black uppercase tracking-widest animate-pulse">
            Scanning Global Registry...
          </div>
        ) : filteredMods.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMods.map(mod => {
              const td = getTierDetails(mod.compliance_tier);
              return (
                <div key={mod.id} className={`theme-glass-inner rounded-2xl p-5 border flex flex-col gap-4 relative overflow-hidden group hover:border-white/20 transition-colors ${mod.compliance_tier === 3 ? 'border-red-900/50' : 'border-white/5'}`}>
                  {mod.compliance_tier === 3 && <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />}
                  
                  <div className="flex flex-col gap-1 z-10">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded w-fit ${td.color} bg-white/5 border border-white/10`}>
                      {td.label}
                    </span>
                    <h3 className="text-sm font-black text-[var(--text)] uppercase truncate mt-2">{mod.name}</h3>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase truncate">{mod.master_author || 'UNKNOWN MASON'}</p>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-white/5 z-10">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-2">REASSIGN RATING</p>
                    <div className="flex gap-2">
                      <button onClick={() => updateTier(mod.id, 0)} className="flex-1 py-2 rounded-lg bg-white/5 hover:theme-bg-success hover:text-[var(--bg)] text-[8px] font-black uppercase transition-colors">CLEAN</button>
                      {mod.compliance_tier !== 1 && <button onClick={() => updateTier(mod.id, 1)} className="flex-1 py-2 rounded-lg bg-white/5 hover:theme-bg-warning hover:text-[var(--bg)] text-[8px] font-black uppercase transition-colors">18+</button>}
                      {mod.compliance_tier !== 2 && <button onClick={() => updateTier(mod.id, 2)} className="flex-1 py-2 rounded-lg bg-white/5 hover:theme-bg-danger hover:text-[var(--bg)] text-[8px] font-black uppercase transition-colors">EXPL</button>}
                      {mod.compliance_tier !== 3 && <button onClick={() => updateTier(mod.id, 3)} className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-red-600 hover:text-white text-[8px] font-black uppercase transition-colors">MALW</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center opacity-50 font-black uppercase tracking-widest">
            No active compliance alerts.
          </div>
        )}
      </div>

      {showManualFlagModal && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-2xl animate-in zoom-in-95 duration-200 p-8" onClick={() => setShowManualFlagModal(false)}>
          <div className="relative w-full max-w-lg theme-glass-panel rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="p-8 pb-4 border-b border-white/5">
              <h3 className="text-2xl font-black text-[var(--text)] uppercase tracking-tighter">Manual Threat Flag</h3>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">Direct insertion into Global Registry</p>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-60">Search Global Registry</label>
                <input 
                  value={manualSelectedMod ? manualSelectedMod.name : manualSearchQuery} 
                  onChange={e => setManualSearchQuery(e.target.value)} 
                  readOnly={!!manualSelectedMod}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-[var(--text)] uppercase focus:outline-none focus:theme-border-accent" 
                  placeholder="Type to search registry..." 
                />
                {manualSelectedMod && (
                  <button onClick={() => { setManualSelectedMod(null); setManualSearchQuery(""); }} className="absolute right-4 top-9 text-[var(--danger)] font-black text-[10px]">✕ CLEAR</button>
                )}
                {manualSearchResults.length > 0 && !manualSelectedMod && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                    {manualSearchResults.map(m => (
                      <button key={m.id} onClick={() => setManualSelectedMod(m)} className="w-full text-left px-4 py-3 hover:bg-white/10 border-b border-white/5 last:border-0 flex flex-col group transition-all">
                        <span className="text-[11px] font-black uppercase text-[var(--text)] group-hover:theme-text-accent truncate">{m.name}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{m.master_author || 'Unknown'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 relative z-40">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-60">Compliance Tier</label>
                <CustomComplianceSelect value={manualTier} onChange={setManualTier} />
              </div>
              <div className="flex gap-4 mt-4 relative z-0">
                <button onClick={() => setShowManualFlagModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors">CANCEL</button>
                <button onClick={handleManualFlag} disabled={isSubmitting} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50">
                  {isSubmitting ? "TRANSMITTING..." : "INSERT RECORD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomComplianceSelect({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const options = [
    { value: 3, label: 'MALWARE (Tier 3)', color: 'text-red-500', glow: 'bg-red-500/10' },
    { value: 2, label: 'EXPLICIT (Tier 2)', color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { value: 1, label: 'NSFW 18+ (Tier 1)', color: 'theme-text-warning', glow: 'theme-bg-warning' },
  ];
  
  const selected = options.find(o => o.value === value) || options[0];

  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full theme-glass-inner border border-white/10 hover:border-white/30 hover:bg-white/5 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between shadow-sm"
      >
        <div className={`flex items-center gap-3 ${selected.color}`}>
          <div className={`w-2 h-2 rounded-full ${selected.glow.replace('bg-', 'bg-').replace('/10', '')}`} style={{ boxShadow: '0 0 10px currentColor' }} />
          {selected.label}
        </div>
        <span className={`opacity-50 text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-xl overflow-hidden z-[9999] shadow-2xl flex flex-col animate-in fade-in slide-in-from-top-2 p-1 max-h-60 overflow-y-auto custom-scrollbar">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 rounded-lg transition-all ${
                  value === opt.value ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${opt.glow.replace('bg-', 'bg-').replace('/10', '')} ${opt.color}`} style={{ boxShadow: '0 0 10px currentColor' }} />
                <span className={opt.color}>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CommandScreen({ setTab }: any) {
  const { t } = useLexicon();
  const [stats, setStats] = useState({ masons: 0, citizens: 0, explicit: 0, malware: 0, nsfw: 0 });
  const [defconLevel, setDefconLevel] = useState<number>(5);

  useEffect(() => {
    const fetchStats = async () => {
      const { count: masonsCount } = await supabase.from('masons').select('*', { count: 'exact', head: true });
      const { count: citizensCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'citizen');
      
      const { count: explicitCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 2);
      const { count: malwareCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 3);
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);

      setStats({
        masons: masonsCount || 0,
        citizens: citizensCount || 0,
        explicit: explicitCount || 0,
        malware: malwareCount || 0,
        nsfw: nsfwCount || 0
      });

      const { data } = await supabase.from('global_network_status').select('defcon_level').eq('id', 1).single();
      if (data) setDefconLevel(data.defcon_level);
    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div onClick={() => setTab("defcon")} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group cursor-pointer relative overflow-hidden">
          {defconLevel === 1 && <div className="absolute inset-0 theme-bg-danger opacity-10 animate-pulse pointer-events-none" />}
          <span className={`text-4xl font-black ${defconLevel === 1 ? 'theme-text-danger animate-bounce' : 'theme-text-success'} group-hover:scale-110 origin-left transition-transform`}>
            {defconLevel}
          </span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("sa_dash_defcon") || "Global Defcon"}</span>
        </div>

        <div onClick={() => setTab("identities")} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group cursor-pointer">
          <span className="text-4xl font-black theme-text-accent group-hover:scale-110 origin-left transition-transform">{stats.masons}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("sa_dash_masons") || "Active Masons"}</span>
        </div>

        <div onClick={() => setTab("compliance")} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group cursor-pointer">
          <span className="text-4xl font-black theme-text-warning group-hover:scale-110 origin-left transition-transform">{stats.nsfw}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("sa_dash_nsfw") || "NSFW Flags"}</span>
        </div>

        <div onClick={() => setTab("compliance")} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-red-600/10 transition-all text-left group cursor-pointer border border-transparent hover:border-red-500/30">
          <span className="text-4xl font-black text-red-500 group-hover:scale-110 origin-left transition-transform">{stats.explicit + stats.malware}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("sa_dash_quarantined") || "Quarantined (EXPL/MALW)"}</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <WayfinderComms />
      </div>
    </div>
  );
}

function WayfinderComms() {
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
      if (error) {
        console.error("Fetch Comms Error:", error);
        alert(`Comms Error: ${error.message} (Is RLS blocking?)`);
      }
      if (data) setCommsMessages(data.reverse());
    };
    fetchComms();

    const commsSub = supabase.channel('wayfinder-comms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wayfinder_comms' }, (payload: any) => {
        if (payload.eventType === 'INSERT') setCommsMessages(prev => [...prev, payload.new]);
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
      if (error) alert("Update Error: " + error.message);
      setEditingCommId(null);
    } else {
      const { error } = await supabase.from('wayfinder_comms').insert({
        sender_id: user.id,
        message: commsInput.trim()
      });
      if (error) alert("Insert Error: " + error.message);
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    const { error } = await supabase.from('wayfinder_comms').delete().eq('id', id);
    if (error) alert("Delete Error: " + error.message);
  };

  return (
    <div className="flex-1 theme-glass-inner rounded-[3rem] p-8 flex flex-col h-[600px] max-w-4xl mx-auto w-full">
      <h3 className="text-xs font-black theme-text-accent uppercase tracking-widest mb-6">{t("sa_comms_title") || "Wayfinder SECURE COMM-LINK"}</h3>
      <div className="flex-1 border border-white/5 rounded-2xl bg-white/5 flex flex-col mb-4 overflow-y-auto p-4 gap-3 custom-scrollbar shadow-inner">
         {commsMessages.length === 0 ? (
           <div className="flex-1 flex items-center justify-center">
             <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest text-center px-8 leading-relaxed">
               {t("hub_comms_offline") || "AWAITING TRANSMISSIONS"}
             </span>
           </div>
         ) : (
           commsMessages.map((msg, i) => (
             <div key={msg.id || i} className="flex flex-col gap-2 text-left theme-glass-inner p-4 rounded-xl animate-in fade-in slide-in-from-bottom-2 border border-white/5">
               <div className="flex justify-between items-center opacity-60 mb-1">
                 <span className="text-[9px] font-mono theme-text-accent">{msg.sender_id?.substring(0,8)}</span>
                 <div className="flex gap-2 items-center">
                   {currentUserId === msg.sender_id && (
                      <div className="flex gap-2 mr-2">
                        <button onClick={() => { setEditingCommId(msg.id); setCommsInput(msg.message); }} className="text-[10px] hover:theme-text-accent transition-colors hover:scale-110">✏️</button>
                        <button onClick={() => deleteComm(msg.id)} className="text-[10px] hover:theme-text-danger transition-colors hover:scale-110">✕</button>
                      </div>
                   )}
                   <span className="text-[9px] font-mono text-gray-400">{new Date(msg.created_at).toLocaleTimeString()}</span>
                 </div>
               </div>
               <p className="text-xs font-bold text-[var(--text)] leading-relaxed">{msg.message}</p>
             </div>
           ))
         )}
      </div>
      <div className="flex gap-4">
        <input 
          type="text" 
          value={commsInput}
          onChange={(e) => setCommsInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendComm()}
          className="flex-1 theme-glass-inner border border-white/5 rounded-xl px-4 py-3 text-[var(--text)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all placeholder:opacity-30" 
          placeholder={t("sa_comms_placeholder") || "Transmit priority message to Wayfinders..."} 
        />
        <button 
          onClick={sendComm}
          disabled={!commsInput.trim()}
          className="px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest theme-bg-accent text-[var(--bg)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all shadow-lg"
        >
          {editingCommId ? 'Update' : 'Send'}
        </button>
      </div>
    </div>
  );
}

const fetchAllPaginated = async (queryFn: () => any) => { 
  let allData: any[] = []; 
  let from = 0; 
  const step = 999; 
  while (true) { 
    const { data, error } = await queryFn().range(from, from + step); 
    if (error || !data || data.length === 0) break; 
    allData = [...allData, ...data]; 
    if (data.length <= step) break; 
    from += step + 1; 
  } 
  return { data: allData, error: null }; 
};

function MassUpdateOversight() {
  const { t } = useLexicon();
  const [mods, setMods] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [loading, setLoading] = useState(true);

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
    if (selectedIds.size === 0) return;
    setIsUpdating(true);
    
    const updates: any = {};
    if (massStatus) updates.status = massStatus;
    if (massCategory) updates.category_override = massCategory;
    if (massSubCategory) updates.sub_type = massSubCategory;
    if (massCompliance) updates.compliance_tier = parseInt(massCompliance);
    if (massGameVersions.length > 0) updates.compatible_versions = massGameVersions;
    
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
      
      // Reset mass fields & reload
      setMassStatus(""); setMassCategory(""); setMassSubCategory(""); setMassCompliance(""); setMassGameVersions([]); setMassConflictId(null);
      setSelectedIds(new Set());
      await loadData();
      alert("Mass update completed successfully.");
    } catch (e) {
      console.error(e);
      alert("Mass update failed.");
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

  return (
    <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in h-full w-full max-w-7xl mx-auto">
      
      {/* LEFT PANEL: SELECTION & SEARCH */}
      <div className="flex-1 min-w-0 theme-glass-panel rounded-3xl p-8 flex flex-col h-[950px] border border-white/5">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">{t("mass_update_title")}</h2>
        <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-6">{t("mass_update_desc")}</p>
        
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="Search artifacts..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="flex-1 theme-glass-inner border border-white/10 rounded-xl px-4 py-3 text-[var(--text)] text-xs font-black uppercase focus:outline-none focus:theme-border-accent shadow-sm" 
            />
            <div className="w-48 z-40 shrink-0">
              <CustomDropdown 
                value={filterCategory} 
                onChange={setFilterCategory} 
                options={[
                  { id: "", label: "ALL CATEGORIES" },
                  { id: "Script", label: "SCRIPT" },
                  { id: "Core", label: "CORE" },
                  { id: "Tuning", label: "TUNING" },
                  { id: "CC", label: "CUSTOM CONTENT" }
                ]}
              />
            </div>
          </div>
          <div className="flex gap-4 items-stretch">
            <div className="flex-1 z-30 theme-glass-inner p-1 border border-transparent rounded-2xl shadow-sm">
               <GameVersionMultiSelect selectedVersions={filterGameVersions} onChange={setFilterGameVersions} />
            </div>
            <button 
              onClick={() => setShowOnlySelected(!showOnlySelected)} 
              className={"px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm shrink-0 " + (showOnlySelected ? "theme-bg-accent text-[var(--bg)] border-transparent" : "theme-glass-inner border-white/10 text-[var(--text)]")}
            >
              {showOnlySelected ? "Showing Selected" : "Show Selected Only"}
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center px-4 mb-2">
          <span className="text-[10px] font-black theme-text-accent uppercase">{selectedIds.size} Artifacts Selected</span>
          <button onClick={handleSelectAllFiltered} className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase transition-colors">
            Toggle All Visible
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
          {loading ? (
             <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest animate-pulse">Loading Registry...</div>
          ) : filteredMods.map(m => (
            <div 
              key={m.id} 
              onClick={() => handleToggle(m.id)}
              className={"p-4 rounded-2xl cursor-pointer border transition-all flex items-center justify-between gap-4 " + (selectedIds.has(m.id) ? "theme-border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-lg scale-[1.01]" : "border-white/5 bg-white/5 hover:bg-white/10")}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={"w-5 h-5 rounded-md border flex items-center justify-center shrink-0 " + (selectedIds.has(m.id) ? "theme-bg-accent theme-border-accent text-[var(--bg)]" : "border-white/20 bg-transparent")}>
                  {selectedIds.has(m.id) && <span className="text-[10px]">?</span>}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black uppercase text-[var(--text)] break-words leading-tight pr-2">{m.name}</span>
                  <span className="text-[9px] font-bold uppercase text-[var(--subtext)] opacity-60 mt-1">{m.master_author ? `${m.master_author} | ` : ""}Status: {m.status || "UNVERIFIED"} | Tier: {m.compliance_tier}</span>
                </div>
              </div>
            </div>
          ))}
          {!loading && filteredMods.length === 0 && (
             <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest">No artifacts found.</div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: BATCH ACTIONS */}
      <div className="w-full xl:w-96 flex flex-col gap-6 shrink-0 h-[950px]">
        <div className="theme-glass-panel rounded-3xl p-6 border border-white/5 flex flex-col gap-6 shadow-inner flex-1">
           <h3 className="text-sm font-black theme-text-accent uppercase tracking-widest border-b border-white/10 pb-4">{t("mass_update_apply")}</h3>

           <div className="flex flex-col gap-2 z-50">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("mass_status_protocol")}</label>
              <CustomDropdown 
                value={massStatus} 
                onChange={setMassStatus} 
                options={[
                  { id: "", label: "-- LEAVE UNCHANGED --" },
                  { id: "verified", label: "VERIFIED" },
                  { id: "unverified", label: "UNVERIFIED" },
                  { id: "deprecated", label: "DEPRECATED" },
                  { id: "quarantined", label: "QUARANTINED" }
                ]}
              />
           </div>

           <div className="flex flex-col gap-2 z-40">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("mass_compliance_tier")}</label>
              <CustomDropdown 
                value={massCompliance} 
                onChange={setMassCompliance} 
                options={[
                  { id: "", label: "-- LEAVE UNCHANGED --" },
                  { id: "0", label: "CLEAN (TIER 0)" },
                  { id: "1", label: "NSFW 18+ (TIER 1)" },
                  { id: "2", label: "EXPLICIT (TIER 2)" },
                  { id: "3", label: "MALWARE (TIER 3)" }
                ]}
              />
           </div>

           <div className="flex flex-col gap-2 z-30">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("mass_category_override")}</label>
              <CustomDropdown 
                value={massCategory} 
                onChange={setMassCategory} 
                options={[
                  { id: "", label: "-- LEAVE UNCHANGED --" },
                  { id: "Script", label: "SCRIPT" },
                  { id: "Core", label: "CORE" },
                  { id: "Tuning", label: "TUNING" },
                  { id: "CC", label: "CUSTOM CONTENT" }
                ]}
              />
           </div>

           <div className="flex flex-col gap-2 z-20">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">Game Versions (Replaces existing)</label>
              <div className="theme-glass-inner p-1 rounded-2xl border border-transparent hover:border-white/10 transition-colors shadow-sm">
                 <GameVersionMultiSelect selectedVersions={massGameVersions} onChange={setMassGameVersions} />
              </div>
           </div>

           <div className="flex flex-col gap-2 z-10">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-1">{t("mass_assign_conflict")}</label>
              <ModSearchDropdown 
                placeholder="Select Artifact to Conflict..." 
                selectedItem={massConflictId} 
                onSelect={setMassConflictId} 
                onClear={() => setMassConflictId(null)} 
                modList={mods} 
              />
           </div>
        </div>

        <button 
          disabled={isUpdating || selectedIds.size === 0 || (!massStatus && !massCompliance && !massCategory && massGameVersions.length === 0 && !massConflictId)}
          onClick={executeMassUpdate}
          className="w-full py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl border theme-bg-accent text-[var(--bg)] border-transparent hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100"
        >
          {isUpdating ? "EXECUTING BATCH..." : "EXECUTE MASS UPDATE"}
        </button>
      </div>
    </div>
  );
}

function GameVersionsRegistry() {
  const [versions, setVersions] = useState<any[]>([]);
  const [newVersion, setNewVersion] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const fetchVersions = async () => {
    const { data } = await supabase.from('game_versions').select('*').order('version', { ascending: false });
    if (data) setVersions(data);
  };

  useEffect(() => { fetchVersions(); }, []);

  const handleAdd = async () => {
    if (!newVersion) return;
    const reason = window.prompt("Reason for adding this version:", "Routine Patch Update");
    if (!reason) return;

    setIsAdding(true);
    await supabase.from('game_versions').insert([{ version: newVersion, display_name: `Update ${newVersion}` }]);
    
    const userRes = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
       action: `Added version ${newVersion}`,
       target_table: 'game_versions',
       target_name: newVersion,
       actor_id: userRes.data.user?.id,
       reason: reason
    });
    
    setNewVersion("");
    setIsAdding(false);
    fetchVersions();
  };

  const handleDelete = async (version: string) => {
    const reason = window.prompt(`Reason for deleting version ${version}:`, "Deprecated or invalid");
    if (!reason) return;

    await supabase.from('game_versions').delete().eq('version', version);
    
    const userRes = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
       action: `Deleted version ${version}`,
       target_table: 'game_versions',
       target_name: version,
       actor_id: userRes.data.user?.id,
       reason: reason
    });
    
    fetchVersions();
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in max-w-4xl mx-auto h-full w-full">
      <div className="theme-glass-panel rounded-3xl p-8 border border-white/5 flex flex-col gap-6 shadow-inner">
        <div>
           <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">Game Versions Registry</h2>
           <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">Manage known game versions globally for all users.</p>
        </div>

        <div className="flex gap-4">
           <input 
             value={newVersion} 
             onChange={e => setNewVersion(e.target.value)} 
             placeholder="e.g. 1.124.54.1030" 
             className="flex-1 theme-glass-inner border border-white/10 rounded-xl px-4 py-3 text-[var(--text)] text-xs font-black uppercase tracking-widest focus:theme-border-accent outline-none shadow-sm placeholder:opacity-30" 
           />
           <button 
             onClick={handleAdd} 
             disabled={isAdding || !newVersion} 
             className="px-8 py-3 rounded-xl theme-bg-accent text-[var(--bg)] font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:scale-105 active:scale-95 transition-all shadow-lg"
           >
             {isAdding ? "ADDING..." : "+ ADD TO DATABASE"}
           </button>
        </div>
      </div>

      <div className="theme-glass-panel rounded-3xl p-8 border border-white/5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 shadow-inner">
         <h3 className="text-sm font-black uppercase tracking-widest mb-4 opacity-60">Registered Versions</h3>
         {versions.map(v => (
            <div key={v.version} className="flex justify-between items-center p-4 rounded-xl theme-glass-inner border border-white/5 group hover:border-white/20 transition-all shadow-sm">
               <span className="text-sm font-mono font-black text-[var(--text)]">{v.version}</span>
               <button onClick={() => handleDelete(v.version)} className="text-[10px] font-black theme-text-danger opacity-0 group-hover:opacity-100 transition-opacity hover:underline uppercase tracking-widest p-2">
                 DELETE
               </button>
            </div>
         ))}
      </div>
    </div>
  );
}

function AuditLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          actor:profiles!actor_id(username, role)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (data) setLogs(data);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  if (loading) return <div className="p-12 text-center animate-pulse theme-text-accent font-black tracking-widest uppercase">Fetching Records...</div>;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full pb-12 w-full max-w-5xl mx-auto">
       <div className="theme-glass-inner rounded-[2.5rem] p-8 flex flex-col h-[700px]">
         <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">Architect Audit Logs</h2>
         <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-6">Database Mutation Records & Access Tracking</p>
         
         <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2">
           {logs.map((log: any) => (
             <div key={log.id} className="p-5 rounded-2xl border transition-all bg-white/5 border-white/5 hover:border-white/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black uppercase text-[var(--text)]">{log.action}</span>
                  <span className="text-[10px] font-bold opacity-50">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest opacity-70">
                  <span>TARGET: {log.target_table} <span className="opacity-50">/</span> {log.target_name || log.target_id || 'UNKNOWN'}</span>
                  <span>ACTOR: {log.actor?.username || log.actor_id} <span className="theme-text-accent px-2 py-0.5 bg-black/40 rounded-md ml-2">{log.actor?.role}</span></span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <span className="text-[9px] font-black uppercase theme-text-warning tracking-widest opacity-80">REASON:</span>
                  <p className="text-xs font-medium text-[var(--subtext)] mt-1">{log.reason}</p>
                </div>
             </div>
           ))}
         </div>
       </div>
    </div>
  );
}
