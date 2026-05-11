import { showToast } from './Toast';
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { ViewHeader, GameVersionMultiSelect, CustomDropdown, StatTile } from "./shared";
import ProtocolVisualizer from "./ProtocolVisualizer";
import { useLexicon } from "./LexiconContext";

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };

export default function MasonHub({ sandboxMod, clearSandboxMod }: { sandboxMod?: any, clearSandboxMod?: () => void }) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("registry");
  const [masonProfile, setMasonProfile] = useState<any>(null);
  const[loading, setLoading] = useState(true);

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
      <span className="text-6xl grayscale">{t("ui_icon_mason")}</span>
      <h2 className="text-2xl font-black uppercase tracking-widest text-[var(--text)]">{t("mason_unlinked")}</h2>
      <p className="text-sm font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("mason_unlinked_desc")}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full">
      <ViewHeader title={`${masonProfile.name}'s ${t("mason_workshop")}`} subtitle={t("mason_subtitle")} />
      
      <div className="flex flex-wrap theme-glass-inner p-1.5 rounded-2xl w-fit mb-2">
        <TabButton id="registry" label={t("mason_tab_registry")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="cc_sets" label={t("mason_tab_cc")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="protocols" label="Protocols" activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="posts" label={t("mason_tab_posts")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="sandbox" label={t("mason_tab_sandbox")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="settings" label="Settings" activeTab={activeTab} setTab={setActiveTab} />
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar pr-4 pb-48">
        {activeTab === "registry" && <MasonRegistry masonId={masonProfile.id} />}
        {activeTab === "cc_sets" && <MasonCCSetBuilder masonId={masonProfile.id} masonName={masonProfile.name} />}
        {activeTab === "protocols" && <ProtocolVisualizer masonId={masonProfile.id} isArchitect={false} />}
        {activeTab === "posts" && <MasonPostsEditor masonId={masonProfile.id} />} 
        {activeTab === "sandbox" && <MasonSandbox masonId={masonProfile.id} initialSandboxMod={sandboxMod} onClear={clearSandboxMod} />}
        {activeTab === "settings" && <MasonSettings profile={masonProfile} onUpdate={setMasonProfile} />}
      </div>
    </div>
  );
}

function TabButton({ id, label, activeTab, setTab }: any) {
  const isActive = activeTab === id;
  return (
    <button onClick={() => setTab(id)} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${isActive ? 'theme-bg-accent text-[var(--bg)] shadow-lg' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5'}`}>
      {label}
    </button>
  );
}

function MasonCCSetBuilder({ masonId, masonName }: { masonId: string, masonName: string }) {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const[myMods, setMyMods] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const[searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchSets = async () => {
    const { data } = await supabase.from('cc_sets').select('*').eq('mason_id', masonId).order('name');
    if (data) setSets(data);
  };

  const fetchMyMods = async () => {
    const { data } = await supabase.from('mods').select('id, name, image_url, category_override').eq('mason_id', masonId).order('name');
    if (data) setMyMods(data);
  };

  const fetchMembers = async (setId: string) => {
    const { data } = await supabase.from('cc_set_members').select('id, mod_id, mods(name, image_url)').eq('set_id', setId);
    if (data) setMembers(data);
  };

  useEffect(() => {
    fetchSets();
    fetchMyMods();
  },[]);

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    const { data, error } = await supabase.from('cc_sets').insert([{ 
      name: newSetName.trim(), 
      creator_name: masonName, 
      mason_id: masonId,
      is_official: true 
    }]).select().single();
    
    if (!error && data) {
      setSets(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
      setActiveSet(data);
      setNewSetName("");
      setMembers([]);
    }
  };

  const handleSaveSetMeta = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    await supabase.from('cc_sets').update({ 
      name: activeSet.name, 
      image_url: activeSet.image_url 
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

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
      
      <div className="w-full lg:w-1/3 flex flex-col gap-4 h-full">
        <div className="theme-glass-panel border border-white/10 rounded-2xl p-5 shadow-inner shrink-0">
          <h3 className="text-[10px] font-black theme-text-accent uppercase tracking-widest mb-3">{t("mason_cc_create_new")}</h3>
          <form onSubmit={handleCreateSet} className="flex gap-2">
            <input 
              value={newSetName} 
              onChange={e => setNewSetName(e.target.value)} 
              placeholder={t("mason_cc_set_name")} 
              className="flex-1 w-full theme-glass-inner rounded-xl px-4 py-2 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent"
            />
            <button type="submit" className="shrink-0 px-4 py-2 theme-bg-accent text-[var(--bg)] font-black text-sm uppercase tracking-widest rounded-xl hover:scale-105 transition-all">
              {t("ui_icon_plus")}
            </button>
          </form>
        </div>
        
        <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2rem] overflow-y-auto custom-scrollbar p-4 shadow-2xl flex flex-col gap-2">
          {sets.length === 0 && <div className="p-4 text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_cc_no_sets")}</div>}
          {sets.map(set => (
            <button key={set.id} onClick={() => { setActiveSet(set); fetchMembers(set.id); }} className={`text-left px-5 py-4 rounded-xl border transition-all flex flex-col gap-1 ${activeSet?.id === set.id ? 'theme-panel-accent theme-border-accent shadow-lg' : 'theme-glass-inner border-white/5 hover:theme-panel-accent hover:bg-opacity-10 text-[var(--subtext)] opacity-80 hover:text-gray-200'}`}>
              <span className="font-black text-xs uppercase tracking-tight truncate w-full">{set.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-2/3 theme-glass-panel rounded-[2rem] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-[-50px] right-[-50px] w-96 h-96 theme-bg-accent opacity-10 blur-[120px] rounded-full pointer-events-none" />
        
        {activeSet ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6 relative z-10">
            <div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0 gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <input value={activeSet.name} onChange={e => setActiveSet({...activeSet, name: e.target.value})} className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter bg-transparent border-none outline-none focus:theme-text-accent p-0 m-0 w-full truncate" />
                <input value={activeSet.image_url || ""} onChange={e => setActiveSet({...activeSet, image_url: e.target.value})} placeholder={t("mason_cc_cover_url")} className="w-full theme-glass-inner rounded-xl px-4 py-2 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent" />
              </div>
              <button onClick={handleSaveSetMeta} disabled={isSaving} className="shrink-0 px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg theme-bg-success text-[var(--bg)] hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50">
                {isSaving ? t("mason_cc_saving") : t("mason_cc_save_meta")}
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[300px]">
              
              <div className="flex-1 flex flex-col gap-4">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t("mason_cc_search_assets")} className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                <div className="flex-1 theme-glass-inner rounded-2xl p-3 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                  {myMods.filter(m => !members.some(mem => mem.mod_id === m.id) && m.name.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-white/5 border border-white/5 p-3 rounded-xl hover:border-white/20 transition-all group">
                      <span className="text-[10px] font-bold text-[var(--text)] uppercase truncate flex-1 pr-2">{m.name}</span>
                      <button onClick={() => handleAddMod(m.id)} className="px-3 py-1.5 theme-bg-accent text-[var(--bg)] rounded-lg text-[9px] font-black uppercase transition-all hover:scale-105 opacity-0 group-hover:opacity-100">{t("mason_cc_btn_add")}</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <div className="theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--subtext)] opacity-60">{t("mason_cc_in_set")}</span>
                  <span className="theme-text-accent">{members.length}</span>
                </div>
                <div className="flex-1 theme-glass-inner rounded-2xl p-3 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                  {members.map(mem => (
                    <div key={mem.id} className="flex justify-between items-center bg-white/5 border border-white/5 p-3 rounded-xl hover:border-white/20 transition-all group">
                      <span className="text-[10px] font-bold text-[var(--text)] uppercase truncate flex-1 pr-2">{mem.mods?.name || "Unknown"}</span>
                      <button onClick={() => handleRemoveMod(mem.id)} className="px-3 py-1.5 theme-panel-danger theme-text-danger rounded-lg text-[9px] font-black uppercase transition-all hover:opacity-80 opacity-0 group-hover:opacity-100">{t("mason_cc_btn_remove")}</button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
            <span className="text-6xl mb-4 grayscale">{t("ui_icon_collection")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("mason_cc_select_set")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MasonRegistry({ masonId }: { masonId: string }) {
  const { t } = useLexicon();
  const [myMods, setMyMods] = useState<any[]>([]);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const[conflicts, setConflicts] = useState<any[]>([]);
  const [protocols, setProtocols] = useState<any[]>([]);
  const [modalMode, setModalMode] = useState<string | null>(null);
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const[isCommitting, setIsCommitting] = useState(false);
  
  const[enemyMod, setEnemyMod] = useState("");
  const[severity, setSeverity] = useState(4);
  const[resolution, setResolution] = useState("");

  const fetchData = async () => {
    const { data } = await supabase.from('mods').select('*, mod_versions(id, dna_hash, version_label, game_version)').eq('mason_id', masonId).order('name');
    if (data) setMyMods(data);
    const { data: cMods } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, mason_id'));
    if (cMods) setCloudMods(cMods);
  };

  const fetchProtocols = async (modId: string) => {
    const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(`child_id.eq.${modId},parent_id.eq.${modId}`);
    let combined: any[] = [];
    if (depLinks) depLinks.forEach(d => { if (d.child_id === modId) combined.push({ id: d.parent_id, type: 'dependency' }); });
    const { data: relLinks } = await supabase.from('mod_relationships').select('parent_id, child_id, relationship_type').or(`child_id.eq.${modId},parent_id.eq.${modId}`);
    if (relLinks) {
       relLinks.forEach(r => {
         if (r.child_id === modId) combined.push({ id: r.parent_id, type: r.relationship_type });
         if (r.parent_id === modId && (r.relationship_type === 'twin' || r.relationship_type === 'rival' || r.relationship_type === 'beta')) combined.push({ id: r.child_id, type: r.relationship_type });
       });
    }
    setProtocols(combined);
  };

  const fetchConflicts = async (modName: string) => {
    const { data } = await supabase.from('logical_conflicts').select('*').or(`mod_a.eq."${modName}",mod_b.eq."${modName}"`);
    if (data) setConflicts(data);
  };

  useEffect(() => { fetchData(); },[]);

  const handleSelectMod = (mod: any) => {
    setActiveMod(mod);
    fetchConflicts(mod.name);
    fetchProtocols(mod.id);
  };

  const handleAddProtocol = async (targetId: string) => {
    if (!activeMod || !modalMode) return;
    try {
      if (modalMode === 'dependency') await supabase.from('mod_dependencies').upsert({ parent_id: targetId, child_id: activeMod.id }, { onConflict: 'parent_id, child_id' });
      else {
        await supabase.from('mod_relationships').upsert({ parent_id: activeMod.id, child_id: targetId, relationship_type: modalMode }, { onConflict: 'parent_id, child_id' });
        if (modalMode === 'twin' || modalMode === 'rival') await supabase.from('mod_relationships').upsert({ parent_id: targetId, child_id: activeMod.id, relationship_type: modalMode }, { onConflict: 'parent_id, child_id' });
      }
      setModalMode(null);
      fetchProtocols(activeMod.id);
    } catch (error) { console.error("Protocol Error:", error); }
  };

  const handleRemoveProtocol = async (targetId: string, type: string) => {
    if (!activeMod) return;
    try {
      if (type === 'dependency') await supabase.from('mod_dependencies').delete().match({ parent_id: targetId, child_id: activeMod.id });
      else {
        await supabase.from('mod_relationships').delete().match({ parent_id: activeMod.id, child_id: targetId, relationship_type: type });
        if (type === 'twin' || type === 'rival') await supabase.from('mod_relationships').delete().match({ parent_id: targetId, child_id: activeMod.id, relationship_type: type });
      }
      fetchProtocols(activeMod.id);
    } catch (error) { console.error("Remove Link Error:", error); }
  };

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
        status: activeMod.status,
        created_at: activeMod.created_at,
        updated_at: activeMod.updated_at,
        compatible_versions: activeMod.compatible_versions
      }).eq('id', activeMod.id);
      fetchData();
      showToast(t("mason_saved_success"), 'success');
    } catch (err: any) { showToast(`${t("mason_saved_error")}${err.message}`, 'success'); }
    setIsCommitting(false);
  };

  const handleAddConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMod || !enemyMod) return;
    await supabase.from('logical_conflicts').insert([{ mod_a: activeMod.name, mod_b: enemyMod, severity_rank: severity, resolution_note: resolution }]);
    setEnemyMod(""); setResolution(""); setSeverity(4);
    fetchConflicts(activeMod.name);
  };

  const handleDeleteConflict = async (id: string) => {
    await supabase.from('logical_conflicts').delete().eq('id', id);
    fetchConflicts(activeMod.name);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      <div className="w-full lg:w-1/3 flex flex-col gap-2 overflow-y-auto custom-scrollbar theme-glass-panel rounded-[2rem] rounded-[2rem] p-4 shadow-2xl">
        {myMods.map(mod => (
          <button key={mod.id} onClick={() => handleSelectMod(mod)} className={`text-left px-5 py-4 rounded-xl border transition-all flex flex-col gap-1 ${activeMod?.id === mod.id ? 'theme-panel-accent theme-border-accent shadow-lg' : 'theme-glass-inner border-white/5 hover:theme-panel-accent hover:bg-opacity-10 text-[var(--subtext)] opacity-80 hover:text-[var(--text)]'}`}>
            <span className="font-black text-xs uppercase tracking-tight truncate w-full">{mod.name}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest">{mod.mod_versions?.length || 0} {t("mason_known_signatures")}</span>
          </button>
        ))}
      </div>

      <div className="w-full lg:w-2/3 theme-glass-panel rounded-[2rem] rounded-[2.5rem] shadow-2xl overflow-y-auto custom-scrollbar p-10 flex flex-col relative z-10">
        {activeMod ? (
          <div className="flex flex-col gap-8">
            <div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0 gap-6">
              <div className="flex-1 min-w-0">
                <input value={activeMod.name} onChange={e => setActiveMod({...activeMod, name: e.target.value})} className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter mb-1 w-full bg-transparent border-b border-white/20 focus:border-white focus:outline-none transition-all" />
                <p className="text-[10px] font-mono theme-text-accent tracking-[0.2em] uppercase truncate mt-2">{t("registry_uuid")}{activeMod.id}</p>
              </div>
              <button onClick={handleCommitChanges} disabled={isCommitting} className="shrink-0 px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg theme-bg-accent text-[var(--bg)] hover:opacity-90 hover:scale-105 active:scale-95">
                {isCommitting ? t("mason_saving") : t("mason_save_meta")}
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({...activeMod, category_override: val})} />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Sub Classification</label>
                <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} placeholder="e.g. Trait, Career, Bed" className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2 xl:col-span-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Condition Protocol</label>
                <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">UPLOADED DATE</label>
                <input type="date" value={activeMod.created_at ? new Date(activeMod.created_at).toISOString().slice(0, 10) : ""} onChange={e => setActiveMod({...activeMod, created_at: e.target.value ? new Date(e.target.value).toISOString() : null})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent custom-date-input" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">LAST UPDATED</label>
                <input type="date" value={activeMod.updated_at ? new Date(activeMod.updated_at).toISOString().slice(0, 10) : ""} onChange={e => setActiveMod({...activeMod, updated_at: e.target.value ? new Date(e.target.value).toISOString() : null})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent custom-date-input" />
              </div>

              <div className="flex flex-col gap-2 col-span-full">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">GAME VERSIONS</label>
                <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({...activeMod, compatible_versions: v})} />
              </div>

            </div>

            <div className="mt-8 pt-8 border-t border-white/10 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter flex items-center gap-3"><span className="text-2xl">🧬</span> Protocols</h3>
                <button onClick={() => setVisualizerOpen(true)} className="px-6 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95">OPEN VISUAL EDITOR</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {['dependency', 'addon', 'twin', 'rival', 'beta'].map(mode => {
                    const linked = protocols.filter(p => p.type === mode);
                    return (
                      <div key={mode} className="theme-glass-inner rounded-2xl p-4 flex flex-col gap-4">
                         <div className="flex justify-between items-center">
                           <h4 className="text-xs font-black uppercase text-[var(--text)] tracking-widest">{mode}</h4>
                           <button onClick={() => setModalMode(mode)} className="px-3 py-1 bg-white/5 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] text-[9px] font-black uppercase rounded-lg transition-all shadow-md">+ Link</button>
                         </div>
                         <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar max-h-32">
                           {linked.length > 0 ? linked.map(l => (
                             <div key={l.id} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[10px] font-bold text-[var(--text)] truncate">{cloudMods.find(c => c.id === l.id)?.name || "Unknown"}</span>
                                <button onClick={() => handleRemoveProtocol(l.id, mode)} className="theme-text-danger hover:opacity-80 text-[10px] font-black">✕</button>
                             </div>
                           )) : <span className="text-[10px] text-gray-600 font-bold tracking-widest uppercase p-2 text-center">None Linked</span>}
                         </div>
                      </div>
                    );
                 })}
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-white/10 space-y-6">
              <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter flex items-center gap-3"><span className="text-2xl">⚔️</span> {t("mason_conflict_title")}</h3>
              
              <form onSubmit={handleAddConflict} className="theme-glass-inner p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row gap-4 items-center">
                <ModSearchDropdown placeholder={t("mason_enemy_placeholder")} value={enemyMod} onChange={setEnemyMod} mods={cloudMods} />
                <CustomTierDropdown value={severity} onChange={(val) => setSeverity(val)} />
                <button type="submit" className="w-full md:w-auto px-6 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all">{t("mason_add_rule")}</button>
              </form>

              <div className="grid gap-3">
                {conflicts.map(c => (
                  <div key={c.id} className="flex justify-between items-center theme-glass-inner p-4 rounded-xl">
                    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
                      <span className="text-[var(--text)]">{c.mod_a}</span>
                      <span className="theme-text-danger">{t("nexus_vs")}</span>
                      <span className="text-[var(--text)]">{c.mod_b}</span>
                    </div>
                    <button onClick={() => handleDeleteConflict(c.id)} className="px-4 py-2 theme-panel-danger theme-text-danger rounded-lg text-[9px] font-black transition-all hover:opacity-80">{t("mason_btn_remove")}</button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
            <span className="text-6xl mb-4 grayscale">{t("ui_icon_mason")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("registry_select_master")}</span>
          </div>
        )}
      </div>
      <ProtocolSearchModal isOpen={!!modalMode} onClose={() => setModalMode(null)} onSelect={handleAddProtocol} cloudMods={cloudMods} mode={modalMode || ''} />

    </div>
  );
}

function CustomClassificationDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const options =[{ id: 'Script', label: t("class_dd_script") }, { id: 'BuildBuy', label: t("class_dd_buildbuy") }, { id: 'CAS', label: t("class_dd_cas") }, { id: 'Animation', label: t("class_dd_animation") }];
  const selected = options.find(o => o.id === value) || options[0];
  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all text-[var(--text)]">
        {selected.label} <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {options.map(opt => <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className="w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 flex items-center gap-3 text-[var(--text)]">{opt.label}</button>)}
        </div>
      )}
    </div>
  );
}

function MasonPostsEditor({ masonId }: { masonId: string }) {
  const { t } = useLexicon();
  const[posts, setPosts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const fetchPosts = async () => {
    const { data } = await supabase.from('mason_posts').select('*').eq('mason_id', masonId).order('created_at', { ascending: false });
    if (data) setPosts(data);
  };

  useEffect(() => { fetchPosts(); },[]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setIsSubmitting(true);
    let payload: any = { mason_id: masonId, title: title.trim(), content: content.trim() };
    if (imageUrl.trim()) payload.image_url = imageUrl.trim();

    let error = null;
      const performSave = async (data: any) => {
        if (editingPostId) {
          const res = await supabase.from('mason_posts').update(data).eq('id', editingPostId);
          return res.error;
        } else {
          const res = await supabase.from('mason_posts').insert([data]);
          return res.error;
        }
      };
      error = await performSave(payload);
      if (error && error.message && error.message.includes('image_url')) {
        if (imageUrl.trim()) payload.content = `[IMG:${imageUrl.trim()}]\n\n` + payload.content;
        delete payload.image_url;
        error = await performSave(payload);
      }

    if (!error) {
      setTitle(""); setContent(""); setImageUrl(""); setEditingPostId(null); fetchPosts();
      showToast(editingPostId ? "Transmission Updated!" : t("mason_post_success"), 'success');
    } else {
      showToast(`Transmission Failed: ${error.message}`, 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('mason_posts').delete().eq('id', id);
    fetchPosts();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
      <div className="w-full lg:w-1/3 flex flex-col gap-4 h-full">
        <div className="theme-glass-panel border border-white/10 rounded-2xl p-6 shadow-inner shrink-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder={t("mason_post_title")} className="theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-xs font-bold focus:outline-none focus:theme-border-accent" />
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Header Image URL (Optional)" className="theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-xs font-mono focus:outline-none focus:theme-border-accent" />
            <textarea required value={content} onChange={e => setContent(e.target.value)} placeholder={t("mason_post_content")} className="theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-xs font-mono h-40 resize-none focus:outline-none focus:theme-border-accent" />
            <button type="submit" disabled={isSubmitting} className="w-full py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all disabled:opacity-50">
              {editingPostId ? "UPDATE TRANSMISSION" : t("mason_btn_post")}
            </button>
          </form>
        </div>
      </div>

      <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2.5rem] shadow-2xl overflow-y-auto custom-scrollbar p-8 flex flex-col gap-4">
        {posts.map(post => (
          <div key={post.id} className="theme-glass-inner p-6 rounded-2xl relative group">
            
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 flex gap-2">
              <button onClick={() => {
                setEditingPostId(post.id);
                setTitle(post.title);
                
                let rawContent = post.content;
                let parsedImage = post.image_url || "";
                if (rawContent.startsWith('[IMG:')) {
                  const endIdx = rawContent.indexOf(']');
                  if (endIdx !== -1) {
                    parsedImage = rawContent.substring(5, endIdx);
                    rawContent = rawContent.substring(endIdx + 1).trim();
                  }
                }
                
                setContent(rawContent);
                setImageUrl(parsedImage);
              }} className="theme-text-warning text-[10px] font-black hover:scale-110 transition-all">✎</button>
              <button onClick={() => handleDelete(post.id)} className="theme-text-danger text-[10px] font-black hover:scale-110 transition-all">✕</button>
            </div>
            <h4 className="text-lg font-black text-[var(--text)] uppercase tracking-tight mb-2 pr-8">{post.title}</h4>
            <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MasonSettings({ profile, onUpdate }: { profile: any, onUpdate: (p: any) => void }) {
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
       showToast("Profile settings saved successfully!", 'success');
    }
    setIsSaving(false);
  };

  return (
    <div className="w-full max-w-2xl theme-glass-panel rounded-[2rem] rounded-[2.5rem] p-10 mx-auto shadow-2xl flex flex-col gap-6">
       <h2 className="text-2xl font-black uppercase tracking-tighter text-[var(--text)]">Creator Identity</h2>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Public Name</label>
         <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Avatar URL (Profile Picture)</label>
         <input value={formData.avatar_url} onChange={e => setFormData({...formData, avatar_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Biography</label>
         <textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent" />
       </div>
       
       <div className="grid grid-cols-2 gap-4">
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Patreon URL</label>
           <input value={formData.patreon_url} onChange={e => setFormData({...formData, patreon_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
         </div>
         <div className="flex flex-col gap-2">
           <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Personal Website</label>
           <input value={formData.website_url} onChange={e => setFormData({...formData, website_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
         </div>
        </div>

       <div className="flex flex-col gap-2">
         <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Discord URL</label>
         <input value={formData.discord_url} onChange={e => setFormData({...formData, discord_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
       </div>
       
       <button onClick={handleSave} disabled={isSaving} className="mt-4 w-full py-4 rounded-xl theme-bg-accent text-[var(--bg)] font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg">
         {isSaving ? "Saving..." : "Save Configuration"}
       </button>
    </div>
  );
}
function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods }: any) {
  const [query, setQuery] = useState("");
  if (!isOpen) return null;
  const results = cloudMods.filter((m:any) =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest theme-text-accent">Select Artifact</h3>
            <button onClick={onClose} className="text-[var(--text)]/50 hover:text-[var(--text)] font-black">?</button>
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
          )) : <div className="p-4 text-center text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">No matches found</div>}
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
        className={`w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '▲' : '▼'}</span>
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

function ModSearchDropdown({ 
  value, 
  onChange, 
  placeholder, 
  mods 
}: { 
  value: string, 
  onChange: (val: string) => void, 
  placeholder: string, 
  mods: any[] 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = mods.filter((m:any) => 
    (m.name || '').toLowerCase().includes(query.toLowerCase()) || 
    (m.master_author || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  return (
    <div className="relative flex-1 w-full">
      <input
        required
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono placeholder:text-[var(--text)]/20"
      />
      
      {isOpen && query.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 max-h-64 overflow-y-auto custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((m:any) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setQuery(m.name);
                    onChange(m.name);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-none flex flex-col transition-colors group"
                >
                  <span className="text-xs font-black text-[var(--text)] uppercase group-hover:theme-text-accent transition-colors">{m.name}</span>
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{m.master_author || 'Unknown'}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                No direct match - custom entry allowed
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MasonStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);

  const options =[
    { id: 'under_review', label: t("status_dd_verified") + " (Queues for Approval)", color: 'theme-text-warning', glow: 'theme-bg-warning' },
    { id: 'broken', label: t("status_dd_broken"), color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 'unverified', label: t("status_dd_unverified"), color: 'text-[var(--subtext)] opacity-80', glow: 'bg-white/10' },
  ];

  if (value === 'verified') {
     options.unshift({ id: 'verified', label: t("status_dd_verified"), color: 'theme-text-success', glow: 'theme-bg-success' });
  }

  const selected = options.find(o => o.id === value) || options.find(o => o.id === 'unverified') || options[0];

  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
            {options.filter(o => o.id !== 'verified' || value === 'verified').map(opt => (
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

function MasonSandbox({ masonId, initialSandboxMod, onClear }: { masonId: string, initialSandboxMod: any, onClear: any }) {
  const { t } = useLexicon();
  const [activeMod, setActiveMod] = useState<any>(initialSandboxMod || null);
  const [isCommitting, setIsCommitting] = useState(false);

  useEffect(() => {
    if (initialSandboxMod) setActiveMod(initialSandboxMod);
  }, [initialSandboxMod]);

  const handleSyncToNetwork = async () => {
    if (!activeMod || !activeMod.hash) {
      showToast("No valid sandbox mod selected or missing hash.", "error");
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
        status: activeMod.status || 'unverified',
        created_at: activeMod.created_at || new Date().toISOString(),
        updated_at: activeMod.updated_at || new Date().toISOString(),
        compatible_versions: activeMod.compatible_versions || []
      }]).select().single();
      
      if (insertError) throw insertError;
      
      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: newMod.id,
          dna_hash: activeMod.hash,
          version_label: "v1.0",
          game_version: activeMod.compatible_versions ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });
      
      if (versionError) throw versionError;

      showToast("Mod synced to network successfully!", "success");
      if (onClear) onClear();
    } catch (err: any) {
      showToast(`Error syncing to network: ${err.message}`, 'error');
    }
    setIsCommitting(false);
  };

  if (!initialSandboxMod) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center h-[500px]">
        <span className="text-6xl mb-4 grayscale">{t("ui_icon_collection")}</span>
        <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("sandbox_no_mod")}</span>
        <p className="text-[10px] mt-2 font-bold max-w-md">{t("sandbox_no_mod_desc")}</p>
      </div>
    );
  }
  
  return (
    <div className="w-full xl:w-2/3 mx-auto theme-glass-panel rounded-[2rem] shadow-2xl p-10 flex flex-col gap-8 relative z-10">
      <div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0 gap-6">
        <div className="flex-1 min-w-0">
          <input value={activeMod.name || ""} onChange={e => setActiveMod({...activeMod, name: e.target.value})} className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter mb-1 w-full bg-transparent border-b border-white/20 focus:border-white focus:outline-none transition-all" placeholder="MOD NAME" />
          <p className="text-[10px] font-mono theme-text-accent tracking-[0.2em] uppercase truncate mt-2">{t("sandbox_locked_hash")} {activeMod.hash}</p>
        </div>
        <button onClick={handleSyncToNetwork} disabled={isCommitting} className="shrink-0 px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg theme-bg-success text-[var(--bg)] hover:opacity-90 hover:scale-105 active:scale-95">
          {isCommitting ? t("sandbox_btn_syncing") : t("sandbox_btn_sync")}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
          <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({...activeMod, category_override: val})} />
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Sub Classification</label>
          <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} placeholder="e.g. Trait, Career, Bed" className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
          <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
        </div>

        <div className="flex flex-col gap-2 xl:col-span-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
          <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
          <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">Condition Protocol</label>
          <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">UPLOADED DATE</label>
          <input type="date" value={activeMod.created_at ? new Date(activeMod.created_at).toISOString().slice(0, 10) : ""} onChange={e => setActiveMod({...activeMod, created_at: e.target.value ? new Date(e.target.value).toISOString() : null})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent custom-date-input" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">LAST UPDATED</label>
          <input type="date" value={activeMod.updated_at ? new Date(activeMod.updated_at).toISOString().slice(0, 10) : ""} onChange={e => setActiveMod({...activeMod, updated_at: e.target.value ? new Date(e.target.value).toISOString() : null})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent custom-date-input" />
        </div>

        <div className="flex flex-col gap-2 col-span-full">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">GAME VERSIONS</label>
          <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({...activeMod, compatible_versions: v})} />
        </div>
      </div>
    </div>
  );
}
