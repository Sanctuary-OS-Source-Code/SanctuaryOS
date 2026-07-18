import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { EmptyState, SidePanel, CustomDropdown, GameVersionMultiSelect, CustomComplianceDropdown, CustomDatePicker, standardButtonClass, standardAccentGlassButtonClass } from "../shared";
import { ArtifactCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";

const fetchAllPaginated = async (queryFn: () => any) => { let allData: any[] = []; let from = 0; const step = 999; while (true) { const { data, error } = await queryFn().range(from, from + step); if (error || !data || data.length === 0) break; allData = [...allData, ...data]; if (data.length <= step) break; from += step + 1; } return { data: allData, error: null }; };


export function MasonRegistry({ masonId, initialActiveMod, onClearActiveMod, isActiveTab = true }: { masonId: string, initialActiveMod?: string | null, onClearActiveMod?: () => void, isActiveTab?: boolean }) {
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

  useEffect(() => {
    if (initialActiveMod && myMods.length > 0) {
      const mod = myMods.find(m => 
        m.id === initialActiveMod || 
        (m.mod_versions && m.mod_versions.some((v: any) => v.dna_hash === initialActiveMod))
      );
      if (mod) {
        setActiveMod(mod);
      } else {
        useStore.getState().pushStatus(t("auto_artifact_not_found_45"), "error");
      }
      if (onClearActiveMod) onClearActiveMod();
    }
  }, [initialActiveMod, myMods]);

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
      useStore.getState().pushStatus(t("saved_success"), 'success');
    } catch (err: any) { useStore.getState().pushStatus(`${t("alert_error")}${err.message}`, 'error'); }
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
    <>
    <div className={`flex flex-col gap-6 pb-20 ${isActiveTab ? '' : 'hidden'}`}>
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_deployed_code")}</span>
          </div>
          <span className="truncate">{t("title_artifacts")}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder={t("search_ph")} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>
          <div className="w-max min-w-[160px] max-w-xs shrink-0 relative z-50 h-12">
             <CustomDropdown disableTint={true}  value={statusFilter} onChange={(v: string[]) => setStatusFilter(v[0])} options={[{id: "ALL", label: "ALL STATUS"}, {id: "verified", label: "VERIFIED"}, {id: "unverified", label: "UNVERIFIED"}, {id: "broken", label: "BROKEN"}, {id: "deprecated", label: "DEPRECATED"}]} />
          </div>
        </div>
      </div>
      
      <div className="w-full p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pr-2">
          {displayMods.length === 0 && <EmptyState icon={t("icon_deployed_code") || "inventory"} title={t("registry_no_mods")} className="col-span-full py-16" />}
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
    </div>

    <SidePanel
      isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        title={t("ui_edit_metadata")}
        subtitle={`UUID: ${activeMod?.id}`}
        icon="inventory_2"
        backdropZ="z-[50000]"
        widthClass="w-[600px]"
        panelZ="z-[50001]"
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button onClick={() => setActiveMod(null)} disabled={isCommitting} className={standardButtonClass}>
              {t("nav_cancel")}
            </button>
            <button onClick={handleCommitChanges} disabled={isCommitting} className={standardAccentGlassButtonClass}>
              {isCommitting ? t("btn_saving") : t("save_meta")}
            </button>
          </div>
        }
      >
        {activeMod && (
          <div className="flex flex-col h-full gap-8">
            <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
              <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                {t("metadata")}
              </h4>
              
              <div className="flex flex-col gap-2 relative z-10">
                <input value={activeMod?.name || ""} onChange={e => setActiveMod({...activeMod, name: e.target.value})} placeholder={t("registry_label_name")} className="bg-transparent text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[var(--accent)]/30 pb-1 w-full" />
              </div>
            </div>
            


              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("category")}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({...activeMod, category_override: val})} />
                </div>
                
                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_file_ext")}</label>
                    <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({...activeMod, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("ph_file_ext")} />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_e_g_tuning_26")} />
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar" />
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("cc_cover_url")}</label>
                <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-1">
                    {t("registry_label_version")} 
                  </label>
                  <input value={activeMod.latest_version || ""} onChange={e => setActiveMod({ ...activeMod, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--subtext)] text-sm font-bold focus:outline-none focus:theme-border-success" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status")}</label>
                  <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety")}</label>
                  <CustomComplianceDropdown value={activeMod.compliance_tier || 0} onChange={(newTier: number) => setActiveMod({...activeMod, compliance_tier: newTier})} includeTier3={false} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("uploaded_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={(date: any) => setActiveMod({...activeMod, created_at: date})} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("updated_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={(date: any) => setActiveMod({...activeMod, updated_at: date})} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4 pb-25">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
                <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v: string[]) => setActiveMod({...activeMod, compatible_versions: v})} />
              </div>
            </div>
        )}
      </SidePanel>
    </>
  );
}

export function ArchitectRegistry({ isActiveTab = true, initialSearch = "", onClearSearch, initialActiveMod = null, onClearActiveMod, modList , setStatus }: any = {}) {
  const { t } = useLexicon();
  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeMod, setActiveMod] = useState<any | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [masonsList, setMasonsList] = useState<any[]>([]);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeSubType, setActiveSubType] = useState("ALL");

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const PAGE_SIZE = 50;

  const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
  const [newMasonName, setNewMasonName] = useState("");
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      if (onClearSearch) onClearSearch();
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialActiveMod) {
      setActiveMod(initialActiveMod);
      if (onClearActiveMod) onClearActiveMod();
    }
  }, [initialActiveMod]);

  const fetchData = async (reset = false) => {
    setIsLoading(true);
    const currentPage = reset ? 0 : page;
    let query = supabase.from('mods').select('*, mod_versions(id, dna_hash, version_label, game_version)', { count: 'exact' });

    if (activeCategory !== "ALL") {
      query = query.eq('category_override', activeCategory);
      if (activeCategory === "CAS" && activeSubType !== "ALL") {
        query = query.eq('sub_type', activeSubType);
      }
    }
    
    if (statusFilter !== "ALL") {
      query = query.eq('status', statusFilter);
    }

    if (searchTerm) {
       if (searchTerm.toLowerCase() === 'nsfw') {
         query = query.eq('compliance_tier', 1);
       } else if (searchTerm.toLowerCase() === 'explicit') {
         query = query.eq('compliance_tier', 2);
       } else {
         query = query.ilike('name', `%${searchTerm}%`);
       }
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (!error && data) {
      if (reset) {
        setCloudMods(data);
      } else {
        setCloudMods(prev => {
          const newIds = new Set(data.map(d => d.id));
          return [...prev.filter(p => !newIds.has(p.id)), ...data];
        });
      }
      setHasMore(count !== null && (currentPage + 1) * PAGE_SIZE < count);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    setPage(0);
    fetchData(true);
  }, [activeCategory, activeSubType, statusFilter, searchTerm]);

  useEffect(() => {
    if (page > 0) fetchData(false);
  }, [page]);

  useEffect(() => {
    const fetchMasons = async () => {
      const { data } = await supabase.from('masons').select('id, name').order('name');
      if (data) setMasonsList(data);
    };
    fetchMasons();
  }, []);

  const handleCreateMason = async () => {
    if (!newMasonName.trim()) return;
    setIsCreatingMason(true);
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
    if (!error) {
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setActiveMod({...activeMod, mason_id: newId});
      setIsMasonPanelOpen(false);
      setNewMasonName("");
    }
    setIsCreatingMason(false);
  };

  const handleCommitChanges = async () => {
    if (!activeMod) return;
    setIsCommitting(true);
    try {
      const { error } = await supabase.from('mods').update({
        name: activeMod.name,
        category_override: activeMod.category_override,
        sub_type: activeMod.sub_type,
        file_extension: activeMod.file_extension,
        status: activeMod.status,
        url: activeMod.url,
        image_url: activeMod.image_url,
        latest_version: activeMod.latest_version,
        description: activeMod.description,
        compatible_versions: activeMod.compatible_versions,
        family_slug: activeMod.family_slug,
        mason_id: activeMod.mason_id,
        compliance_tier: activeMod.compliance_tier,
        folder_structure: activeMod.folder_structure || [],
        updated_at: new Date().toISOString()
      }).eq('id', activeMod.id);

      if (!error) {
        logArchitectAction(`Updated Mod Metadata`, `mods`, activeMod.name);
        if (setStatus) setStatus(`${t("icon_check_circle")} [${activeMod.name}] ${t("alert_saved")}`);
        setPage(0);
        fetchData(true);
      } else {
        if (setStatus) setStatus(`${t("icon_block")} ${t("alert_error")} ${t(error.message)}`);
      }
    } catch (err: any) {
      if (setStatus) setStatus(`${t("icon_block")} ${t("alert_error")} ${t(err.message)}`);
    }
    setIsCommitting(false);
  };

  return (
    <>
      <div className={`flex flex-col gap-6 pb-20 w-full h-full relative ${isActiveTab ? '' : 'hidden'}`}>
        <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_inventory_2")}</span>
            </div>
            <span className="truncate">{t("items")}</span>
          </h2>
          
          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder={t("search_queue")} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>

          <div className="w-max min-w-[160px] max-w-xs relative z-50 h-12">
            <CustomDropdown disableTint={true}
              value={activeCategory}
              onChange={(val: string[]) => { setActiveCategory(val[0]); setActiveSubType("ALL"); }}
              options={[
                { id: "ALL", label: t("ql_all") },
                ...(useStore.getState().activeGameSchema?.mod_categories || []).map((c: any) => ({ id: c.id, label: t(c.lexicon_key) || c.id }))
              ]}
            />
          </div>

          {(() => {
            const activeSchemaCategory = useStore.getState().activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
            const subcats = activeSchemaCategory?.subcategories || [];
            if (subcats.length === 0) return null;
            
            return (
              <div className="w-max min-w-[160px] max-w-xs relative z-50 h-12 animate-in fade-in slide-in-from-right-4">
                <CustomDropdown disableTint={true}
                  value={activeSubType}
                  onChange={(val: string[]) => setActiveSubType(val[0])}
                  options={[
                    { id: "ALL", label: t("ql_all") },
                    ...subcats.map((sub: any) => ({
                      id: sub.id,
                      label: t(sub.lexicon_key) || sub.id
                    }))
                  ]}
                />
              </div>
            );
          })()}

          <div className="w-max min-w-[192px] max-w-xs relative z-50 h-12">
             <CustomDropdown disableTint={true} value={statusFilter} onChange={(v: string[]) => setStatusFilter(v[0])} options={[{id: "ALL", label: "ALL STATUS"}, {id: "verified", label: "VERIFIED"}, {id: "unverified", label: "UNVERIFIED"}, {id: "broken", label: "BROKEN"}, {id: "deprecated", label: "DEPRECATED"}]} />
          </div>
        </div>
      </div>

      <div className="p-6 w-full">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pr-2">
          {cloudMods.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : t("icon_inventory_2") || "inventory"} title={searchTerm ? t("no_matches") : t("no_artifacts") || "No Artifacts Found"} className="col-span-full py-16" />
            ) : cloudMods.map((mod: any) => (
              <ArtifactCard 
                key={mod.id} 
                mod={mod} 
                activeModId={activeMod?.id} 
                onClick={() => setActiveMod(mod)} 
              />
          ))}
        </div>
        
        {hasMore && (
          <div className="w-full flex justify-center mt-12 mb-8">
            <button 
              onClick={() => setPage(p => p + 1)} 
              disabled={isLoading}
              className="px-8 py-3 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[var(--accent)]/50 transition-all font-black text-[10px] uppercase tracking-widest text-[var(--text)] flex items-center gap-2"
            >
              {isLoading ? (
                <><span className="material-symbols-outlined animate-spin !text-[16px]">{t("icon_sync")}</span> {t("ui_loading")}</>
              ) : (
                <><span className="material-symbols-outlined !text-[16px]">{t("icon_expand_more")}</span> {t("ui_btn_load_more")}</>
              )}
            </button>
          </div>
        )}
      </div>
      </div>

      <SidePanel
        isOpen={!!activeMod}
        onClose={() => setActiveMod(null)}
        widthClass="w-[600px]"
        title={t("ui_edit_metadata")}
        subtitle={`UUID: ${activeMod?.id}`}
        icon={t("icon_inventory_2")}
        footer={
          <div className="flex justify-center items-center gap-4 w-full">
            <button onClick={() => setActiveMod(null)} disabled={isCommitting} className={standardButtonClass}>
              {t("nav_cancel")}
            </button>
            <button onClick={handleCommitChanges} disabled={isCommitting} className={standardAccentGlassButtonClass}>
              {isCommitting ? (t("dossier_btn_saving")) : (t("ui_btn_commit"))}
            </button>
          </div>
        }
      >
        {activeMod && (
          <div className="flex flex-col gap-6 pb-8">
            <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative mb-2">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
              <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                {t("metadata")}
              </h4>
              
              <div className="flex flex-col gap-2 relative z-10">
                <input value={activeMod?.name || ""} onChange={e => setActiveMod({...activeMod, name: e.target.value})} placeholder={t("registry_label_name")} className="bg-transparent text-xl font-black text-[var(--text)] uppercase tracking-tighter leading-none focus:outline-none focus:theme-text-accent transition-colors placeholder:opacity-30 border-b border-transparent focus:border-[var(--accent)]/30 pb-1 w-full" />
              </div>
            </div>


                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("architect")}</label>
                  <div className="flex gap-2 relative">
                    <div className="flex-1 min-w-0">
                      <CustomMasonDropdown 
                        value={activeMod.mason_id} 
                        options={masonsList} 
                        onChange={(id: string) => setActiveMod({...activeMod, mason_id: id})} 
                      />
                    </div>
                    <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                      +
                    </button>
                  </div>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("category")}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(newType: string) => setActiveMod({...activeMod, category_override: newType})} />
                </div>
                
                <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_file_ext")}</label>
                    <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({...activeMod, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("ph_file_ext")} />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({...activeMod, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_e_g_tuning_26")} />
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({...activeMod, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-accent custom-scrollbar" />
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("cc_cover_url")}</label>
                <input value={activeMod.image_url || ""} onChange={e => setActiveMod({...activeMod, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-1">
                    {t("registry_label_version")} 
                  </label>
                  <input value={activeMod.latest_version || ""} onChange={e => setActiveMod({ ...activeMod, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--subtext)] text-sm font-bold focus:outline-none focus:theme-border-success" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({...activeMod, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 theme-text-accent text-sm font-bold focus:outline-none focus:theme-border-accent" placeholder={t("auto_https")} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_status")}</label>
                  <CustomStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({...activeMod, status: newStatus})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_safety")}</label>
                  <CustomComplianceDropdown value={activeMod.compliance_tier || 0} onChange={(newTier: number) => setActiveMod({...activeMod, compliance_tier: newTier})} includeTier3={false} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("uploaded_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={(date: any) => setActiveMod({...activeMod, created_at: date})} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("updated_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={(date: any) => setActiveMod({...activeMod, updated_at: date})} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4 pb-25">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
                <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v: string[]) => setActiveMod({...activeMod, compatible_versions: v})} />
              </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={isMasonPanelOpen}
        onClose={() => setIsMasonPanelOpen(false)}
        title={t("create_title")}
        icon="person_add"
        widthClass="w-[450px]"
        footer={
          <div className="flex justify-end gap-4 w-full">
            <button onClick={() => setIsMasonPanelOpen(false)} className={standardButtonClass}>
              {t("nav_cancel")}
            </button>
            <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
              {t("create_btn_create")}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_name")}</label>
          <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("create_ph_name")} className="theme-glass-inner rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
        </div>
      </SidePanel>
    </>
  )
}

export function CustomClassificationDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const options = [
    { id: "Unknown", label: t("ui_icon_unknown") || "Unknown" },
    ...(activeGameSchema?.mod_categories || []).map((c: any) => ({
      id: c.id,
      label: t(c.lexicon_key) || c.id
    }))
  ];
  return <CustomDropdown disableTint={true}  value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("architect")} />;
}

