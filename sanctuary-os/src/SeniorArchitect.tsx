import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { ViewHeader } from './shared';

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
        <TabButton id="defcon" label={t("sa_tab_defcon") || "DEFCON Override"} activeTab={activeTab} setTab={setActiveTab} />
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar pr-4 pb-48">
        {activeTab === "command_center" && <CommandScreen setTab={setActiveTab} />}
        {activeTab === "identities" && <IdentityMatrix />}
        {activeTab === "linker" && <MasonLinker />}
        {activeTab === "compliance" && <ComplianceOversight />}
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
      </button>

      {showDefconConfirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg)]/10 backdrop-blur-3xl animate-in fade-in duration-300 p-8">
          <div className="w-full max-w-md theme-glass-panel border border-white/10 rounded-[3rem] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center gap-6 text-center">
            <span className="text-6xl animate-bounce drop-shadow-md">{t("ui_icon_warning") || "⚠️"}</span>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h2 className="text-xl font-black theme-text-danger uppercase tracking-tighter">{t("hub_defcon_confirm_title") || "CONFIRM PROTOCOL"}</h2>
              <p className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest">
                {defconLevel === 1 
                  ? (t("hub_defcon_confirm_stand_down") || "Are you sure you want to stand down?")
                  : (t("hub_defcon_confirm_execute") || "Are you sure you want to execute lockdown?")}
              </p>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button 
                onClick={() => { triggerDefcon(); setShowDefconConfirmModal(false); }}
                className="flex-1 py-4 theme-bg-danger text-[var(--bg)] rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 shadow-[0_0_15px_rgba(var(--danger-rgb),0.4)] transition-all"
              >
                {defconLevel === 1 ? (t("hub_btn_confirm_stand_down") || "STAND DOWN") : (t("hub_btn_execute_defcon") || "EXECUTE")}
              </button>
              <button 
                onClick={() => setShowDefconConfirmModal(false)}
                className="flex-1 py-4 theme-glass-inner border border-white/5 rounded-xl font-black text-[10px] uppercase tracking-widest text-[var(--text)] hover:bg-white/5 transition-all shadow-sm"
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
        className={`theme-glass-panel border rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none transition-all flex items-center justify-between gap-3 min-w-[150px] shadow-sm ${
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
          <div className="absolute top-full right-0 mt-2 min-w-[150px] theme-glass-panel border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl flex flex-col backdrop-blur-3xl animate-in fade-in slide-in-from-top-2 p-1">
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
    setStatus("UPDATING ROLE...");
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    if (error) {
      setStatus("FAILED: " + error.message);
    } else {
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
