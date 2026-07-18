import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { logArchitectAction } from "./lib/audit";
import { useLexicon } from "./LexiconContext";
import { HubTabDropdown, HubTabButton, SidePanel, CustomDropdown, HoverTooltip, FilterTabs, FilterTabButton, ModSearchDropdown, DLC_MAP, formatDisplayName, GameVersionMultiSelect, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardButtonClass, EmptyState } from "./shared";
import ModLineageTree from "./ModLineageTree";
import { useStore } from './store';


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
  
  const [twinsAndAddons, setTwinsAndAddons] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  
  const [allFlavorGroups, setAllFlavorGroups] = useState<any[]>([]);
  const [activeFlavorGroup, setActiveFlavorGroup] = useState<any | null>(null);

  const [showLinkModal, setShowLinkModal] = useState<{type: string, title: string} | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  const [allModsForDependencies, setAllModsForDependencies] = useState<any[]>([]);
  const [showFlavorGroupModal, setShowFlavorGroupModal] = useState(false);
  const [newFlavorGroupName, setNewFlavorGroupName] = useState('');
  const [dlcRegistry, setDlcRegistry] = useState<any[]>([]);
  const [dlcSearch, setDlcSearch] = useState("");
  const [dlcTab, setDlcTab] = useState('Expansion Pack');

  const fetchData = async () => {
    let modsQuery = supabase.from('mods').select('*');
    
    if (!isArchitect && masonId) {
      modsQuery = modsQuery.eq('mason_id', masonId);
    }
    
    const { data } = await fetchAllPaginated(() => modsQuery.order('name'));
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
    
    const { data: dlcData } = await supabase.from('dlc_registry').select('*');
    if (dlcData) setDlcRegistry(dlcData);
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

    const { data: rels } = await fetchAllPaginated(() => supabase.from('mod_relationships').select('*').or(`parent_id.eq.${targetMod.id},child_id.eq.${targetMod.id}`));
    const { data: deps } = await fetchAllPaginated(() => supabase.from('mod_dependencies').select('*').eq('child_id', targetMod.id));

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

    const twinIds = rels?.filter((r: any) => r.relationship_type === 'twin' || r.relationship_type === 'addon').map((r: any) => r.parent_id === targetMod.id ? r.child_id : r.parent_id) || [];
    const altIds = rels?.filter((r: any) => r.relationship_type === 'flavor' || r.relationship_type === 'beta').map((r: any) => r.child_id) || [];
    const depIds = deps?.map((d: any) => d.parent_id) || [];

    const resolveMods = async (ids: string[]) => {
      const resolved = cloudMods.filter(m => ids.includes(m.id));
      const missingIds = ids.filter(id => !resolved.find(m => m.id === id));
      if (missingIds.length > 0) {
        const { data: missingMods } = await supabase.from('mods').select('*').in('id', missingIds);
        if (missingMods) return [...resolved, ...missingMods];
      }
      return resolved;
    };

    setTwinsAndAddons(await resolveMods(twinIds));
    setAlternatives(await resolveMods(altIds));
    setDependencies(await resolveMods(depIds));
  };

  useEffect(() => {
    if (cloudMods.length > 0) loadLinks();
  }, [targetMod, cloudMods]);

  const handleAddLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;
    
    if (relType === 'dependency') {
      await supabase.from('mod_dependencies').insert({ parent_id: targetId, child_id: targetMod.id });
    } else {
      await supabase.from('mod_relationships').insert({ parent_id: targetMod.id, child_id: targetId, relationship_type: relType });
    }
    await loadLinks();
    setShowLinkModal(null);
  };

  const handleRemoveLink = async (targetId: string, relType: string) => {
    if (!targetMod) return;
    
    if (relType === 'dependency') {
      await supabase.from('mod_dependencies').delete().match({ parent_id: targetId, child_id: targetMod.id });
    } else {
      await supabase.from('mod_relationships').delete().in('parent_id', [targetMod.id, targetId]).in('child_id', [targetMod.id, targetId]).in('relationship_type', ['twin', 'addon', 'flavor', 'beta']);
    }
    await loadLinks();
  };

  const handleSetVersionData = async (hash: string, field: string, value: string) => {
    await supabase.from('mod_versions').update({ [field]: value }).eq('dna_hash', hash);
    if (isArchitect) logArchitectAction(`Updated Protocol version ${hash} field ${field}`, `mod_versions`, hash);
    const newVers = [...targetVersions];
    const idx = newVers.findIndex(v => v.dna_hash === hash);
    if (idx !== -1) newVers[idx][field] = value;
    setTargetVersions(newVers);
  };

  const handleJoinFlavorGroup = async (groupId: string) => {
     if (!targetMod) return;
     const { data: versions } = await supabase.from('mod_versions').select("dna_hash").eq('mod_id', targetMod.id);
     if (!versions || versions.length === 0) return useStore.getState().pushStatus(t("auto_artifact_has_no_45"));
     
     for (const v of versions) {
        await supabase.from('flavor_group_members').insert({ group_id: groupId, mod_hash: v.dna_hash });
     }
     await loadLinks();
  };

  const handleCreateFlavorGroup = async () => {
    if (!newFlavorGroupName.trim()) return;
    
    const { data, error } = await supabase.from('flavor_groups').insert({ name: newFlavorGroupName.trim() }).select().single();
    
    if (error) {
      useStore.getState().pushStatus(`Failed to create flavor group: ${error.message}`);
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
    if (isArchitect) logArchitectAction(`Updated DLC Protocols`, `mods`, targetMod.name);
    setTargetMod({ ...targetMod, requiredDLC: newReqs });
  };

  const renderSection = (icon: string, title: string, desc: string, items: any[], type: string, addTypes: {label: string, value: string}[]) => (
    <div className="theme-glass-panel rounded-[var(--radius)] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/5 backdrop-blur-3xl flex flex-col gap-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-[0.03] blur-[80px] pointer-events-none rounded-full group-hover:opacity-[0.05] transition-opacity duration-1000" />
      
      <div className="flex justify-between items-start border-b border-white/10 pb-6 relative z-10">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
             <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{icon}</span>
             {title}
          </h3>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">{desc}</p>
        </div>
        <button 
          onClick={async () => {
            if (type === 'dependency') {
              const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, sub_type').order('name'));
              if (data) setAllModsForDependencies(data);
            }
            setShowLinkModal({ type, title: `${title}` });
          }}
          className="px-6 py-3 rounded-2xl theme-glass-inner text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-border-accent hover:scale-[1.02] active:scale-95 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
        >
          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_add")}</span>
          {t("btn_add_link")}
        </button>
      </div>

      <div className="flex flex-col gap-3 relative z-10">
        {items.length === 0 ? (
          <div className="py-8 text-center text-[10px] font-black uppercase tracking-[0.3em] opacity-30 border border-dashed border-white/10 rounded-2xl">{t("no_links")}</div>
        ) : items.map(item => (
          <div key={item.id} className="group/item flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-white/5 rounded-2xl p-4 transition-all hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/30 hover:shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none" />
            
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md">
                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full theme-bg-accent/10 flex items-center justify-center"><span className="material-symbols-outlined !text-xl opacity-30">{t("icon_deployed_code")}</span></div>}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-black text-[var(--text)] uppercase tracking-wide group-hover/item:theme-text-accent transition-colors">{item.name}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-70 uppercase tracking-[0.2em]">
                  {item.latest_version ? `v${item.latest_version} • ` : ''}{item.sub_type || 'Package'}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => handleRemoveLink(item.id, type)} 
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--danger)]/50 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/item:opacity-100"
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_link_off")}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full relative animate-in fade-in h-full">
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full z-10 relative">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_link")}</span>
          </div>
          <span className="truncate">{t("pv_title")}</span>
        </h2>
        
        <div className="relative flex-1 max-w-md ml-auto flex gap-4 items-center justify-end z-10">
          <ModSearchDropdown 
            placeholder={t("placeholder_select")}
            selectedItem={targetMod}
            onSelect={(mod: any) => setTargetMod(mod)}
            onClear={() => setTargetMod(null)}
            modList={cloudMods} 
          />
        </div>
      </div>

      <div className="flex-1 p-6">
      {!targetMod ? (
         <EmptyState icon={t("icon_all_inclusive") || "dns"} title={t("no_artifact")} className="col-span-full py-16" />
      ) : (
        <div className="flex flex-col gap-6">
          
          <div className="flex gap-6 p-8 theme-glass-panel rounded-[var(--radius)] items-center border border-white/10 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 to-transparent opacity-30 pointer-events-none" />
            <div className="absolute -left-32 -top-32 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[100px] pointer-events-none rounded-full group-hover:scale-110 transition-transform duration-1000" />
            
            <div className="w-24 h-24 rounded-[var(--radius)] overflow-hidden shrink-0 border border-white/20 shadow-xl relative z-10 flex items-center justify-center bg-[var(--text)]/5 backdrop-blur-md">
               {targetMod.image_url ? <img src={targetMod.image_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined !text-5xl opacity-40 text-[var(--accent)]">{t("icon_inventory_2")}</span>}
            </div>
            <div className="flex flex-col flex-1 gap-3 relative z-10">
              <span className="text-[10px] font-black theme-text-accent uppercase tracking-[0.3em] bg-[var(--accent)]/10 px-3 py-1 rounded-full w-max shadow-sm border border-[var(--accent)]/20">{t("protocol_target")}</span>
              <h2 className="text-3xl font-black text-[var(--text)] uppercase tracking-tight drop-shadow-lg">{targetMod.name}</h2>
              <span className="text-[11px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest flex items-center gap-3">
                 <span className="material-symbols-outlined !text-[14px]">{t("icon_category")}</span>
                 {targetMod.sub_type || 'Package'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {renderSection("device_hub", t("section_folder_title"), t("section_folder_desc"), twinsAndAddons, "twin", [{label: t("link_twin"), value: "twin"}, {label: t("link_addon"), value: "addon"}])}
            
            <ModLineageTree targetMod={targetMod} cloudMods={cloudMods} onRefresh={loadLinks} />
            
            {renderSection("alt_route", t("section_alternatives_title"), t("section_alternatives_desc"), alternatives, "flavor", [{label: t("link_flavor"), value: "flavor"}, {label: t("link_beta"), value: "beta"}])}

            <div className="theme-glass-panel rounded-[var(--radius)] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/5 backdrop-blur-3xl flex flex-col gap-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-[0.03] blur-[80px] pointer-events-none rounded-full group-hover:opacity-[0.05] transition-opacity duration-1000" />
              
              <div className="flex justify-between items-start border-b border-white/10 pb-6 relative z-10">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_hub")}</span>
                    {t("section_flavor_title")}
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">{t("section_flavor_desc")}</p>
                </div>
                {!activeFlavorGroup && (
                  <button 
                    onClick={() => setShowFlavorGroupModal(true)}
                    className="px-6 py-3 rounded-2xl theme-glass-inner text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-border-accent hover:scale-[1.02] active:scale-95 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("icon_add")}</span>
                    {t("flavor_create")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4 relative z-10">
                {activeFlavorGroup ? (
                   <div className="flex items-center gap-4 bg-gradient-to-r from-[var(--accent)]/20 to-[var(--accent)]/5 border border-[var(--accent)]/30 px-6 py-4 rounded-2xl shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
                      <div className="w-8 h-8 rounded-full theme-bg-accent/20 flex items-center justify-center border border-[var(--accent)]/50">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">{t("icon_hub")}</span>
                      </div>
                      <span className="text-sm font-black uppercase text-[var(--text)] tracking-wider">{activeFlavorGroup.name}</span>
                      <button onClick={() => setActiveFlavorGroup(null)} className="ml-4 w-8 h-8 flex items-center justify-center rounded-full text-[var(--text)]/50 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                         <span className="material-symbols-outlined !text-[16px]">{t("icon_link_off")}</span>
                      </button>
                   </div>
                ) : (
                  <div className="flex-1 max-w-sm">
                    <CustomDropdown disableTint={true} 
                      value="" 
                      options={allFlavorGroups.map(g => ({ label: g.name, value: g.id }))}
                      onChange={(val: string) => { if(val) handleJoinFlavorGroup(val); }}
                      placeholder={t("flavor_select")}
                    />
                  </div>
                )}
              </div>
            </div>

            {renderSection("extension", t("section_deps_title"), t("section_deps_desc"), dependencies, "dependency", [{label: t("link_required"), value: "dependency"}])}

            <div className="theme-glass-panel rounded-[var(--radius)] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/5 backdrop-blur-3xl flex flex-col gap-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-[0.03] blur-[80px] pointer-events-none rounded-full group-hover:opacity-[0.05] transition-opacity duration-1000" />
              
              <div className="border-b border-white/10 pb-6 flex flex-col gap-4 relative z-10">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_widgets")}</span>
                    {t("section_dlc_title")}
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">{t("section_dlc_desc")}</p>
                </div>
                <input 
                  value={dlcSearch} 
                  onChange={e => setDlcSearch(e.target.value)} 
                  placeholder={t("search_ph")}
                  className="w-full theme-glass-inner rounded-2xl px-5 py-3 text-xs font-bold text-[var(--text)] outline-none focus:theme-border-accent border border-[var(--text)]/10 shadow-inner"
                />
              </div>
              <FilterTabs className="w-full">
                {[
                  { id: 'Expansion Pack', label: 'Expansions' },
                  { id: 'Game Pack', label: 'Game Packs' },
                  { id: 'Stuff Pack', label: 'Stuff Packs' },
                  { id: 'KIT', label: 'Kits' }
                ].map(tab => (
                  <FilterTabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    activeTab={dlcTab}
                    setTab={setDlcTab}
                    className="flex-1"
                  />
                ))}
              </FilterTabs>
              <div className="flex flex-col gap-6 mt-4 relative z-10">
                {(() => {
                   const typeDlcs = dlcRegistry.filter(d => d.type === dlcTab && (!dlcSearch || d.name.toLowerCase().includes(dlcSearch.toLowerCase()))).sort((a,b) => a.id.localeCompare(b.id));
                   if(typeDlcs.length === 0) return <div className="py-8 text-center text-[10px] font-black uppercase tracking-[0.3em] opacity-30 border border-dashed border-white/10 rounded-2xl">{t("no_packs")}</div>;
                   return (
                     <div className="flex flex-wrap gap-3">
                       {typeDlcs.map(dlc => {
                          const isActive = parseDLC(targetMod.requiredDLC).includes(dlc.id);
                          return (
                            <button 
                              key={dlc.id} 
                              onClick={() => handleToggleDLC(dlc.id, isActive)}
                              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isActive ? 'bg-[var(--accent)]/20 border border-[var(--accent)]/50 backdrop-blur-md shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] text-white scale-[1.02]' : 'bg-[var(--text)]/5 border border-white/5 backdrop-blur-md text-[var(--subtext)] hover:bg-[var(--text)]/10 hover:border-white/20 hover:text-[var(--text)] hover:shadow-lg'}`}
                            >
                              {dlc.name}
                            </button>
                          );
                       })}
                     </div>
                   );
                })()}
              </div>
            </div>
          </div>

        </div>
      )}

      </div>
      
      <SidePanel
        isOpen={showFlavorGroupModal}
        onClose={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }}
        title={t("modal_create_group_title")}
        icon="hub"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button
              onClick={() => { setShowFlavorGroupModal(false); setNewFlavorGroupName(''); }}
              className="px-6 py-3 rounded-2xl bg-[var(--text)]/5 border border-white/5 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:border-white/20 hover:bg-[var(--text)]/10 transition-all active:scale-95"
            >
              {t("nav_cancel")}
            </button>
            <button
              onClick={handleCreateFlavorGroup}
              disabled={!newFlavorGroupName.trim()}
              className="px-6 py-3 rounded-2xl bg-[var(--accent)]/20 border border-[var(--accent)]/50 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:bg-[var(--accent)]/30 hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              <span className="material-symbols-outlined !text-[16px]">{t("icon_add_circle")}</span>
              {t("modal_btn_create")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("modal_group_name_label")}</label>
          <input
            autoFocus
            type="text"
            value={newFlavorGroupName}
            onChange={(e) => setNewFlavorGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFlavorGroup()}
            placeholder={t("modal_group_name_placeholder")}
            className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
          />
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!showLinkModal}
        onClose={() => setShowLinkModal(null)}
        title={showLinkModal?.title || ""}
        icon="link"
      >
        <div className="flex flex-col gap-4">
          <input 
            value={modalSearch} 
            onChange={e => setModalSearch(e.target.value)} 
            placeholder={t("search_ph")}
            className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] outline-none focus:theme-border-accent mb-2"
          />
          <div className="flex flex-col gap-3">
            {showLinkModal?.type === 'flavor_group' ? (
              allFlavorGroups.filter(g => !modalSearch || g.name.toLowerCase().includes(modalSearch.toLowerCase())).map(g => (
                <div key={g.id} className="flex justify-between items-center theme-glass-inner border border-white/5 hover:border-[var(--accent)]/50 p-4 rounded-xl transition-colors">
                  <span className="text-[11px] font-black uppercase text-[var(--text)]">{g.name}</span>
                  <button onClick={() => { handleJoinFlavorGroup(g.id); setShowLinkModal(null); }} className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/30 hover:scale-105 transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_hub")}</span> {t("modal_btn_join")}
                  </button>
                </div>
              ))
            ) : (showLinkModal?.type === 'dependency' ? allModsForDependencies : cloudMods).filter(m => 
              m.id !== targetMod?.id && 
              (showLinkModal?.type === 'dependency' || !masonId || m.mason_id === masonId) &&
              (!modalSearch || m.name.toLowerCase().includes(modalSearch.toLowerCase()))
            ).slice(0, 500).map(mod => (
              <div key={mod.id} className="flex justify-between items-center theme-glass-inner border border-white/5 hover:border-[var(--accent)]/50 p-4 rounded-xl transition-colors">
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden pr-4">
                  <span className="text-[11px] font-black uppercase text-[var(--text)] truncate">{mod.name}</span>
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60">{mod.latest_version ? `v${mod.latest_version}` : t("modal_no_version")}</span>
                </div>
                {showLinkModal?.type === 'twin' ? (
                   <div className="flex gap-2 shrink-0">
                     <button onClick={() => handleAddLink(mod.id, 'twin')} className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/30 hover:scale-105 transition-all flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[14px]">{t("icon_all_inclusive")}</span> {t("modal_btn_twin")}
                     </button>
                     <button onClick={() => handleAddLink(mod.id, 'addon')} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:scale-105 transition-all flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[14px]">{t("icon_extension")}</span> {t("modal_btn_addon")}
                     </button>
                   </div>
                ) : showLinkModal?.type === 'flavor' ? (
                   <div className="flex gap-2 shrink-0">
                     <button onClick={() => handleAddLink(mod.id, 'flavor')} className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/30 hover:scale-105 transition-all flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[14px]">{t("icon_palette")}</span> {t("modal_btn_flavor")}
                     </button>
                     <button onClick={() => handleAddLink(mod.id, 'beta')} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:scale-105 transition-all flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[14px]">{t("icon_science")}</span> {t("modal_btn_beta")}
                     </button>
                   </div>
                ) : (
                  <button onClick={() => handleAddLink(mod.id, showLinkModal?.type || "")} className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 backdrop-blur-md text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/30 hover:scale-105 transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_add_link")}</span> {t("btn_link")}
                  </button>
                )}
              </div>
            ))}
            {(showLinkModal?.type === 'dependency' ? allModsForDependencies : cloudMods).filter(m => m.id !== targetMod?.id && (!modalSearch || m.name.toLowerCase().includes(modalSearch.toLowerCase()))).length === 0 && (
              <div className="text-center p-8 text-[10px] font-bold text-[var(--subtext)] opacity-50 uppercase">{t("link_no_results")}</div>
            )}
          </div>
        </div>
      </SidePanel>

    </div>
  );
}
