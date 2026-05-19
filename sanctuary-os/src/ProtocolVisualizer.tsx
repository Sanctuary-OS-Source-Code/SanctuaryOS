import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, DLC_MAP, formatDisplayName, CustomDropdown, GameVersionMultiSelect } from "./shared";
import ModLineageTree from "./ModLineageTree";

const DLC_MASTER_LIST = Object.entries(DLC_MAP).map(([code, name]) => ({ id: code, name }));

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

export default function ProtocolVisualizer({ masonId, isArchitect }: { masonId?: string, isArchitect?: boolean }) {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [targetMod, setTargetMod] = useState<any | null>(null);
  const [targetVersions, setTargetVersions] = useState<any[]>([]);
  const [allGameVersions, setAllGameVersions] = useState<any[]>([]);
  
  // State for all the linked items for the active target
  const [twinsAndAddons, setTwinsAndAddons] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  
  // Flavor Groups
  const [allFlavorGroups, setAllFlavorGroups] = useState<any[]>([]);
  const [activeFlavorGroup, setActiveFlavorGroup] = useState<any | null>(null);

  // Selection Modal
  const [showLinkModal, setShowLinkModal] = useState<{type: string, title: string} | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  const [allModsForDependencies, setAllModsForDependencies] = useState<any[]>([]);
  const [showFlavorGroupModal, setShowFlavorGroupModal] = useState(false);
  const [newFlavorGroupName, setNewFlavorGroupName] = useState('');

  const fetchData = async () => {
    let modsQuery = supabase.from('mods').select('*');
    
    // Only apply filter if not an architect
    if (!isArchitect && masonId) {
      modsQuery = modsQuery.eq('mason_id', masonId);
    }
    
    // Wrap in lambda for TypeScript compatibility
    const { data } = await fetchAllPaginated(() => modsQuery.order('name'));
    console.log("Supabase Raw Return (isArchitect=" + isArchitect + "):", data);
    if (data && data.length > 0) {
      setCloudMods(data);
    } else {
      console.warn("No mods returned from database");
      setCloudMods([]);
    }
    
    const { data: groups } = await supabase.from('flavor_groups').select('*').order('name');
    if (groups) setAllFlavorGroups(groups);
    
    const { data: gvData } = await supabase.from('game_versions').select('*').order('version', { ascending: false });
    if (gvData) setAllGameVersions(gvData);
  };

  useEffect(() => {
    fetchData();
  }, [isArchitect]);

  const loadLinks = async () => {
    if (!targetMod) {
      setTwinsAndAddons([]);
      setAlternatives([]);
      setDependencies([]);
      setActiveFlavorGroup(null);
      setTargetVersions([]);
      return;
    }

    // 1. Fetch Relationships (Twins, Addons, Flavors, Betas)
    const { data: rels } = await fetchAllPaginated(() => supabase.from('mod_relationships').select('*').or(`parent_id.eq.${targetMod.id},child_id.eq.${targetMod.id}`));
    // 2. Fetch Dependencies
    const { data: deps } = await fetchAllPaginated(() => supabase.from('mod_dependencies').select('*').eq('parent_id', targetMod.id));

    // 3. Fetch Versions & Flavor Group Membership
    const { data: versions } = await supabase.from('mod_versions').select('*').eq('mod_id', targetMod.id).order('version_label');
    if (versions) {
      setTargetVersions(versions);
      if (versions.length > 0) {
        const hashes = versions.map((v:any) => v.dna_hash);
        const { data: fgm } = await supabase.from('flavor_group_members').select('group_id').in('mod_hash', hashes);
        if (fgm && fgm.length > 0) {
          const grp = allFlavorGroups.find(g => g.id === fgm[0].group_id);
          setActiveFlavorGroup(grp || null);
        } else {
          setActiveFlavorGroup(null);
        }
      } else {
        setActiveFlavorGroup(null);
      }
    } else {
      setTargetVersions([]);
      setActiveFlavorGroup(null);
    }

    if (!rels && !deps) return;

    // Filter into groups
    const twinIds = rels?.filter((r: any) => r.relationship_type === 'twin' || r.relationship_type === 'addon').map((r: any) => r.parent_id === targetMod.id ? r.child_id : r.parent_id) || [];
    const altIds = rels?.filter((r: any) => r.relationship_type === 'flavor' || r.relationship_type === 'beta').map((r: any) => r.child_id) || [];
    const depIds = deps?.map((d: any) => d.child_id) || [];

    const resolveMods = (ids: string[]) => cloudMods.filter(m => ids.includes(m.id));

    setTwinsAndAddons(resolveMods(twinIds));
    setAlternatives(resolveMods(altIds));
    setDependencies(resolveMods(depIds));
  };

  useEffect(() => {
    if (cloudMods.length > 0) loadLinks();
  }, [targetMod, cloudMods]);

  const handleAddLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;
    
    if (relType === 'dependency') {
      await supabase.from('mod_dependencies').insert({ parent_id: targetMod.id, child_id: targetId });
    } else {
      await supabase.from('mod_relationships').insert({ parent_id: targetMod.id, child_id: targetId, relationship_type: relType });
    }
    await loadLinks();
    setShowLinkModal(null);
  };

  const handleRemoveLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;
    
    if (relType === 'dependency') {
      await supabase.from('mod_dependencies').delete().match({ parent_id: targetMod.id, child_id: targetId });
    } else {
      await supabase.from('mod_relationships').delete().in('parent_id', [targetMod.id, targetId]).in('child_id', [targetMod.id, targetId]).in('relationship_type', ['twin', 'addon', 'flavor', 'beta']);
    }
    await loadLinks();
  };

  const handleSetVersionData = async (hash: string, field: string, value: string) => {
    await supabase.from('mod_versions').update({ [field]: value }).eq('dna_hash', hash);
    const newVers = [...targetVersions];
    const idx = newVers.findIndex(v => v.dna_hash === hash);
    if (idx !== -1) newVers[idx][field] = value;
    setTargetVersions(newVers);
  };

  const handleJoinFlavorGroup = async (groupId: string) => {
     if (!targetMod) return;
     const { data: versions } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', targetMod.id);
     if (!versions || versions.length === 0) return alert("Artifact has no versions synced to attach to a flavor group.");
     
     for (const v of versions) {
        await supabase.from('flavor_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
     }
     await loadLinks();
  };

  const handleCreateFlavorGroup = async () => {
    if (!newFlavorGroupName.trim()) return;
    
    const { data, error } = await supabase.from('flavor_groups').insert({ name: newFlavorGroupName.trim() }).select().single();
    
    if (error) {
      alert(`Failed to create flavor group: ${error.message}`);
      return;
    }
    
    if (data) {
      setAllFlavorGroups([...allFlavorGroups, data]);
      setShowFlavorGroupModal(false);
      setNewFlavorGroupName('');
      handleJoinFlavorGroup(data.id);
    }
  };

  const parseDLC = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); }
      catch { return val.split(',').map((s:string)=>s.trim()).filter(Boolean); }
    }
    return [];
  };

  const handleToggleDLC = async (dlcId: string, isActive: boolean) => {
    if (!targetMod) return;
    const current = parseDLC(targetMod.requiredDLC);
    const newReqs = isActive ? current.filter(c => c !== dlcId) : [...current, dlcId];
    
    await supabase.from('mods').update({ requiredDLC: newReqs }).eq('id', targetMod.id);
    setTargetMod({ ...targetMod, requiredDLC: newReqs });
  };

  const renderSection = (title: string, desc: string, items: any[], type: string, addTypes: {label: string, value: string}[]) => (
    <div className="theme-glass-inner rounded-3xl p-6 border border-[var(--text)]/10 flex flex-col gap-4">
      <div className="flex justify-between items-start border-b border-[var(--text)]/10 pb-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text)]">{title}</h3>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-wider mt-1">{desc}</p>
        </div>
        <button 
          onClick={async () => {
            // For dependencies, fetch ALL mods (unfiltered)
            if (type === 'dependency') {
              const { data } = await supabase.from('mods').select('id, name, master_author, latest_version, sub_type').order('name');
              if (data) setAllModsForDependencies(data);
            }
            setShowLinkModal({ type, title: `Link ${title}` });
          }}
          className="theme-bg-accent text-[var(--bg)] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all"
        >
          {t("pv_btn_add_link")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest opacity-30">{t("pv_no_links")}</div>
        ) : items.map(item => (
          <div key={item.id} className="flex justify-between items-center bg-[var(--text)]/5 border border-[var(--text)]/10 rounded-xl p-3">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-black/40" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-[var(--text)] uppercase">{item.name}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest">
                  {item.latest_version ? `v${item.latest_version} | ` : ''}{item.sub_type || 'Unknown Type'}
                </span>
              </div>
            </div>
            <button onClick={() => handleRemoveLink(item.id, type)} className="theme-panel-danger theme-text-danger px-4 py-1.5 rounded-lg text-[9px] font-black uppercase">
              {t("pv_btn_remove")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 theme-glass-panel rounded-[2.5rem] shadow-2xl p-8 flex flex-col gap-8 min-h-[80vh] relative">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-[var(--text)]/10 pb-6 shrink-0">
        <div>
          <h2 className="text-2xl font-black uppercase text-[var(--text)] tracking-tighter flex items-center gap-3">
            {t("ui_icon_dna")} {t("pv_title")}
          </h2>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-[0.2em] mt-1">
            {t("pv_subtitle")}
          </p>
        </div>
        
        <div className="w-full md:w-96 theme-glass-inner p-2 rounded-2xl flex flex-col gap-2 z-10 relative">
          <ModSearchDropdown 
            placeholder={t("pv_placeholder_select")}
            selectedItem={targetMod}
            onSelect={(mod: any) => setTargetMod(mod)}
            onClear={() => setTargetMod(null)}
            modList={cloudMods} 
          />
        </div>
      </div>

      {!targetMod ? (
         <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
           <span className="text-6xl mb-4 grayscale">{t("ui_icon_dna")}</span>
           <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">{t("pv_empty_title")}</span>
           <p className="text-[10px] mt-2 font-bold max-w-md">{t("pv_empty_desc")}</p>
         </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-2">
          
          <div className="flex gap-4 p-4 theme-glass-inner rounded-3xl items-start border border-[var(--text)]/10">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[var(--text)]/10">
               {targetMod.image_url ? <img src={targetMod.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-black/40" />}
            </div>
            <div className="flex flex-col flex-1 gap-2">
              <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-tight">{targetMod.name}</h2>
              <span className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2">
                 {targetMod.sub_type || 'Package'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {renderSection(t("pv_section_folder_title"), t("pv_section_folder_desc"), twinsAndAddons, "twin", [{label: t("pv_link_twin"), value: "twin"}, {label: t("pv_link_addon"), value: "addon"}])}
            
            <ModLineageTree targetMod={targetMod} cloudMods={cloudMods} onRefresh={loadLinks} />
            
            {renderSection(t("pv_section_alternatives_title"), t("pv_section_alternatives_desc"), alternatives, "flavor", [{label: t("pv_link_flavor"), value: "flavor"}, {label: t("pv_link_beta"), value: "beta"}])}

            <div className="theme-glass-inner rounded-3xl p-6 border border-[var(--text)]/10 flex flex-col gap-4">
              <div className="border-b border-[var(--text)]/10 pb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text)]">{t("pv_section_flavor_title")}</h3>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-wider mt-1">{t("pv_section_flavor_desc")}</p>
              </div>
              <div className="flex items-center gap-4">
                {activeFlavorGroup ? (
                   <div className="flex items-center gap-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-4 py-2 rounded-xl">
                      <span className="text-xs font-black uppercase text-[var(--accent)]">{activeFlavorGroup.name}</span>
                      <button onClick={() => setActiveFlavorGroup(null)} className="text-[9px] font-black uppercase text-[var(--text)]/50 hover:text-red-500">{t("pv_flavor_unlink")}</button>
                   </div>
                ) : (
                  <>
                    <div className="w-64">
                       <CustomDropdown
                         options={allFlavorGroups.map(g => ({ id: g.id, label: g.name }))}
                         selectedValues={[]}
                         onChange={(vals: string[]) => { if(vals[0]) handleJoinFlavorGroup(vals[0]); }}
                         placeholder={t("pv_flavor_select")}
                         multiSelect={false}
                       />
                    </div>
                    <button onClick={() => setShowFlavorGroupModal(true)} className="text-[10px] font-black uppercase theme-text-accent hover:underline">{t("pv_flavor_create")}</button>
                  </>
                )}
              </div>
            </div>

            {renderSection(t("pv_section_deps_title"), t("pv_section_deps_desc"), dependencies, "dependency", [{label: t("pv_link_required"), value: "dependency"}])}

            <div className="theme-glass-inner rounded-3xl p-6 border border-[var(--text)]/10 flex flex-col gap-4">
              <div className="border-b border-[var(--text)]/10 pb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text)]">{t("pv_section_dlc_title")}</h3>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-wider mt-1">{t("pv_section_dlc_desc")}</p>
              </div>
              <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {DLC_MASTER_LIST.map(dlc => {
                  const isActive = parseDLC(targetMod.requiredDLC).includes(dlc.id);
                  return (
                    <button 
                      key={dlc.id} 
                      onClick={() => handleToggleDLC(dlc.id, isActive)}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isActive ? 'theme-bg-accent text-[var(--bg)] border-[var(--accent)]' : 'bg-[var(--text)]/5 text-[var(--text)] border-[var(--text)]/10 hover:border-[var(--text)]/30'}`}
                    >
                      {dlc.id}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Flavor Group Creation Modal */}
      {showFlavorGroupModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-[400px] bg-[#1a1c23] rounded-3xl shadow-2xl border border-[var(--text)]/20 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-[var(--text)]/10 flex justify-between items-center bg-black/40">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">{t("pv_modal_create_group_title")}</h3>
              <button onClick={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }} className="text-xs font-black text-white opacity-50 hover:opacity-100">✕</button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("pv_modal_group_name_label")}</label>
                <input
                  autoFocus
                  type="text"
                  value={newFlavorGroupName}
                  onChange={(e) => setNewFlavorGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFlavorGroup()}
                  placeholder={t("pv_modal_group_name_placeholder")}
                  className="w-full bg-black/40 border border-[var(--text)]/20 px-4 py-3 rounded-xl text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                >
                  {t("pv_modal_btn_cancel")}
                </button>
                <button
                  onClick={handleCreateFlavorGroup}
                  disabled={!newFlavorGroupName.trim()}
                  className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("pv_modal_btn_create")}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Unified Link Modal */}
      {showLinkModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-[500px] bg-[#1a1c23] rounded-3xl shadow-2xl border border-[var(--text)]/20 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-[var(--text)]/10 flex justify-between items-center bg-black/40">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">{showLinkModal.title}</h3>
              <button onClick={() => setShowLinkModal(null)} className="text-xs font-black text-white opacity-50 hover:opacity-100">✕</button>
            </div>
            <div className="p-4 border-b border-[var(--text)]/10 bg-black/60">
              <input 
                value={modalSearch} 
                onChange={e => setModalSearch(e.target.value)} 
                placeholder={t("pv_modal_search_placeholder")}
                className="w-full bg-black/40 border border-[var(--text)]/20 px-4 py-3 rounded-xl text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2 bg-[#1a1c23]">
              {(showLinkModal.type === 'dependency' ? allModsForDependencies : cloudMods).filter(m => 
                m.id !== targetMod?.id && 
                (showLinkModal.type === 'dependency' || !masonId || m.mason_id === masonId) &&
                (!modalSearch || m.name.toLowerCase().includes(modalSearch.toLowerCase()))
              ).slice(0, 50).map(mod => (
                <div key={mod.id} className="flex justify-between items-center bg-white/5 border border-white/10 hover:border-[var(--accent)]/50 p-3 rounded-xl transition-colors">
                  <div className="flex flex-col flex-1 min-w-0 overflow-hidden pr-4">
                    <span className="text-[11px] font-black uppercase text-white truncate">{mod.name}</span>
                    <span className="text-[9px] font-bold text-white/60">{mod.latest_version ? `v${mod.latest_version}` : t("pv_modal_no_version")}</span>
                  </div>
                  {showLinkModal.type === 'twin' ? (
                     <div className="flex gap-2 shrink-0">
                       <button onClick={() => handleAddLink(mod.id, 'twin')} className="px-3 py-1.5 theme-bg-accent text-[var(--bg)] rounded-lg text-[9px] font-black uppercase">{t("pv_modal_btn_twin")}</button>
                       <button onClick={() => handleAddLink(mod.id, 'addon')} className="px-3 py-1.5 bg-black/40 text-white border border-white/20 rounded-lg text-[9px] font-black uppercase hover:border-[var(--accent)]">{t("pv_modal_btn_addon")}</button>
                     </div>
                  ) : showLinkModal.type === 'flavor' ? (
                     <div className="flex gap-2 shrink-0">
                       <button onClick={() => handleAddLink(mod.id, 'flavor')} className="px-3 py-1.5 theme-bg-accent text-[var(--bg)] rounded-lg text-[9px] font-black uppercase">{t("pv_modal_btn_flavor")}</button>
                       <button onClick={() => handleAddLink(mod.id, 'beta')} className="px-3 py-1.5 bg-black/40 text-white border border-white/20 rounded-lg text-[9px] font-black uppercase hover:border-[var(--accent)]">{t("pv_modal_btn_beta")}</button>
                     </div>
                  ) : (
                    <button onClick={() => handleAddLink(mod.id, showLinkModal.type)} className="px-3 py-1.5 theme-bg-accent text-[var(--bg)] rounded-lg text-[9px] font-black uppercase shrink-0">{t("pv_modal_btn_link")}</button>
                  )}
                </div>
              ))}
              {cloudMods.filter(m => m.id !== targetMod?.id && (!modalSearch || m.name.toLowerCase().includes(modalSearch.toLowerCase()))).length === 0 && (
                <div className="text-center p-8 text-[10px] font-bold text-white/50 uppercase">{t("pv_modal_no_artifacts")}</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
