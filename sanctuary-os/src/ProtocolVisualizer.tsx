import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, CustomDropdown, DLC_MAP } from "./shared";

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
  const [activeTab, setActiveTab] = useState("dependencies");
  const [targetMod, setTargetMod] = useState<any | null>(null);
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  
  // Protocol State
  const [linkedMods, setLinkedMods] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Flavor Groups State
  const [flavorGroups, setFlavorGroups] = useState<any[]>([]);
  const [targetGroup, setTargetGroup] = useState<any | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  
  // Drag state
  const [dragItemIndex, setDragItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchMods = async () => {
      const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, image_url, status, mason_id').order('name'));
      if (data) setCloudMods(data);
    };
    fetchMods();
  }, [masonId, isArchitect]);

  const fetchLinkedMods = async () => {
    if (activeTab === 'flavor_groups') {
      if (!targetGroup) return setLinkedMods([]);
      const { data: links } = await supabase.from('flavor_group_members').select('mod_id, sort_order').eq('group_id', targetGroup.id);
      if (!links || links.length === 0) return setLinkedMods([]);
      
      const { data: mods } = await supabase.from('mods').select('id, name, image_url, master_author').in('id', links.map((l: any) => l.mod_id));
      if (mods) {
        const sorted = mods.map((m: any) => {
          const link = links.find((l: any) => l.mod_id === m.id);
          return { ...m, sort_order: link?.sort_order || 0 };
        }).sort((a: any, b: any) => a.sort_order - b.sort_order);
        setLinkedMods(sorted);
      }
      return;
    }

    if (!targetMod) return setLinkedMods([]);
    let modIds: string[] = [];

    // Fetch Twins to build a "family" of IDs that share protocols
    const { data: twinData } = await supabase.from('mod_relationships').select('parent_id, child_id').eq('relationship_type', 'twin').or(`parent_id.eq.${targetMod.id},child_id.eq.${targetMod.id}`);
    const twinIds = twinData ? twinData.map((d: any) => d.parent_id === targetMod.id ? d.child_id : d.parent_id) : [];
    const familyIds = [targetMod.id, ...twinIds];

    if (activeTab === 'twins') {
      modIds = twinIds;
    } else if (activeTab === 'dependencies') {
      const { data } = await supabase.from('mod_dependencies').select('child_id').in('parent_id', familyIds);
      if (data) modIds = data.map((d: any) => d.child_id);
    } else if (activeTab === 'core_addons') {
      // Core addons are bidirectional: either the family is the parent, or targetMod is the child
      const { data: parentData } = await supabase.from('mod_relationships').select('child_id').eq('relationship_type', 'addon').in('parent_id', familyIds);
      const { data: childData } = await supabase.from('mod_relationships').select('parent_id').eq('relationship_type', 'addon').eq('child_id', targetMod.id);
      if (parentData) modIds.push(...parentData.map((d: any) => d.child_id));
      if (childData) modIds.push(...childData.map((d: any) => d.parent_id));
      modIds = Array.from(new Set(modIds)); // deduplicate
    } else if (activeTab === 'flavors' || activeTab === 'betas') {
      const typeMap: any = { flavors: 'flavor', betas: 'beta' };
      const { data } = await supabase.from('mod_relationships').select('child_id').eq('relationship_type', typeMap[activeTab]).in('parent_id', familyIds);
      if (data) modIds = data.map((d: any) => d.child_id);
    }

    if (modIds.length === 0) {
      setLinkedMods([]);
    } else {
      const { data: mods } = await supabase.from('mods').select('id, name, image_url, master_author').in('id', modIds);
      if (mods) setLinkedMods(mods);
    }
  };

  const fetchGroups = async () => {
    const { data } = await supabase.from('flavor_groups').select('*').order('name');
    if (data) setFlavorGroups(data);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchLinkedMods();
  }, [targetMod, targetGroup, activeTab]);

  const handleAddLink = async (modId: string) => {
    if (activeTab === 'flavor_groups') {
      if (!targetGroup) return;
      await supabase.from('flavor_group_members').insert({ group_id: targetGroup.id, mod_id: modId, sort_order: linkedMods.length });
    } else {
      if (!targetMod) return;
      if (activeTab === 'dependencies') {
        await supabase.from('mod_dependencies').upsert({ parent_id: targetMod.id, child_id: modId }, { onConflict: 'parent_id, child_id' });
      } else if (['core_addons', 'flavors', 'twins', 'betas'].includes(activeTab)) {
        const typeMap: any = { core_addons: 'addon', flavors: 'flavor', twins: 'twin', betas: 'beta' };
        await supabase.from('mod_relationships').upsert({ parent_id: targetMod.id, child_id: modId, relationship_type: typeMap[activeTab] }, { onConflict: 'parent_id, child_id' });
      }
    }
    fetchLinkedMods();
  };

  const handleRemoveLink = async (modId: string) => {
    if (activeTab === 'flavor_groups') {
      if (!targetGroup) return;
      await supabase.from('flavor_group_members').delete().match({ group_id: targetGroup.id, mod_id: modId });
    } else {
      if (!targetMod) return;
      
      const { data: twinData } = await supabase.from('mod_relationships').select('parent_id, child_id').eq('relationship_type', 'twin').or(`parent_id.eq.${targetMod.id},child_id.eq.${targetMod.id}`);
      const twinIds = twinData ? twinData.map((d: any) => d.parent_id === targetMod.id ? d.child_id : d.parent_id) : [];
      const familyIds = [targetMod.id, ...twinIds];

      if (activeTab === 'dependencies') {
        await supabase.from('mod_dependencies').delete().in('parent_id', familyIds).eq('child_id', modId);
      } else if (['core_addons', 'flavors', 'twins', 'betas'].includes(activeTab)) {
        const typeMap: any = { core_addons: 'addon', flavors: 'flavor', twins: 'twin', betas: 'beta' };
        if (activeTab === 'twins') {
          await supabase.from('mod_relationships').delete().match({ parent_id: targetMod.id, child_id: modId, relationship_type: typeMap[activeTab] });
          await supabase.from('mod_relationships').delete().match({ parent_id: modId, child_id: targetMod.id, relationship_type: typeMap[activeTab] });
        } else if (activeTab === 'core_addons') {
          await supabase.from('mod_relationships').delete().eq('relationship_type', typeMap[activeTab]).in('parent_id', familyIds).eq('child_id', modId);
          await supabase.from('mod_relationships').delete().eq('relationship_type', typeMap[activeTab]).eq('parent_id', modId).in('child_id', familyIds);
        } else {
          await supabase.from('mod_relationships').delete().eq('relationship_type', typeMap[activeTab]).in('parent_id', familyIds).eq('child_id', modId);
        }
      }
    }
    fetchLinkedMods();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const { data } = await supabase.from('flavor_groups').insert([{ name: newGroupName.trim(), mason_id: masonId }]).select().single();
    if (data) {
      setFlavorGroups(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
      setTargetGroup(data);
      setNewGroupName("");
    }
  };

  const availableMods = cloudMods.filter(m => {
    if (linkedMods.find(l => l?.id === m.id)) return false;
    if (m.id === targetMod?.id) return false;
    if (!isArchitect && masonId && m.mason_id !== masonId) return false;
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const availableDLCs = DLC_MASTER_LIST.filter(d => {
    const reqs = targetMod?.requiredDLC || "";
    if (reqs.includes(d.id)) return false;
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase()) && !d.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const linkedDLCs = DLC_MASTER_LIST.filter(d => {
    const reqs = targetMod?.requiredDLC || "";
    return reqs.includes(d.id);
  });

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    setDragItemIndex(index);
  };
  const handleDragEnter = (index: number) => setDragOverItemIndex(index);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (dragItemIndex !== null && dragOverItemIndex !== null && dragItemIndex !== dragOverItemIndex) {
      const newLinked = [...linkedMods];
      const item = newLinked.splice(dragItemIndex, 1)[0];
      newLinked.splice(dragOverItemIndex, 0, item);
      setLinkedMods(newLinked);
      
      if (activeTab === 'flavor_groups' && targetGroup) {
        for (let i = 0; i < newLinked.length; i++) {
          await supabase.from('flavor_group_members').update({ sort_order: i }).match({ group_id: targetGroup.id, mod_id: newLinked[i].id });
        }
      }
    }
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  };

  const handleAddDLC = async (code: string) => {
    if (!targetMod) return;
    const currentDLCs = targetMod.requiredDLC ? targetMod.requiredDLC.split(',').map((s:string) => s.trim()).filter(Boolean) : [];
    if (!currentDLCs.includes(code)) {
      const newDLCs = [...currentDLCs, code].join(', ');
      await supabase.from('mods').update({ requiredDLC: newDLCs }).eq('id', targetMod.id);
      setTargetMod({ ...targetMod, requiredDLC: newDLCs });
    }
  };

  const handleRemoveDLC = async (code: string) => {
    if (!targetMod) return;
    const currentDLCs = targetMod.requiredDLC ? targetMod.requiredDLC.split(',').map((s:string) => s.trim()).filter(Boolean) : [];
    const newDLCs = currentDLCs.filter((c: string) => c !== code).join(', ');
    await supabase.from('mods').update({ requiredDLC: newDLCs }).eq('id', targetMod.id);
    setTargetMod({ ...targetMod, requiredDLC: newDLCs });
  };

  return (
    <div className="flex-1 theme-glass-panel rounded-[2.5rem] shadow-2xl p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 min-h-[70vh]">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6 shrink-0 relative z-50">
          <div>
            <h2 className="text-2xl font-black uppercase text-[var(--text)] tracking-tighter flex items-center gap-3">
              <span className="text-3xl grayscale">🧬</span> Protocol Orchestrator
            </h2>
            <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em] mt-1">
              Visual Schema & Lineage Builder
            </p>
          </div>
          
          <div className="w-full md:w-96 theme-glass-inner p-2 rounded-2xl flex flex-col gap-2">
            {activeTab === 'flavor_groups' ? (
              <>
                <div className="flex gap-2 w-full">
                  <div className="flex-1">
                    <CustomDropdown 
                      value={targetGroup?.id || ""} 
                      options={[{ id: "", label: "SELECT FLAVOR GROUP..." }, ...flavorGroups.map(g => ({ id: g.id, label: g.name }))]}
                      onChange={(id: string) => {
                        const found = flavorGroups.find(g => g.id === id);
                        setTargetGroup(found || null);
                      }}
                    />
                  </div>
                  {targetGroup && (
                    <button onClick={() => setTargetGroup(null)} className="theme-glass-inner px-4 rounded-2xl hover:theme-panel-danger hover:text-[var(--danger)] transition-all font-black text-xs border border-white/10">✕</button>
                  )}
                </div>
                <form onSubmit={handleCreateGroup} className="flex gap-2 mt-1">
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New Group Name" className="flex-1 theme-glass-inner rounded-xl px-3 py-2 text-[var(--text)] text-[10px] font-bold focus:outline-none focus:theme-border-accent border border-white/10" />
                  <button type="submit" className="px-4 theme-bg-accent text-[var(--bg)] font-black text-[10px] rounded-xl shadow-md hover:opacity-90 transition-opacity whitespace-nowrap">+ CREATE</button>
                </form>
              </>
            ) : (
              <ModSearchDropdown 
                placeholder="Select Artifact to Manage..."
                selectedItem={targetMod}
                onSelect={(mod: any) => setTargetMod(mod)}
                onClear={() => setTargetMod(null)}
                modList={cloudMods} 
              />
            )}
          </div>
       </div>

       {(targetMod || activeTab === 'flavor_groups') ? (
         <>
           <div className="flex flex-wrap gap-2 shrink-0">
             {['dependencies', 'core_addons', 'flavors', 'flavor_groups', 'twins', 'betas', 'lineage', 'dlc'].map(tab => (
               <button 
                 key={tab} 
                 onClick={() => setActiveTab(tab)} 
                 className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab ? 'theme-bg-accent text-[var(--bg)] shadow-lg shadow-[var(--accent)]/20' : 'bg-white/5 text-[var(--text)] opacity-60 hover:opacity-100 hover:bg-white/10'}`}
               >
                 {tab.replace('_', ' ')}
               </button>
             ))}
           </div>

           <div className="flex-1 flex gap-6 min-h-0">
             
             {/* Linked Pane */}
             <div className="w-1/2 theme-glass-inner rounded-3xl p-6 border border-white/5 flex flex-col gap-4 overflow-y-auto custom-scrollbar relative group">
               <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/10 pb-4">
                 {activeTab === 'flavor_groups' ? (targetGroup?.name || 'Flavor Group') : `Linked ${activeTab.replace('_', ' ')}`} <span className="opacity-50">({activeTab === 'dlc' ? linkedDLCs.length : linkedMods.length})</span>
               </h3>
               
               <div className="flex flex-col gap-2 relative z-10 min-h-[50px]" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                 {activeTab === 'dlc' ? (
                   linkedDLCs.length === 0 ? (
                     <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest opacity-30">No linked artifacts</div>
                   ) : linkedDLCs.map(dlc => (
                     <div key={dlc.id} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3 hover:border-white/30 transition-all">
                       <div className="flex items-center gap-3">
                         <span className="text-[10px] font-black text-[var(--text)] uppercase px-2 py-1 bg-white/10 rounded-md">{dlc.id}</span>
                         <span className="text-[10px] font-bold text-[var(--subtext)] uppercase">{dlc.name}</span>
                       </div>
                       <button onClick={() => handleRemoveDLC(dlc.id)} className="px-3 py-1.5 theme-panel-danger theme-text-danger rounded-lg text-[9px] font-black hover:opacity-80 transition-all shadow-md shrink-0">
                         UNLINK
                       </button>
                     </div>
                   ))
                 ) : (
                   linkedMods.length === 0 ? (
                     <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest opacity-30">No linked artifacts</div>
                   ) : linkedMods.map((mod, index) => (
                     <div 
                       key={mod.id} 
                       draggable 
                       onDragStart={(e) => handleDragStart(e, index)}
                       onDragEnter={() => handleDragEnter(index)}
                       onDragOver={(e) => e.preventDefault()}
                       className={`flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3 transition-all cursor-move ${dragOverItemIndex === index ? 'border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.02]' : 'hover:border-white/30'} ${dragItemIndex === index ? 'opacity-50' : 'opacity-100'}`}
                     >
                       <div className="flex items-center gap-3 overflow-hidden">
                         <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden shrink-0 pointer-events-none">
                           {mod.image_url ? <img src={mod.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--text)]/10" />}
                         </div>
                         <div className="flex flex-col min-w-0 pointer-events-none">
                           <span className="text-[10px] font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                           <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase">{mod.master_author}</span>
                         </div>
                       </div>
                       <button onClick={() => handleRemoveLink(mod.id)} className="px-3 py-1.5 theme-panel-danger theme-text-danger rounded-lg text-[9px] font-black hover:opacity-80 transition-all shadow-md shrink-0">
                         UNLINK
                       </button>
                     </div>
                   ))
                 )}
               </div>
               {activeTab === 'flavors' || activeTab === 'flavor_groups' ? (
                 <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity">
                   <span className="text-6xl uppercase font-black tracking-[1em] rotate-90">DRAG</span>
                 </div>
               ) : null}
             </div>

             {/* Available Pane */}
             <div className="w-1/2 theme-glass-inner rounded-3xl p-6 border border-white/5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
               <div className="flex justify-between items-center border-b border-white/10 pb-4">
                 <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
                   Available {isArchitect ? "Artifacts" : "Workshop"}
                 </h3>
                 <input 
                   value={searchQuery} 
                   onChange={e => setSearchQuery(e.target.value)} 
                   placeholder="Search..." 
                   className="theme-glass-inner px-3 py-1.5 rounded-lg text-[10px] font-bold text-[var(--text)] outline-none focus:theme-border-accent"
                 />
               </div>
               
               <div className="flex flex-col gap-2">
                 {activeTab === 'dlc' ? (
                   availableDLCs.length === 0 ? (
                     <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest opacity-30">No artifacts found</div>
                   ) : availableDLCs.map(dlc => (
                     <div key={dlc.id} className="flex justify-between items-center bg-black/20 border border-white/5 rounded-xl p-3 hover:border-white/20 transition-all group">
                       <div className="flex items-center gap-3">
                         <span className="text-[10px] font-black text-[var(--text)] uppercase px-2 py-1 bg-[var(--accent)]/20 text-[var(--accent)] rounded-md">{dlc.id}</span>
                         <span className="text-[10px] font-bold text-[var(--subtext)] uppercase">{dlc.name}</span>
                       </div>
                       <button onClick={() => handleAddDLC(dlc.id)} className="px-3 py-1.5 bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] rounded-lg text-[9px] font-black transition-all shadow-md shrink-0">
                         + LINK
                       </button>
                     </div>
                   ))
                 ) : (
                   availableMods.length === 0 ? (
                     <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest opacity-30">No available artifacts</div>
                   ) : availableMods.slice(0, 100).map(mod => (
                     <div key={mod.id} className="flex justify-between items-center bg-black/20 border border-white/5 rounded-xl p-3 hover:border-white/20 transition-all group">
                       <div className="flex items-center gap-3 overflow-hidden">
                         <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden shrink-0">
                           {mod.image_url ? <img src={mod.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[var(--text)]/10" />}
                         </div>
                         <div className="flex flex-col min-w-0">
                           <span className="text-[10px] font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                           <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase">{mod.master_author}</span>
                         </div>
                       </div>
                       <button onClick={() => handleAddLink(mod.id)} className="px-3 py-1.5 bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] rounded-lg text-[9px] font-black transition-all shadow-md shrink-0">
                         + LINK
                       </button>
                     </div>
                   ))
                 )}
               </div>
             </div>

           </div>
         </>
       ) : (
         <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
           <span className="text-6xl mb-4 grayscale">🧬</span>
           <span className="text-sm font-black text-[var(--text)] uppercase tracking-[0.3em]">SELECT AN ARTIFACT</span>
           <p className="text-[10px] mt-2 font-bold max-w-md">Select an artifact {activeTab === 'flavor_groups' ? 'or group ' : ''}from the dropdown above to begin visually constructing its network protocols.</p>
         </div>
       )}
    </div>
  );
}
