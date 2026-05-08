import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";

export default function ArchitectHub({ userRole }: { userRole?: string }) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");

  const [registrySearch, setRegistrySearch] = useState("");

  const handleNavigate = (tab: string, search: string = "") => {
    setActiveTab(tab);
    if (search) setRegistrySearch(search);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full w-full">
      <ViewHeader title={t("hub_title")} subtitle={t("hub_subtitle")} />

      <div className="flex flex-wrap theme-glass-inner p-1.5 rounded-2xl w-fit mb-2">
        <TabButton id="command_center" label="Command Screen" activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="registry" label={t("hub_tab_registry")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="cc_registry" label={t("hub_tab_cc_assets")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="cc_sets" label={t("hub_tab_cc_sets")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="queue" label={t("hub_tab_queue")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="matrix" label={t("hub_tab_matrix")} activeTab={activeTab} setTab={setActiveTab} />
        <TabButton id="lab" label={t("hub_tab_lab")} activeTab={activeTab} setTab={setActiveTab} />
        {['senior_architect', 'wayfinder', 'admin'].includes(userRole || '') && (
            <TabButton id="senior_architect" label="Senior Architect" activeTab={activeTab} setTab={setActiveTab} />
        )}
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar pr-4 pb-48">
        {activeTab === "command_center" && <CommandCenter onNavigate={handleNavigate} />}
        {activeTab === "registry" && <DNARegistry initialSearch={registrySearch} onClearSearch={() => setRegistrySearch("")} />}
        {activeTab === "cc_registry" && <CCRegistry />}
        {activeTab === "cc_sets" && <CCSetForge />}
        {activeTab === "queue" && <ScoutQueue />}
        {activeTab === "lab" && <ProvingGrounds />}
        {activeTab === "matrix" && <ConflictMatrix />}
        {activeTab === "senior_architect" && <SeniorArchitectTab />}
      </div>
    </div>
  );
}

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

function DNARegistry({ initialSearch = "", onClearSearch }: any = {}) {
  const { t } = useLexicon();
  const[cloudMods, setCloudMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMaster, setActiveMaster] = useState<any | null>(null);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      if (onClearSearch) onClearSearch();
    }
  }, [initialSearch]);
  const[isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);
  
  const[masonsList, setMasonsList] = useState<any[]>([]);

  const [activeDependencies, setActiveDependencies] = useState<any[]>([]);
  const [activeAddons, setActiveAddons] = useState<any[]>([]);
  const [activeTwins, setActiveTwins] = useState<any[]>([]);
  const[activeRivals, setActiveRivals] = useState<any[]>([]);
  const [activeBetas, setActiveBetas] = useState<any[]>([]);
  const [activeConflicts, setActiveConflicts] = useState<any[]>([]);
  const [conflictEnemy, setConflictEnemy] = useState("");
  const [conflictSeverity, setConflictSeverity] = useState(4);
  const [conflictResolution, setConflictResolution] = useState("");
  const [modalMode, setModalMode] = useState<'dependency' | 'addon' | 'twin' | 'rival' | 'beta' | 'bind_hash' | null>(null);

  const[isMasonModalOpen, setIsMasonModalOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [newMasonTier, setNewMasonTier] = useState(0);

  const fetchGlobalCatalog = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('mods').select('*, mod_versions(id, dna_hash, version_label, game_version)').order('name', { ascending: true });
    if (!error && data) setCloudMods(data);
    const { data: mData } = await supabase.from('masons').select('id, name').order('name');
    if (mData) setMasonsList(mData);
    setIsLoading(false);
  };

  useEffect(() => { 
    fetchGlobalCatalog(); 
  }, []);

  const fetchProtocols = async (modId: string) => {
    const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(`child_id.eq.${modId},parent_id.eq.${modId}`);
    if (depLinks && depLinks.length > 0) {
      const depIds = depLinks.map(link => String(link.parent_id) === String(modId) ? link.child_id : link.parent_id);
      const { data: depMods } = await supabase.from('mods').select('id, name').in('id', depIds);
      setActiveDependencies(depMods || []);
    } else setActiveDependencies([]);

    const { data: addonLinks } = await supabase.from('mod_relationships').select('child_id').eq('parent_id', modId).eq('relationship_type', 'addon');
    if (addonLinks && addonLinks.length > 0) {
      const { data: addonMods } = await supabase.from('mods').select('id, name').in('id', addonLinks.map(link => link.child_id));
      setActiveAddons(addonMods || []);
    } else setActiveAddons([]);

    const { data: twinLinks } = await supabase.from('mod_relationships').select('child_id').eq('parent_id', modId).eq('relationship_type', 'twin');
    if (twinLinks && twinLinks.length > 0) {
      const { data: twinMods } = await supabase.from('mods').select('id, name').in('id', twinLinks.map(link => link.child_id));
      setActiveTwins(twinMods || []);
    } else setActiveTwins([]);

    const { data: rivalLinks } = await supabase.from('mod_relationships').select('child_id').eq('parent_id', modId).eq('relationship_type', 'rival');
    if (rivalLinks && rivalLinks.length > 0) {
      const { data: rivalMods } = await supabase.from('mods').select('id, name').in('id', rivalLinks.map(link => link.child_id));
      setActiveRivals(rivalMods ||[]);
    } else setActiveRivals([]);

    const { data: betaLinks } = await supabase.from('mod_relationships').select('child_id').eq('parent_id', modId).eq('relationship_type', 'beta');
    if (betaLinks && betaLinks.length > 0) {
      const { data: betaMods } = await supabase.from('mods').select('id, name').in('id', betaLinks.map(link => link.child_id));
      setActiveBetas(betaMods || []);
    } else setActiveBetas([]);

    const { data: modData } = await supabase.from('mods').select('name').eq('id', modId).single();
    if (modData && modData.name) {
      const { data: confLinks } = await supabase.from('logical_conflicts').select('*').or(`mod_a.eq."${modData.name}",mod_b.eq."${modData.name}"`);
      setActiveConflicts(confLinks || []);
    } else setActiveConflicts([]);
  };

  const handleSelectMaster = (mod: any) => {
    let safeDLC: string[] = [];
    if (Array.isArray(mod.requiredDLC)) safeDLC = mod.requiredDLC;
    else if (typeof mod.requiredDLC === 'string') {
      try { safeDLC = JSON.parse(mod.requiredDLC); }
      catch { safeDLC = String(mod.requiredDLC || '').split(',').map((s: string) => s.trim()).filter(Boolean); }
    }
    if (!Array.isArray(safeDLC)) safeDLC = [];

    setActiveMaster({ ...mod, requiredDLC: safeDLC });
    setCommitSuccess(false);
    fetchProtocols(mod.id);
  };

  const handleAddConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMaster || !conflictEnemy) return;
    await supabase.from('logical_conflicts').insert([{ mod_a: activeMaster.name, mod_b: conflictEnemy, severity_rank: conflictSeverity, resolution_note: conflictResolution }]);
    setConflictEnemy(""); setConflictResolution(""); setConflictSeverity(4);
    fetchProtocols(activeMaster.id);
  };

  const handleDeleteConflict = async (id: string) => {
    await supabase.from('logical_conflicts').delete().eq('id', id);
    if (activeMaster) fetchProtocols(activeMaster.id);
  };

  const handleCommitChanges = async () => {
    if (!activeMaster) return;
    setIsCommitting(true);
    setCommitSuccess(false);
    try {
      const { error } = await supabase.from('mods').update({
        name: activeMaster.name,
        mason_id: activeMaster.mason_id,
        category_override: activeMaster.category_override,
        description: activeMaster.description,
        image_url: activeMaster.image_url,
        url: activeMaster.url,
        status: activeMaster.status,
        requiredDLC: activeMaster.requiredDLC,
        latest_version: activeMaster.latest_version,
        allow_write: activeMaster.allow_write,
        compliance_tier: activeMaster.compliance_tier || 0
      }).eq('id', activeMaster.id);
      if (error) throw error;
      setCommitSuccess(true);
      fetchGlobalCatalog();
      setTimeout(() => setCommitSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to commit changes:", err);
      alert(`${t("registry_commit_changes")}: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCreateMasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMasonName.trim()) return;
    const { data, error } = await supabase.from('masons').insert([{ name: newMasonName.trim(), compliance_tier: newMasonTier }]).select().single();
    if (error) { alert(`${t("registry_err_mason")}${error.message}`); return; }
    
    setMasonsList(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
    setActiveMaster({ ...activeMaster, mason_id: data.id });
    setIsMasonModalOpen(false);
    setNewMasonName("");
    setNewMasonTier(0);
  };

  const handleAddProtocol = async (targetId: string) => {
    if (!activeMaster || !modalMode) return;
    try {
      if (modalMode === 'dependency') {
        await supabase.from('mod_dependencies').upsert({ parent_id: targetId, child_id: activeMaster.id });
      } else if (modalMode === 'addon') {
        await supabase.from('mod_relationships').upsert({ parent_id: activeMaster.id, child_id: targetId, relationship_type: 'addon' });
      } else if (modalMode === 'twin') {
        await supabase.from('mod_relationships').upsert([
          { parent_id: activeMaster.id, child_id: targetId, relationship_type: 'twin' },
          { parent_id: targetId, child_id: activeMaster.id, relationship_type: 'twin' }
        ]);
      } else if (modalMode === 'rival') {
        await supabase.from('mod_relationships').upsert([
          { parent_id: activeMaster.id, child_id: targetId, relationship_type: 'rival' },
          { parent_id: targetId, child_id: activeMaster.id, relationship_type: 'rival' }
        ]);
      } else if (modalMode === 'beta') {
        await supabase.from('mod_relationships').upsert([
          { parent_id: activeMaster.id, child_id: targetId, relationship_type: 'beta' },
          { parent_id: targetId, child_id: activeMaster.id, relationship_type: 'beta' }
        ]);
      } else if (modalMode === 'bind_hash') {

        const targetMod = cloudMods.find(m => String(m.id) === String(targetId));
        if (targetMod && targetMod.mod_versions) {
          const { error } = await supabase.from('mod_versions').update({ mod_id: activeMaster.id }).eq('mod_id', targetId);
          if (!error) {
             await supabase.from('mods').delete().eq('id', targetId);

             const mergedVersions = [...(activeMaster.mod_versions || []), ...(targetMod.mod_versions || [])];
             setActiveMaster({ ...activeMaster, mod_versions: mergedVersions });

             fetchGlobalCatalog();
          } else {
             console.error("Bind Hash Merge Failed:", error);
          }
        }
      }
      fetchProtocols(activeMaster.id);
    } catch (error) { console.error("Protocol Link Failed:", error); }
  };

  const handleRemoveProtocol = async (targetId: string, type: 'dependency' | 'addon' | 'twin' | 'rival' | 'beta') => {
    if (!activeMaster) return;
    try {
      if (type === 'dependency') {
        await supabase.from('mod_dependencies').delete().match({ parent_id: targetId, child_id: activeMaster.id });
      } else {
        await supabase.from('mod_relationships').delete().match({ parent_id: activeMaster.id, child_id: targetId, relationship_type: type });
        if (type === 'twin' || type === 'rival' || type === 'beta') {
          await supabase.from('mod_relationships').delete().match({ parent_id: targetId, child_id: activeMaster.id, relationship_type: type });
        }
      }
      fetchProtocols(activeMaster.id);
    } catch (error) { console.error("Remove Link Failed:", error); }
  };

  const removeDLC = (pack: string) => {
    const updatedDLC = activeMaster.requiredDLC.filter((p: string) => p !== pack);
    setActiveMaster({ ...activeMaster, requiredDLC: updatedDLC });
  };

  const filteredMods = cloudMods.filter(m => 
    (m.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
    (m.master_author || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (m.status || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
      <div className="w-full lg:w-1/3 flex flex-col gap-4 h-full">
        <div className="theme-glass-inner rounded-2xl p-2 flex items-center shadow-inner">
          <span className="pl-4 pr-2 theme-text-accent animate-pulse">{t("registry_icon_search")}</span>
          <input type="text" placeholder={t("registry_search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-transparent border-none outline-none text-[var(--text)] font-mono text-xs py-2 placeholder:text-[var(--text)]/20" />
        </div>
        <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2rem] overflow-y-auto custom-scrollbar p-4 shadow-2xl">
          {isLoading ? (
            <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">
              {t("registry_downloading")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Array.isArray(filteredMods) && filteredMods.map(mod => (
                <button key={mod.id} onClick={() => handleSelectMaster(mod)} className={`text-left px-5 py-4 rounded-xl border transition-all flex flex-col gap-1 ${activeMaster?.id === mod.id ? 'theme-panel-accent theme-border-accent shadow-lg' : 'theme-glass-inner hover:theme-panel-accent text-[var(--subtext)] opacity-80 hover:text-gray-200'}`}>
                  <span className="font-black text-xs uppercase tracking-tight truncate w-full">{String(mod.name || '')}</span>
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">{String(masonsList.find(m => m.id === mod.mason_id)?.name || mod.master_author || t("registry_unknown_architect"))}</span>
                    <span className={`text-[8px] font-black tracking-widest px-2 py-0.5 rounded uppercase ${mod.status === 'verified' ? 'theme-panel-success' : mod.status === 'under_review' ? 'theme-panel-warning' : 'theme-panel-danger'}`}>
                      {t(`status_dd_${(mod.status || '').replace(' / Fatal', '').toLowerCase()}`)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-2/3 theme-glass-panel rounded-[2rem] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-[-50px] right-[-50px] w-96 h-96 theme-bg-accent opacity-10 blur-[120px] rounded-full pointer-events-none" />
        {activeMaster ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-8 relative z-10">
<div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0 gap-6">
              <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter mb-1 break-words leading-tight">{String(activeMaster.name || '')}</h2>
                <p className="text-[10px] font-mono theme-text-accent tracking-[0.2em] uppercase truncate">{t("registry_uuid")}{String(activeMaster.id || '')}</p>
              </div>
              <button onClick={handleCommitChanges} disabled={isCommitting} className={`shrink-0 px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg ${commitSuccess ? 'theme-bg-accent text-[var(--bg)]' : 'theme-bg-success text-[var(--bg)]'} ${isCommitting ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 hover:scale-105 active:scale-95'}`}>
                {isCommitting ? t("registry_committing") : commitSuccess ? t("registry_secured") : t("registry_commit_changes")}
              </button>
            </div>
            <div className="flex flex-col gap-6 shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_name")}</label>
                  <input value={activeMaster.name || ""} onChange={e => setActiveMaster({...activeMaster, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason")}</label>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown 
                        value={activeMaster.mason_id} 
                        options={masonsList} 
                        onChange={(id: string) => setActiveMaster({...activeMaster, mason_id: id})} 
                      />
                    </div>
                    <button onClick={() => setIsMasonModalOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                      {t("ui_icon_plus")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                  <CustomClassificationDropdown value={activeMaster.category_override || "Script"} onChange={(newType: string) => setActiveMaster({...activeMaster, category_override: newType})} />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">SUB-CATEGORY</label>
                  <input value={activeMaster.sub_category || ""} onChange={e => setActiveMaster({...activeMaster, sub_category: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder="e.g. Tuning, Object, CAS" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_desc")}</label>
                  <textarea value={activeMaster.description || ""} onChange={e => setActiveMaster({...activeMaster, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono h-24 resize-none focus:outline-none focus:theme-border-accent" />
                </div>

              <div className="flex flex-col gap-2 col-span-full md:col-span-1 xl:col-span-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                <input value={activeMaster.image_url || ""} onChange={e => setActiveMaster({...activeMaster, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" placeholder="https://..." />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black theme-text-success uppercase tracking-widest ml-2 flex items-center gap-1">
                  {t("registry_label_version")}
                </label>
                <input value={activeMaster.latest_version || ""} onChange={e => setActiveMaster({ ...activeMaster, latest_version: e.target.value })} placeholder={t("registry_placeholder_version")} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-success text-sm font-bold focus:outline-none focus:theme-border-success" />
              </div>

              <div className="flex flex-col gap-2 col-span-full md:col-span-1 xl:col-span-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeMaster.url || ""} onChange={e => setActiveMaster({...activeMaster, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-mono focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status")}</label>
                <CustomStatusDropdown value={activeMaster.status || "unverified"} onChange={(newStatus: string) => setActiveMaster({...activeMaster, status: newStatus})} />
              </div>

              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-4 pt-8 border-t border-white/10 shrink-0">
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
                  {t("registry_title_lineage")}
                </h3>
                <div className="theme-glass-inner rounded-2xl p-4 flex flex-col gap-2 h-full">
                  {Array.isArray(activeMaster.mod_versions) && activeMaster.mod_versions.length > 0 ? (
                    activeMaster.mod_versions.map((ver: any) => (
                      <div key={ver.id} className={`flex justify-between items-center bg-white/5 border ${ver.version_label === activeMaster.latest_version ? 'border-green-500/50' : 'border-white/5'} px-4 py-2 rounded-lg hover:border-white/20 transition-colors`}>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80 truncate w-1/4" title={String(ver.dna_hash || '')}>{String(ver.dna_hash || '')}</span>
                        <input
                          value={String(ver.version_label || '')}
                          onChange={(e) => {
                            const newVers = activeMaster.mod_versions.map((v: any) => v.id === ver.id ? { ...v, version_label: e.target.value } : v);
                            setActiveMaster({ ...activeMaster, mod_versions: newVers });
                            supabase.from('mod_versions').update({ version_label: e.target.value }).eq('id', ver.id).then();
                          }}
                          className="bg-transparent border-b border-white/10 focus:border-white focus:outline-none text-[9px] font-black theme-text-accent uppercase tracking-widest text-center w-1/4 mx-2"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          {ver.version_label === activeMaster.latest_version ? (
                            <span className="text-[9px] font-black text-green-400 uppercase tracking-widest px-2 py-1 bg-green-500/10 rounded">Active</span>
                          ) : (
                            <button 
                              onClick={async () => {
                                setActiveMaster({ ...activeMaster, latest_version: ver.version_label });
                                await supabase.from('mods').update({ latest_version: ver.version_label }).eq('id', activeMaster.id);
                              }} 
                              className="text-[9px] font-black text-[var(--text)] uppercase tracking-widest px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
                            >
                              Make Active
                            </button>
                          )}
                          <button onClick={async () => {
                            await supabase.from('mod_versions').delete().eq('id', ver.id);
                            setActiveMaster({ ...activeMaster, mod_versions: activeMaster.mod_versions.filter((v: any) => v.id !== ver.id) });
                          }} className="theme-text-danger hover:theme-panel-danger px-2 py-1 rounded text-[9px] font-black transition-colors">{t("registry_btn_sever")}</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <span className="text-[10px] text-gray-600 font-bold tracking-widest uppercase text-center">{t("registry_no_dna")}</span>
                    </div>
                  )}
                  <button onClick={() => setModalMode('bind_hash')} className="mt-auto w-full py-3 border border-dashed border-white/20 text-[var(--text)]/50 hover:text-[var(--text)] hover:border-white/50 hover:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    {t("registry_btn_bind")}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
                  {t("registry_title_protocols")}
                </h3>
                <div className="theme-glass-inner rounded-2xl p-4 flex flex-col gap-4 h-full">
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("registry_req_masters")}</span>
                    {Array.isArray(activeDependencies) && activeDependencies.length > 0 ? activeDependencies.map(dep => (
                      <div key={dep.id} className="flex justify-between items-center theme-panel-warning border px-3 py-2 rounded-lg">
                        <span className="text-[10px] font-bold theme-text-warning uppercase truncate">{String(dep.name || '')}</span>
                        <button onClick={() => handleRemoveProtocol(dep.id, 'dependency')} className="theme-text-danger hover:opacity-80 text-[10px] font-black">X</button>
                      </div>
                    )) : <span className="text-[10px] text-gray-600 font-bold tracking-widest uppercase p-2 text-center block">{t("registry_none_linked")}</span>}
                    <button onClick={() => setModalMode('dependency')} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black text-[var(--text)]/50 uppercase tracking-widest transition-all border border-white/5">{t("registry_btn_require")}</button>
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("registry_req_dlc")}</span>
                    <div className="flex flex-wrap gap-2 mb-1">
                      {Array.isArray(activeMaster.requiredDLC) && activeMaster.requiredDLC.length > 0 ? activeMaster.requiredDLC.map((pack: string) => (
                        <div key={pack} className="flex items-center gap-1 theme-panel-success border px-2 py-1 rounded text-[9px] font-bold theme-text-success uppercase animate-in zoom-in-95">
                          {String(pack)} <button onClick={() => removeDLC(pack)} className="ml-1 theme-text-danger hover:opacity-80 font-black">X</button>
                        </div>
                      )) : (
                        <span className="text-[10px] text-gray-600 font-bold tracking-widest uppercase py-1">{t("registry_base_game")}</span>
                      )}
                    </div>
                    <DLCSearchDropdown
                      currentDLC={activeMaster.requiredDLC ||[]}
                      onSelect={(pack: string) => {
                        const current = activeMaster.requiredDLC || [];
                        setActiveMaster({ ...activeMaster, requiredDLC: [...current, pack] });
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-white/5 mt-auto">
                    <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("registry_rel_bonds")}</span>
                    {Array.isArray(activeAddons) && activeAddons.map(addon => (
                      <div key={addon.id} className="flex justify-between items-center px-3 py-1.5 theme-panel-success border rounded-md">
                        <span className="text-[9px] font-bold theme-text-success uppercase truncate">{t("registry_bond_addon")}{String(addon.name || '')}</span>
                        <button onClick={() => handleRemoveProtocol(addon.id, 'addon')} className="theme-text-danger text-[10px] font-black hover:opacity-80">X</button>
                      </div>
                    ))}
                    {Array.isArray(activeTwins) && activeTwins.map(twin => (
                      <div key={twin.id} className="flex justify-between items-center px-3 py-1.5 theme-panel-accent border rounded-md">
                        <span className="text-[9px] font-bold theme-text-accent uppercase truncate">{t("registry_bond_twin")}{String(twin.name || '')}</span>
                        <button onClick={() => handleRemoveProtocol(twin.id, 'twin')} className="theme-text-danger text-[10px] font-black hover:opacity-80">X</button>
                      </div>
                    ))}
                    {Array.isArray(activeRivals) && activeRivals.map(rival => (
                      <div key={rival.id} className="flex justify-between items-center px-3 py-1.5 theme-panel-warning border rounded-md">
                        <span className="text-[9px] font-bold theme-text-warning uppercase truncate">{t("registry_bond_rival")}{String(rival.name || '')}</span>
                        <button onClick={() => handleRemoveProtocol(rival.id, 'rival')} className="theme-text-danger text-[10px] font-black hover:opacity-80">X</button>
                      </div>
                    ))}
                    {Array.isArray(activeBetas) && activeBetas.map(beta => (
                      <div key={beta.id} className="flex justify-between items-center px-3 py-1.5 theme-panel-success border rounded-md">
                        <span className="text-[9px] font-bold theme-text-success uppercase truncate">Beta Protocol: {String(beta.name || '')}</span>
                        <button onClick={() => handleRemoveProtocol(beta.id, 'beta')} className="theme-text-danger text-[10px] font-black hover:opacity-80">X</button>
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button onClick={() => setModalMode('addon')} className="py-2 bg-white/5 hover:theme-panel-success rounded-lg text-[9px] font-black theme-text-success uppercase tracking-widest transition-all border border-transparent hover:theme-border-success">{t("registry_btn_addon")}</button>
                      <button onClick={() => setModalMode('twin')} className="py-2 bg-white/5 hover:theme-panel-accent rounded-lg text-[9px] font-black theme-text-accent uppercase tracking-widest transition-all border border-transparent hover:theme-border-accent">{t("registry_btn_twin")}</button>
                      <button onClick={() => setModalMode('rival')} className="py-2 bg-white/5 hover:theme-panel-warning rounded-lg text-[9px] font-black theme-text-warning uppercase tracking-widest transition-all border border-transparent hover:theme-border-warning">{t("registry_btn_rival")}</button>
                      <button onClick={() => setModalMode('beta')} className="py-2 bg-white/5 hover:theme-panel-success rounded-lg text-[9px] font-black theme-text-success uppercase tracking-widest transition-all border border-transparent hover:theme-border-success">+ Beta</button>
                    </div>
                  </div>

                  </div>
                </div>
              </div>

            <div className="flex flex-col gap-4 mt-8 pt-8 border-t border-white/10 shrink-0">
              <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2">
                Logical Conflicts
              </h3>
              <div className="theme-glass-inner rounded-2xl p-4 flex flex-col gap-4">
                 <form onSubmit={handleAddConflict} className="bg-black/20 p-3 rounded-xl border border-white/5 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4 w-full">
                      <ModSearchDropdown placeholder={t("mason_enemy_placeholder")} value={conflictEnemy} onChange={setConflictEnemy} mods={cloudMods} />
                      <input value={conflictResolution} onChange={(e) => setConflictResolution(e.target.value)} placeholder="Status/Reason Note" className="flex-1 bg-transparent border-b border-white/20 focus:border-white focus:outline-none text-[10px] text-[var(--text)] font-mono py-2 px-2" />
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 w-full items-center justify-between">
                      <CustomTierDropdown value={conflictSeverity} onChange={(val: number) => setConflictSeverity(val)} />
                      <button type="submit" className="w-full md:w-auto py-3 px-8 theme-bg-danger text-[var(--bg)] font-black text-[9px] uppercase tracking-widest rounded-lg hover:opacity-90 transition-all shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.3)]">Add Conflict Rule</button>
                    </div>
                 </form>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-2">
                   {activeConflicts.map(c => (
                        <div key={c.id} className="flex flex-col gap-2 theme-panel-danger border px-4 py-3 rounded-xl hover:border-red-500/50 transition-colors group">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold theme-text-danger uppercase truncate">{c.mod_a === activeMaster.name ? c.mod_b : c.mod_a}</span>
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-md text-[9px] font-black uppercase shadow-sm">T{c.severity_rank}</span>
                              <button type="button" onClick={() => handleDeleteConflict(c.id)} className="theme-text-danger opacity-50 group-hover:opacity-100 hover:!opacity-80 text-[12px] font-black transition-opacity">X</button>
                            </div>
                          </div>
                          {c.resolution_note && (
                            <div className="bg-black/20 p-2 rounded border border-white/5 mt-1">
                              <span className="text-[9px] font-mono text-[var(--text)]/80 truncate block">{c.resolution_note}</span>
                            </div>
                          )}
                        </div>
                   ))}
                 </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-50 relative z-10">
            <span className="text-6xl mb-4 grayscale">{t("registry_icon_select")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("registry_select_master")}</span>
            <span className="text-[10px] font-mono theme-text-accent mt-2 tracking-widest">{t("registry_awaiting_input")}</span>
          </div>
        )}
      </div>

      <ProtocolSearchModal
        isOpen={!!modalMode}
        mode={modalMode || ''}
        cloudMods={cloudMods}
        onClose={() => setModalMode(null)}
        onSelect={handleAddProtocol}
      />

      {isMasonModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--sidebar)] border theme-border-accent rounded-[2rem] p-8 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-2xl font-black uppercase theme-text-accent tracking-tighter mb-1">{t("mason_modal_title")}</h2>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("mason_modal_desc")}</p>
            </div>
            <form onSubmit={handleCreateMasonSubmit} className="flex flex-col gap-4">
              <input 
                autoFocus 
                value={newMasonName} 
                onChange={e => setNewMasonName(e.target.value)} 
                placeholder={t("mason_modal_placeholder")}
                className="w-full theme-glass-inner px-5 py-4 rounded-xl text-sm font-bold text-[var(--text)] focus:outline-none focus:theme-border-accent transition-all"
              />
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">CONTENT RATING</label>
                <CustomComplianceDropdown value={newMasonTier} onChange={setNewMasonTier} />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => { setIsMasonModalOpen(false); setNewMasonName(""); setNewMasonTier(0); }} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-white/5">
                  {t("playsets_btn_cancel")}
                </button>
                <button type="submit" className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 shadow-lg transition-all">
                  {t("mason_btn_mint")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomMasonDropdown({ value, options, onChange }: { value: string, options: any[], onChange: (id: string) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    if (!isOpen) {
      setQuery(selected ? selected.name : "");
    }
  }, [isOpen, selected]);

  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative w-full">
      <div className="relative">
        <input 
          type="text"
          value={isOpen ? query : (selected ? selected.name : "")}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { setIsOpen(true); setQuery(""); }}
          placeholder={t("registry_select_mason")}
          className="w-full theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-black uppercase tracking-widest focus:outline-none transition-all focus:theme-border-accent placeholder:text-[var(--subtext)] placeholder:opacity-60"
        />
        <button onClick={() => setIsOpen(!isOpen)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 text-[10px]">
          {isOpen ? '' : ''}
        </button>
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 max-h-64 overflow-y-auto custom-scrollbar">
            <button onClick={() => { onChange(""); setIsOpen(false); }} className="w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 text-[var(--subtext)] opacity-60 border-b border-white/5">
              {t("registry_select_mason")}
            </button>
            {filtered.map(opt => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); }} className={`w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 ${value === opt.id ? 'theme-text-accent bg-white/5' : 'text-[var(--text)]'}`}>
                {opt.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="w-full text-center px-5 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                No Masons Found
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CCRegistry() {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMaster, setActiveMaster] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [isMasonModalOpen, setIsMasonModalOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [newMasonTier, setNewMasonTier] = useState(0);

  const fetchGlobalCatalog = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('mods')
      .select('*')
      .in('category_override', ['CAS', 'BuildBuy'])
      .order('name', { ascending: true });
    
    if (!error && data) setCloudMods(data);
    
    const { data: mData } = await supabase.from('masons').select('id, name').order('name');
    if (mData) setMasonsList(mData);
    
    setIsLoading(false);
  };

  useEffect(() => { fetchGlobalCatalog(); }, []);

  const handleSelectMaster = (mod: any) => {
    let safeDLC: string[] = [];
    if (Array.isArray(mod.requiredDLC)) safeDLC = mod.requiredDLC;
    else if (typeof mod.requiredDLC === 'string') {
      try { safeDLC = JSON.parse(mod.requiredDLC); }
      catch { safeDLC = String(mod.requiredDLC || '').split(',').map((s: string) => s.trim()).filter(Boolean); }
    }
    if (!Array.isArray(safeDLC)) safeDLC = [];

    setActiveMaster({ ...mod, requiredDLC: safeDLC });
    setCommitSuccess(false);
  };

  const handleCommitChanges = async () => {
    if (!activeMaster) return;
    setIsCommitting(true);
    setCommitSuccess(false);
    try {
      const { error } = await supabase.from('mods').update({
        name: activeMaster.name,
        mason_id: activeMaster.mason_id,
        image_url: activeMaster.image_url,
        url: activeMaster.url,
        status: activeMaster.status,
        requiredDLC: activeMaster.requiredDLC
      }).eq('id', activeMaster.id);
      if (error) throw error;
      setCommitSuccess(true);
      fetchGlobalCatalog();
      setTimeout(() => setCommitSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to commit CC changes:", err);
      alert(`${t("registry_commit_changes")}: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCreateMasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMasonName.trim()) return;
    const { data, error } = await supabase.from('masons').insert([{ name: newMasonName.trim(), compliance_tier: newMasonTier }]).select().single();
    if (error) { alert(`${t("registry_err_mason")}${error.message}`); return; }
    
    setMasonsList(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
    setActiveMaster({ ...activeMaster, mason_id: data.id });
    setIsMasonModalOpen(false);
    setNewMasonName("");
    setNewMasonTier(0);
  };

  const removeDLC = (pack: string) => {
    const updatedDLC = activeMaster.requiredDLC.filter((p: string) => p !== pack);
    setActiveMaster({ ...activeMaster, requiredDLC: updatedDLC });
  };

  const filteredMods = cloudMods.filter(m => 
    ((m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (m.master_author || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (filter === "ALL" || m.category_override === filter)
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)] relative">
      <div className="w-full lg:w-1/3 flex flex-col gap-4 h-full">
        <div className="theme-glass-inner rounded-2xl p-2 flex flex-col gap-2 shadow-inner">
          <div className="flex items-center px-4 py-1">
            <span className="theme-text-accent animate-pulse mr-2">{t("registry_icon_search")}</span>
            <input 
              type="text" 
              placeholder={t("ccreg_search")} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full bg-transparent border-none outline-none text-[var(--text)] font-mono text-xs py-2 placeholder:text-[var(--text)]/20" 
            />
          </div>
          <div className="flex gap-1 p-1 border-t border-white/5">
            {["ALL", "CAS", "BuildBuy"].map(fTag => (
              <button
                key={fTag}
                onClick={() => setFilter(fTag)}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all
                  ${filter === fTag ? 'theme-bg-accent text-[var(--bg)] shadow-lg' : 'text-[var(--subtext)] opacity-60 hover:text-[var(--text)] hover:bg-white/5'}`}
              >
                {fTag === "ALL" ? t("vault_cat_all") : fTag}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 theme-glass-panel rounded-[2rem] rounded-[2rem] overflow-y-auto custom-scrollbar p-4 shadow-2xl">
          {isLoading ? (
            <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">
              {t("ccreg_downloading")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMods.map(mod => (
                <button 
                  key={mod.id} 
                  onClick={() => handleSelectMaster(mod)} 
                  className={`text-left px-5 py-4 rounded-xl border transition-all flex flex-col gap-1 ${activeMaster?.id === mod.id ? 'theme-panel-accent theme-border-accent shadow-lg' : 'theme-glass-inner hover:theme-panel-accent text-[var(--subtext)] opacity-80 hover:text-gray-200'}`}
                >
                  <span className="font-black text-xs uppercase tracking-tight truncate w-full">{String(mod.name || '')}</span>
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">{String(masonsList.find(m => m.id === mod.mason_id)?.name || mod.master_author || t("registry_unknown_architect"))}</span>
                    <span className="text-[8px] font-black theme-text-accent opacity-50 uppercase tracking-widest">{mod.category_override}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-2/3 theme-glass-panel rounded-[2rem] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-[-50px] right-[-50px] w-96 h-96 theme-bg-accent opacity-10 blur-[120px] rounded-full pointer-events-none" />
        {activeMaster ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-8 relative z-10">
            <div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0 gap-6">
              <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter mb-1 break-words leading-tight">{String(activeMaster.name || '')}</h2>
                <p className="text-[10px] font-mono theme-text-accent tracking-[0.2em] uppercase truncate">{t("registry_uuid")}{String(activeMaster.id || '')}</p>
              </div>
              <button 
                onClick={handleCommitChanges} 
                disabled={isCommitting} 
                className={`shrink-0 px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg ${commitSuccess ? 'theme-bg-accent text-[var(--bg)]' : 'theme-bg-success text-[var(--bg)]'} ${isCommitting ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 hover:scale-105 active:scale-95'}`}
              >
                {isCommitting ? t("registry_committing") : commitSuccess ? t("registry_secured") : t("registry_commit_changes")}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_name")}</label>
                <input value={activeMaster.name || ""} onChange={e => setActiveMaster({...activeMaster, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason")}</label>
                <div className="flex gap-2 relative">
                  <div className="flex-1 min-w-0">
                    <CustomMasonDropdown 
                      value={activeMaster.mason_id} 
                      options={masonsList} 
                      onChange={(id: string) => setActiveMaster({...activeMaster, mason_id: id})} 
                    />
                  </div>
                  <button onClick={() => setIsMasonModalOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                    {t("ui_icon_plus")}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 col-span-full">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_image")}</label>
                <input value={activeMaster.image_url || ""} onChange={e => setActiveMaster({...activeMaster, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-mono focus:outline-none focus:theme-border-accent" placeholder="https://..." />
              </div>

              <div className="flex flex-col gap-2 col-span-full">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                <input value={activeMaster.url || ""} onChange={e => setActiveMaster({...activeMaster, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-mono focus:outline-none focus:theme-border-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status")}</label>
                <CustomStatusDropdown value={activeMaster.status || "unverified"} onChange={(newStatus: string) => setActiveMaster({...activeMaster, status: newStatus})} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">SAFETY RATING</label>
                <CustomComplianceDropdown value={activeMaster.compliance_tier || 0} onChange={(newTier: number) => setActiveMaster({...activeMaster, compliance_tier: newTier})} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_req_dlc")}</label>
                <div className="theme-glass-inner rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(activeMaster.requiredDLC) && activeMaster.requiredDLC.length > 0 ? activeMaster.requiredDLC.map((pack: string) => (
                      <div key={pack} className="flex items-center gap-1 theme-panel-success border px-2 py-1 rounded text-[9px] font-bold theme-text-success uppercase animate-in zoom-in-95">
                        {String(pack)} <button onClick={() => removeDLC(pack)} className="ml-1 theme-text-danger hover:opacity-80 font-black"></button>
                      </div>
                    )) : (
                      <span className="text-[10px] text-gray-600 font-bold tracking-widest uppercase py-1">{t("registry_base_game")}</span>
                    )}
                  </div>
                  <DLCSearchDropdown
                    currentDLC={activeMaster.requiredDLC ||[]}
                    onSelect={(pack: string) => {
                      const current = activeMaster.requiredDLC || [];
                      setActiveMaster({ ...activeMaster, requiredDLC: [...current, pack] });
                    }}
                  />
                </div>
              </div>
            </div>

            {activeMaster.image_url && (
              <div className="mt-4 border-t border-white/10 pt-8">
                <div className="aspect-video w-full rounded-3xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl relative group">
                  <img src={activeMaster.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="CC Preview" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-50 relative z-10">
            <span className="text-6xl mb-4 grayscale"></span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("ccreg_search")}</span>
            <span className="text-[10px] font-mono theme-text-accent mt-2 tracking-widest">{t("registry_awaiting_input")}</span>
          </div>
        )}
      </div>

      {isMasonModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--sidebar)] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 flex flex-col gap-6 animate-in zoom-in-95">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter">{t("mason_modal_title")}</h3>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">{t("mason_modal_desc")}</p>
              </div>
              <button onClick={() => setIsMasonModalOpen(false)} className="text-[var(--text)]/20 hover:text-[var(--text)] transition-colors">
                {t("ui_icon_close")}
              </button>
            </div>

            <form onSubmit={handleCreateMasonSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_name")}</label>
                <input 
                  autoFocus
                  placeholder={t("mason_modal_placeholder")}
                  value={newMasonName}
                  onChange={e => setNewMasonName(e.target.value)}
                  className="theme-glass-inner rounded-2xl px-6 py-4 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">CONTENT RATING</label>
                <CustomComplianceDropdown value={newMasonTier} onChange={setNewMasonTier} />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => { setIsMasonModalOpen(false); setNewMasonName(""); setNewMasonTier(0); }} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black text-[11px] uppercase tracking-[0.2em] rounded-2xl transition-all border border-white/5">
                  {t("playsets_btn_cancel")}
                </button>
                <button 
                  type="submit"
                  disabled={!newMasonName.trim()}
                  className="flex-1 py-4 theme-bg-accent text-[var(--bg)] rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale"
                >
                  {t("mason_btn_mint")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CCSetForge() {
  const { t } = useLexicon();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSet, setActiveSet] = useState<any | null>(null);
  const [manifestMembers, setManifestMembers] = useState<any[]>([]);
  const [setName, setSetName] = useState("");
  const [setCreator, setSetCreator] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const[isSearching, setIsSearching] = useState(false);

  const fetchSets = async () => {
    const { data } = await supabase.from('cc_sets').select('*').order('name', { ascending: true });
    if (data) setSets(data);
  };

  const fetchManifest = async (setId: string) => {
    const { data, error } = await supabase.from('cc_set_members').select(`id, mod_id, mods ( id, name, master_author, category_override, image_url )`).eq('set_id', setId);
    if (!error && data) setManifestMembers(data);
  };

  const searchCCAssets = async () => {
    if (assetSearch.length < 2) return;
    setIsSearching(true);
    const { data } = await supabase.from('mods').select('*').in('category_override', ['CAS', 'BuildBuy']).ilike('name', `%${assetSearch}%`).limit(10);
    if (data) setAvailableAssets(data);
    setIsSearching(false);
  };

  const saveSetMeta = async () => {
    if (!activeSet) return;
    const { error } = await supabase.from('cc_sets').update({
      name: activeSet.name,
      creator_name: activeSet.creator_name,
      image_url: activeSet.image_url
    }).eq('id', activeSet.id);
    if (!error) fetchSets();
  };

  const addToManifest = async (modId: string) => {
    if (!activeSet) return;
    await supabase.from('cc_set_members').upsert({ set_id: activeSet.id, mod_id: modId });
    fetchManifest(activeSet.id);
  };

  const removeFromManifest = async (memberId: string) => {
    await supabase.from('cc_set_members').delete().eq('id', memberId);
    if (activeSet) fetchManifest(activeSet.id);
  };

  useEffect(() => { fetchSets(); },[]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (assetSearch) searchCCAssets(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [assetSearch]);

  const handleSelectSet = (setItem: any) => { setActiveSet(setItem); fetchManifest(setItem.id); };

  const createSet = async () => {
    if (!setName) return;
    const { data, error } = await supabase.from('cc_sets').insert([{ name: setName, creator_name: setCreator, is_official: true }]).select().single();
    if (!error && data) { setSets([...sets, data]); setSetName(""); setSetCreator(""); }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
      <div className="w-full lg:w-1/4 flex flex-col gap-4">
        <div className="theme-glass-panel border border-white/10 p-5 rounded-[2rem] flex flex-col gap-3 shadow-inner">
          <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest ml-1">{t("forge_new_set")}</h4>
          <input placeholder={t("forge_set_name")} value={setName} onChange={e => setSetName(e.target.value)} className="theme-glass-inner rounded-xl px-4 py-2 text-[var(--text)] outline-none focus:theme-border-accent" />
          <input placeholder={t("forge_creator")} value={setCreator} onChange={e => setSetCreator(e.target.value)} className="theme-glass-inner rounded-xl px-4 py-2 text-[var(--text)] outline-none focus:theme-border-accent" />
          <button onClick={createSet} className="theme-bg-accent text-[var(--bg)] hover:opacity-90 font-black text-[10px] py-3 rounded-xl transition-all">{t("forge_init_set")}</button>
        </div>

        <div className="flex-1 theme-glass-panel rounded-[2rem] overflow-y-auto custom-scrollbar p-3">
          {sets.map(setItem => (
            <button key={setItem.id} onClick={() => handleSelectSet(setItem)} className={`w-full text-left px-5 py-4 rounded-2xl mb-2 transition-all border flex flex-col gap-1 ${activeSet?.id === setItem.id ? 'theme-panel-accent theme-border-accent shadow-xl' : 'theme-glass-inner border-transparent text-[var(--subtext)] opacity-60 hover:text-gray-200'}`}>
              <span className="font-black text-[11px] uppercase truncate">{setItem.name}</span>
              <span className="text-[8px] font-bold opacity-50 uppercase tracking-widest">{setItem.creator_name || t("registry_unknown_architect")}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 theme-glass-panel rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
        {activeSet ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-8 border-b border-white/10 flex flex-col gap-6 theme-glass-inner shrink-0 relative z-10">
              <div className="flex justify-between items-center">
                <input value={activeSet.name} onChange={e => setActiveSet({...activeSet, name: e.target.value})} className="text-4xl font-black text-[var(--text)] bg-transparent border-none p-0 outline-none uppercase w-full focus:theme-text-accent" />
                <button onClick={saveSetMeta} className="px-6 py-2 theme-bg-accent text-[var(--bg)] rounded-xl text-[10px] font-black hover:opacity-90 shadow-xl">{t("forge_save_sig")}</button>
              </div>
              <div className="flex gap-4">
                <input placeholder={t("forge_architect")} value={activeSet.creator_name || ""} onChange={e => setActiveSet({...activeSet, creator_name: e.target.value})} className="theme-glass-panel rounded-lg px-3 py-1 text-[10px] text-[var(--subtext)] opacity-80 outline-none" />
                <input placeholder={t("forge_cover_url")} value={activeSet.image_url || ""} onChange={e => setActiveSet({...activeSet, image_url: e.target.value})} className="flex-1 theme-glass-panel rounded-lg px-3 py-1 text-[10px] text-[var(--subtext)] opacity-80 font-mono outline-none" />
              </div>
              
              <div className="relative">
                <div className="flex items-center gap-3 theme-glass-inner px-5 py-3 rounded-2xl focus-within:theme-border-accent">
                  <span className={isSearching ? "animate-spin theme-text-accent" : "theme-text-accent"}>{t("registry_icon_search")}</span>
                  <input placeholder={t("forge_search_assets")} value={assetSearch} onChange={e => setAssetSearch(e.target.value)} className="bg-transparent border-none outline-none text-[var(--text)] text-sm font-bold w-full" />
                </div>
                {assetSearch.length >= 2 && availableAssets.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    {availableAssets.filter(asset => !manifestMembers.some(m => m.mod_id === asset.id)).map(asset => (
                      <button key={asset.id} onClick={() => addToManifest(asset.id)} className="w-full text-left px-6 py-4 hover:theme-panel-accent border-b border-white/5 flex justify-between items-center group transition-all">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-[var(--text)] uppercase">{asset.name}</span>
                          <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase">{asset.master_author}</span>
                        </div>
                        <span className="text-[10px] font-black theme-text-accent opacity-0 group-hover:opacity-100">{t("forge_add")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
              {manifestMembers.map(member => (
                <div key={member.id} className="theme-glass-inner rounded-2xl p-4 flex items-center gap-4 group hover:theme-border-accent">
                  <div className="w-10 h-10 rounded-xl bg-[var(--sidebar)] border border-white/5 overflow-hidden flex items-center justify-center shrink-0">
                    {member.mods?.image_url ? <img src={member.mods.image_url} className="w-full h-full object-cover" /> : <span className="text-xl"> </span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-[10px] font-black text-[var(--text)] uppercase truncate">{member.mods?.name}</h5>
                    <p className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase truncate">{member.mods?.master_author}</p>
                  </div>
                  <button onClick={() => removeFromManifest(member.id)} className="w-8 h-8 theme-text-danger hover:theme-bg-danger hover:text-[var(--text)] rounded-lg transition-all opacity-0 group-hover:opacity-100"></button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30">
            <span className="text-8xl mb-6 grayscale">{t("forge_icon_idle")}</span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.5em]">{t("forge_idle")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoutQueue() {
  const { t } = useLexicon();
  const[submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('scout_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); },[]);

  const handleAction = async (id: string, action: 'approved' | 'rejected', data?: any) => {
    if (action === 'approved' && data) {
      const { data: modData } = await supabase.from('mods').upsert({
        name: data.suggested_name,
        master_author: data.suggested_author,
        category_override: data.category_override,
        url: data.suggested_url,
        status: 'verified'
      }, { onConflict: 'name' }).select().single();
      
      if (modData) {
        await supabase.from('mod_versions').upsert({
          mod_id: modData.id,
          dna_hash: data.dna_hash,
          version_label: 'v.Scout'
        }, { onConflict: 'dna_hash' });
      }
    }
    await supabase.from('scout_suggestions').update({ status: action }).eq('id', id);
    fetchSubmissions();
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="theme-glass-inner p-6 rounded-3xl shrink-0">
        <h3 className="text-sm font-black theme-text-accent uppercase tracking-[0.2em]">{t("scout_incoming")}</h3>
        <p className="text-[10px] text-[var(--subtext)] opacity-60 uppercase font-bold tracking-widest mt-1">{t("scout_reviewing")}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center theme-text-accent animate-pulse font-black text-xs uppercase tracking-widest">{t("scout_intercepting")}</div>
        ) : submissions.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-white/5 rounded-3xl text-center opacity-30">
            <span className="text-[var(--subtext)] opacity-60 font-black uppercase tracking-widest text-xs">{t("scout_quiet")}</span>
          </div>
        ) : (
          submissions.map(sub => (
            <div key={sub.id} className="theme-glass-panel rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-right-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 theme-panel-accent border rounded text-[9px] font-black uppercase tracking-widest">
                    {sub.suggested_type || t("scout_unknown")}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 truncate max-w-[200px]" title={sub.dna_hash}>{t("scout_dna")}{sub.dna_hash}</span>
                </div>
                <h4 className="text-lg font-black text-[var(--text)] uppercase tracking-tight">{sub.suggested_name || t("scout_unnamed")}</h4>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("scout_author")}<span className="text-[var(--text)]">{sub.suggested_author || t("scout_unknown")}</span></p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleAction(sub.id, 'rejected')}
                  className="px-6 py-3 border theme-border-danger theme-text-danger rounded-xl font-black text-[10px] uppercase tracking-widest hover:theme-panel-danger transition-all"
                >
                  {t("scout_discard")}
                </button>
                <button
                  onClick={() => handleAction(sub.id, 'approved', sub)}
                  className="px-6 py-3 theme-bg-success text-[var(--bg)] rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 shadow-lg transition-all"
                >
                  {t("scout_approve")}
                </button>
              </div>
            </div>
          ))
        )}
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
        <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '' : ''}</span>
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

function ConflictMatrix() {
  const { t } = useLexicon();
  const[ghosts, setGhosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modA, setModA] = useState("");
  const [modB, setModB] = useState("");
  const [severity, setSeverity] = useState(4);
  const [note, setNote] = useState("");
  const [allMods, setAllMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchMods = async () => {
    const { data } = await supabase.from('mods').select('id, name, master_author').order('name');
    if (data) setAllMods(data);
  };

  const fetchGhosts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('logical_conflicts').select('*').order('created_at', { ascending: false });
    if (!error && data) setGhosts(data);
    setLoading(false);
  };

  useEffect(() => { 
    fetchGhosts(); 
    fetchMods();
  }, []);

  const handleAddGhost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modA || !modB) return;
    const { error } = await supabase.from('logical_conflicts').insert([{ mod_a: modA, mod_b: modB, severity_rank: severity, resolution_note: note }]);
    if (!error) { setModA(""); setModB(""); setNote(""); fetchGhosts(); }
  };

  const handleDeleteGhost = async (id: number) => {
    const { error } = await supabase.from('logical_conflicts').delete().eq('id', id);
    if (!error) fetchGhosts();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="theme-glass-panel rounded-[2rem] p-8 shadow-2xl relative overflow-visible">
        <div className="absolute top-0 right-0 w-64 h-64 theme-bg-accent opacity-10 blur-[100px] rounded-full pointer-events-none" />
        <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-tighter flex items-center gap-3 mb-6 relative z-50">
          {t("nexus_forge_title")}
        </h3>
        <form onSubmit={handleAddGhost} className="flex flex-col gap-4 relative z-50">
          <div className="flex flex-col md:flex-row gap-4 relative z-50">
            <ModSearchDropdown 
              placeholder={t("nexus_enemy_a")}
              value={modA}
              onChange={setModA}
              mods={allMods}
            />
            <div className="flex items-center justify-center theme-text-danger font-black text-xl animate-pulse relative z-10">{t("nexus_icon_vs")}</div>
            <ModSearchDropdown 
              placeholder={t("nexus_enemy_b")}
              value={modB}
              onChange={setModB}
              mods={allMods}
            />
            <CustomTierDropdown value={severity} onChange={setSeverity} />
          </div>
          <textarea
            placeholder={t("nexus_resolution")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all font-mono h-24 resize-none placeholder:text-[var(--text)]/20"
          />
          <button
            type="submit"
            className="w-full py-4 theme-bg-accent text-[var(--bg)] font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:opacity-90 transition-all shadow-lg active:scale-[0.98]"
          >
            {t("nexus_inject")}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        <div className="theme-glass-inner rounded-xl p-2 flex items-center shadow-inner mb-2 w-full lg:w-1/2">
          <span className="pl-4 pr-2 theme-text-accent animate-pulse">{t("registry_icon_search")}</span>
          <input 
            type="text" 
            placeholder="Search conflicts by mod name or note..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full bg-transparent border-none outline-none text-[var(--text)] font-mono text-xs py-2 placeholder:text-[var(--text)]/20" 
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-full p-12 text-center">
              <span className="theme-text-accent font-black uppercase tracking-widest text-xs animate-pulse">{t("nexus_syncing")}</span>
            </div>
          ) : (
            ghosts.filter(g => 
              (g.mod_a || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
              (g.mod_b || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
              (g.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase())
            ).map((g) => (
            <div key={g.id} className={`theme-glass-inner rounded-2xl overflow-hidden flex flex-col group hover:bg-black/60 transition-colors ${g.severity_rank === 4 ? 'border-l-4 theme-border-danger' : 'border-l-4 theme-border-warning'}`}>
              <div className="flex justify-between items-center px-6 py-4 bg-white/5 border-b border-white/5">
                <div className="flex gap-3 items-center font-black text-sm tracking-tight truncate">
                  <span className="text-[var(--text)] truncate">{g.mod_a}</span>
                  <span className="theme-text-danger text-[10px]">{t("nexus_vs")}</span>
                  <span className="text-[var(--text)] truncate">{g.mod_b}</span>
                </div>
                <div className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest shrink-0 ${g.severity_rank === 4 ? 'theme-panel-danger border' : 'theme-panel-warning border'}`}>
                  {t("nexus_rank")}{g.severity_rank}
                </div>
              </div>
              <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 h-full">
                <div className="flex-1">
                  <div className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] mb-2">{t("nexus_sys_directive")}</div>
                  <div className="theme-text-success text-sm font-mono leading-relaxed">{g.resolution_note}</div>
                </div>
                <button
                  onClick={() => handleDeleteGhost(g.id)}
                  className="px-6 py-2 bg-transparent theme-text-danger theme-border-danger border hover:theme-panel-danger rounded-lg font-black text-[10px] tracking-widest transition-all shrink-0"
                >
                  {t("nexus_purge")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

function ProvingGrounds() {
  const { t } = useLexicon();
  const [primaryMod, setPrimaryMod] = useState<any | null>(null);
  const [secondaryMod, setSecondaryMod] = useState<any | null>(null);
  const [allMods, setAllMods] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchMods = async () => {
      const { data } = await supabase.from('mods').select('id, name, master_author').order('name');
      if (data) setAllMods(data);
    };
    fetchMods();
  }, []);

  const runSimulation = async () => {
      if (!primaryMod || !secondaryMod) return;
      setIsLoading(true);
      const { data } = await supabase.from('logical_conflicts').select('*')
        .or(`and(mod_a.eq."${primaryMod.name}",mod_b.eq."${secondaryMod.name}"),and(mod_a.eq."${secondaryMod.name}",mod_b.eq."${primaryMod.name}")`);
      setConflicts(data || []);
      setIsLoading(false);
    };

    return (
      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-50">
          <div className="theme-glass-inner rounded-[2rem] p-8 flex flex-col gap-6 shadow-inner relative z-50">
            <h3 className="text-sm font-black theme-text-accent uppercase tracking-widest">{t("lab_primary_mod")}</h3>
            <ModSearchDropdown 
              value={primaryMod?.name || ""} 
              onChange={(val) => {
                  const found = allMods.find(m => m.name === val);
                  if (found) setPrimaryMod(found);
                  else setPrimaryMod({ name: val });
              }} 
              placeholder={t("lab_select_primary")} 
              mods={allMods} 
            />
          </div>
          <div className="theme-glass-inner rounded-[2rem] p-8 flex flex-col gap-6 shadow-inner relative z-40">
            <h3 className="text-sm font-black theme-text-accent uppercase tracking-widest">{t("lab_secondary_mod")}</h3>
            <ModSearchDropdown 
              value={secondaryMod?.name || ""} 
              onChange={(val) => {
                  const found = allMods.find(m => m.name === val);
                  if (found) setSecondaryMod(found);
                  else setSecondaryMod({ name: val });
              }} 
              placeholder={t("lab_select_secondary")} 
              mods={allMods} 
            />
          </div>
        </div>

        <div className="flex-1 theme-glass-panel rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden flex flex-col z-10">
          <div className="absolute top-[-50px] left-[-50px] w-96 h-96 theme-bg-accent opacity-5 blur-[120px] rounded-full pointer-events-none" />
          
          {primaryMod && secondaryMod ? (
            <div className="flex-1 flex flex-col gap-8 relative z-10">
              <div className="flex justify-between items-center border-b border-white/10 pb-6">
                <h2 className="text-2xl font-black text-[var(--text)] uppercase tracking-tighter">{t("lab_simulation_report")}</h2>
              <button 
                onClick={runSimulation} 
                disabled={isLoading}
                className="px-8 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-lg"
              >
                {isLoading ? t("lab_simulating") : t("lab_run_simulation")}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
              {conflicts.length > 0 ? (
                conflicts.map((c, i) => (
                  <div key={i} className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-2xl flex flex-col gap-3 animate-in slide-in-from-right-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">{t("lab_conflict_detected")}</span>
                      <span className="px-3 py-1 theme-panel-danger border rounded text-[9px] font-black uppercase">{t("lab_severity")}{c.severity_rank}</span>
                    </div>
                    <p className="text-sm font-bold text-[var(--text)]">{c.resolution_note || t("lab_no_resolution")}</p>
                  </div>
                ))
              ) : !isLoading ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <span className="text-6xl mb-4 grayscale"></span>
                  <p className="text-sm font-black text-[var(--text)] uppercase tracking-widest">{t("lab_no_known_conflicts")}</p>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30">
            <span className="text-8xl mb-6 grayscale"></span>
            <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.5em]">{t("lab_awaiting_subjects")}</span>
          </div>
        )}
      </div>
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

  const filtered = mods.filter(m => 
    (m.name || '').toLowerCase().includes(query.toLowerCase()) || 
    (m.master_author || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  return (
    <div className={`relative flex-1 ${isOpen ? 'z-[6000]' : ''}`}>
      <input
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
              filtered.map(m => (
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

function CustomStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);

  const options =[
    { id: 'verified', label: t("status_dd_verified"), color: 'theme-text-success', glow: 'theme-bg-success' },
    { id: 'under_review', label: t("status_dd_review"), color: 'theme-text-warning', glow: 'theme-bg-warning' },
    { id: 'broken', label: t("status_dd_broken"), color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 'blacklisted', label: "Blacklisted", color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 'unverified', label: t("status_dd_unverified"), color: 'text-[var(--subtext)] opacity-80', glow: 'bg-white/10' },
  ];

  const selected = options.find(o => o.id === value) || options[4];

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '' : ''}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
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
      )}
    </div>
  );
}

function CustomComplianceDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { id: 0, label: 'CLEAN / SAFE', color: 'theme-text-success', glow: 'theme-bg-success' },
    { id: 1, label: 'NSFW (18+)', color: 'theme-text-warning', glow: 'theme-bg-warning' },
    { id: 2, label: 'EXPLICIT', color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 3, label: 'MALWARE', color: 'text-red-600', glow: 'bg-red-600 animate-pulse' },
  ];
  const selected = options.find(o => o.id === value) || options[0];
  return (
    <div className="relative w-full">
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
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
      )}
    </div>
  );
}
function CustomClassificationDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);

  const options =[
    { id: 'Script', label: t("class_dd_script") },
    { id: 'BuildBuy', label: t("class_dd_buildbuy") },
    { id: 'CAS', label: t("class_dd_cas") },
    { id: 'Animation', label: t("class_dd_animation") },
  ];

  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all text-[var(--text)]"
      >
        <div className="flex items-center gap-3">
          {selected.label}
        </div>
        <span className="text-[var(--subtext)] opacity-60 text-[10px]">{isOpen ? '' : ''}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setIsOpen(false); }}
              className="w-full text-left px-5 py-3 text-xs font-black uppercase tracking-widest transition-all hover:bg-white/5 flex items-center gap-3 text-[var(--text)]"
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods, mode }: { isOpen: boolean, onClose: () => void, onSelect: (targetId: string) => void, cloudMods: any[], mode: string }) {
  const { t } = useLexicon();
  const[query, setQuery] = useState("");

  if (!isOpen) return null;

  const results = cloudMods.filter(m =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  const getTitle = () => {
    switch(mode) {
      case 'dependency': return t("modal_sel_dep");
      case 'addon': return t("modal_sel_addon");
      case 'twin': return t("modal_sel_twin");
      case 'rival': return t("modal_sel_rival");
      case 'beta': return "Select Beta Protocol";
      default: return t("modal_sel_artifact");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest theme-text-accent">
              {getTitle()}
            </h3>
            <button onClick={onClose} className="text-[var(--text)]/50 hover:text-[var(--text)] font-black"></button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder={t("modal_search_catalog")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent"
          />
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? results.map(mod => (
            <button
              key={mod.id}
              onClick={() => { onSelect(mod.id); onClose(); setQuery(""); }}
              className="flex justify-between items-center px-4 py-3 theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent rounded-xl transition-all text-left group"
            >
              <div className="flex flex-col">
                <span className="text-xs font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{mod.master_author || t("registry_unknown_architect")}</span>
              </div>
              <span className="theme-text-accent opacity-0 group-hover:opacity-100 transition-opacity font-black">{t("modal_btn_link")}</span>
            </button>
          )) : (
            <div className="text-center p-8 text-[var(--subtext)] opacity-60 font-bold text-xs uppercase tracking-widest">{t("modal_no_matches")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DLCSearchDropdown({ onSelect, currentDLC =[] }: { onSelect: (pack: string) => void, currentDLC: string[] }) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const DLC_MASTER_LIST =[
    { code: "EP01", name: "Get to Work" }, { code: "EP02", name: "Get Together" }, { code: "EP03", name: "City Living" },
    { code: "EP04", name: "Cats & Dogs" }, { code: "EP05", name: "Seasons" }, { code: "EP06", name: "Get Famous" },
    { code: "EP07", name: "Island Living" }, { code: "EP08", name: "Discover University" }, { code: "EP09", name: "Eco Lifestyle" },
    { code: "EP10", name: "Snowy Escape" }, { code: "EP11", name: "Cottage Living" }, { code: "EP12", name: "High School Years" },
    { code: "EP13", name: "Growing Together" }, { code: "EP14", name: "Horse Ranch" }, { code: "EP15", name: "For Rent" },
    { code: "GP01", name: "Outdoor Retreat" }, { code: "GP02", name: "Spa Day" }, { code: "GP03", name: "Dine Out" },
    { code: "GP04", name: "Vampires" }, { code: "GP05", name: "Parenthood" }, { code: "GP06", name: "Jungle Adventure" },
    { code: "GP07", name: "StrangerVille" }, { code: "GP08", name: "Realm of Magic" }, { code: "GP09", name: "Star Wars" },
    { code: "GP10", name: "Dream Home Decorator" }, { code: "GP11", name: "My Wedding Stories" }, { code: "GP12", name: "Werewolves" },
  ];

  const filtered = DLC_MASTER_LIST.filter(d =>
    (d.code.toLowerCase().includes(query.toLowerCase()) || d.name.toLowerCase().includes(query.toLowerCase())) &&
    !currentDLC.includes(d.code)
  );

  return (
    <div className="relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder={t("registry_search_dlc")}
            className="w-full theme-glass-inner rounded-lg px-3 py-1.5 text-[var(--text)] text-[10px] uppercase font-bold focus:outline-none focus:theme-border-success"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-[var(--text)]/20 hover:text-[var(--text)] text-[10px]"></button>
          )}
        </div>
      </div>
      {isOpen && query.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--sidebar)] backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2">
          {filtered.length > 0 ? filtered.map(d => (
            <button
              key={d.code}
              onClick={() => { onSelect(d.code); setQuery(""); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 hover:theme-panel-success flex flex-col transition-colors group"
            >
              <span className="text-[10px] font-black theme-text-success uppercase">{d.code}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-80 group-hover:text-[var(--text)] uppercase">{d.name}</span>
            </button>
          )) : (
            <div className="p-4 text-center text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("registry_no_dlc")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function CommandCenter({ onNavigate }: any = {}) {
  const { t } = useLexicon();

  const [stats, setStats] = useState({ unverified: 0, reports: 0, scoutQueue: 0, nsfw: 0 });

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
      const { data } = await supabase.from('hub_comms').select('*').order('created_at', { ascending: false }).limit(50);
      if (data) setCommsMessages(data.reverse());
    };
    fetchComms();

    const commsSub = supabase.channel('global-comms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_comms' }, (payload: any) => {
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
      await supabase.from('hub_comms').update({ message: commsInput.trim() }).eq('id', editingCommId);
      setEditingCommId(null);
    } else {
      await supabase.from('hub_comms').insert({
        sender_id: user.id,
        message: commsInput.trim()
      });
    }
    setCommsInput("");
  };

  const deleteComm = async (id: number | string) => {
    await supabase.from('hub_comms').delete().eq('id', id);
  };

  useEffect(() => {
    const fetchStats = async () => {
      const { count: unverifiedCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('status', 'unverified');

      const { count: reportsCount } = await supabase.from('solder_lab_logs').select('*', { count: 'exact', head: true });
      const { count: nsfwCount } = await supabase.from('mods').select('*', { count: 'exact', head: true }).eq('compliance_tier', 1);
      setStats({
        unverified: unverifiedCount || 0,
        reports: reportsCount || 0,
        scoutQueue: 0,
        nsfw: nsfwCount || 0
      });

    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <button onClick={() => onNavigate && onNavigate('registry', 'unverified')} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group">
          <span className="text-4xl font-black text-[var(--text)] group-hover:theme-text-success transition-colors">{stats.unverified}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("status_dd_unverified")}</span>
        </button>
        <button onClick={() => onNavigate && onNavigate('lab')} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group">
          <span className="text-4xl font-black theme-text-warning group-hover:scale-110 origin-left transition-transform">{stats.reports}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("lab_queue")}</span>
        </button>
        <button onClick={() => onNavigate && onNavigate('queue')} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group">
          <span className="text-4xl font-black theme-text-accent group-hover:scale-110 origin-left transition-transform">{stats.scoutQueue}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("hub_tab_queue")}</span>
        </button>
        <button onClick={() => onNavigate && onNavigate('registry', 'nsfw')} className="theme-glass-inner p-8 rounded-3xl flex flex-col gap-2 hover:scale-[1.02] hover:bg-white/5 transition-all text-left group">
          <span className="text-4xl font-black theme-text-warning group-hover:scale-110 origin-left transition-transform">{stats.nsfw}</span>
          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">NSFW FLAGS</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        
        <div className="flex-1 theme-glass-inner rounded-[3rem] p-8 flex flex-col h-[500px]">
          <h3 className="text-xs font-black theme-text-accent uppercase tracking-widest mb-6">{t("hub_comms_title")}</h3>
          <div className="flex-1 border border-white/5 rounded-2xl bg-white/5 flex flex-col mb-4 overflow-y-auto p-4 gap-3 custom-scrollbar">
             {commsMessages.length === 0 ? (
               <div className="flex-1 flex items-center justify-center">
                 <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest text-center px-8 leading-relaxed">
                   {t("hub_comms_offline")}<br/>{t("hub_comms_handshake")}
                 </span>
               </div>
             ) : (
               commsMessages.map((msg, i) => (
                 <div key={msg.id || i} className="flex flex-col gap-2 text-left theme-glass-inner p-4 rounded-xl animate-in fade-in slide-in-from-bottom-2">
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
              className="flex-1 theme-glass-inner rounded-xl px-4 py-3 text-[var(--text)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all placeholder:opacity-30" 
              placeholder="Transmit message to secure channel..." 
            />
            <button 
              onClick={sendComm}
              disabled={!commsInput.trim()}
              className="px-6 py-3 theme-bg-accent text-[var(--bg)] rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/5 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {editingCommId ? "UPDATE" : t("hub_btn_send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeniorArchitectTab() {
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
    <div className="flex flex-col gap-8 animate-in fade-in h-full pb-12">
      <div className="flex flex-col md:flex-row gap-8 h-full items-start">
        <div className="flex-1 w-full overflow-hidden">
          <MasonLinker />
        </div>
        
        <div className="w-full md:w-96 theme-glass-panel theme-border-danger border rounded-[3rem] p-8 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden shadow-[inset_0_0_100px_rgba(255,0,0,0.1)] shrink-0">
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
        </div>
      </div>

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

function MasonLinker() {
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
    <div className="flex flex-col gap-6 animate-in fade-in h-full pb-12">
       <div className="theme-glass-inner rounded-[2.5rem] p-8">
         <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[var(--text)] mb-2">Prole to Mason Linker</h2>
         <p className="text-xs font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-6">Bind an authenticated Citizen to a Creator ID.</p>
         
         <div className="grid grid-cols-2 gap-8 h-[500px]">
            <div className="flex flex-col gap-4 border border-white/10 rounded-3xl theme-glass-inner p-4">
               <input type="text" placeholder="Search Citizens (Proles)..." value={proleSearch} onChange={e => setProleSearch(e.target.value)} className="w-full theme-glass-panel rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all" />
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
               <input type="text" placeholder="Search Creator IDs (Masons)..." value={masonSearch} onChange={e => setMasonSearch(e.target.value)} className="w-full theme-glass-panel rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent transition-all" />
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
               ESTABLISH LINK 
            </button>
         </div>
       </div>
    </div>
  );
}

