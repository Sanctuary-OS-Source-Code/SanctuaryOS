import React, { useState, useEffect } from "react";
import { DashboardStatTile, fetchAllPaginated , isSupportedExtension } from "../shared";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { 
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect, 
  CustomComplianceDropdown, CustomDatePicker, StatTile, 
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, 
  standardDangerButtonClass, standardAccentGlassButtonClass, 
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";


export function ScoutQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
    const { t } = useLexicon();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTab, setFilterTab] = useState<'pending' | 'completed'>('pending');
    const [visibleCount, setVisibleCount] = useState(100);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [masonsList, setMasonsList] = useState<any[]>([]);
    const [cloudModsList, setCloudModsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeScout, setActiveScout] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lineageId, setLineageId] = useState<string>("");
  
    const [isMasonPanelOpen, setIsMasonPanelOpen] = useState(false);
    const [newMasonName, setNewMasonName] = useState("");
    const [isCreatingMason, setIsCreatingMason] = useState(false);
  
    const handleCreateMason = async () => {
      if (!newMasonName.trim()) return;
      setIsCreatingMason(true);
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('masons').insert([{ id: newId, name: newMasonName }]);
      if (!error) {
        const { data: mData } = await supabase.from('masons').select('id, name').order('name');
        if (mData) setMasonsList(mData);
        setEditForm({...editForm, mason_id: newId});
        setIsMasonPanelOpen(false);
        setNewMasonName("");
      }
      setIsCreatingMason(false);
    };
  
    const [editForm, setEditForm] = useState({
      name: "",
      mason_id: "",
      category_override: "",
      sub_type: "", file_extension: "",
      description: "",
      image_url: "",
      latest_version: "",
      url: "",
      compliance_tier: 0,
      compatible_versions: [] as string[],
      hash_version: ""
    });
  
    const fetchSubmissions = async () => {
      setLoading(true);
      const { data: mData } = await supabase.from('masons').select('*').order('name');
      if (mData) setMasonsList(mData);

      const { data: cData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url, mason_id, category_override, compliance_tier, compatible_versions, file_extension').order('name'));
      if (cData) setCloudModsList(cData);

      const { data, error } = await supabase
        .from('scout_suggestions')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) setSubmissions(data);
      setLoading(false);
    };
  
    useEffect(() => { fetchSubmissions(); },[]);
  
    useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);
  
    useEffect(() => {
      if (activeScout) {
        setLineageId("");
        const possibleMason = masonsList.find((m: any) => m.name === activeScout.suggested_author || m.id === activeScout.suggested_mason_id);
        let st = activeScout.suggested_sub_type || "";
        let fe = "";
        if (isSupportedExtension(st, useStore.getState().activeGameSchema)) {
          fe = "." + st.toLowerCase();
          st = "";
        }
        
        setEditForm({
          name: (activeScout.suggested_name || "").replace(/_/g, " "),
          mason_id: possibleMason ? possibleMason.id : "",
          category_override: activeScout.suggested_type || "Script",
          sub_type: st,
          file_extension: fe,
          description: "",
          image_url: "",
          latest_version: "",
          url: activeScout.suggested_url || "",
          compliance_tier: 0,
          compatible_versions: [],
          hash_version: activeScout.suggested_version || "v.Scout"
        });
      } else {
        setEditForm({
          name: "", mason_id: "", category_override: "", sub_type: "", file_extension: "", description: "", image_url: "", latest_version: "", url: "", compliance_tier: 0, compatible_versions: [], hash_version: ""
        });
        setLineageId("");
      }
    }, [activeScout, masonsList]);
  
    useEffect(() => {
      if (lineageId && cloudModsList) {
         const existing = cloudModsList.find(m => m.id === lineageId);
         if (existing) {
            setEditForm(prev => ({
              ...prev,
              name: existing.name || prev.name,
              mason_id: existing.mason_id || prev.mason_id,
              category_override: existing.category_override || prev.category_override,
              compliance_tier: existing.compliance_tier || prev.compliance_tier,
              compatible_versions: existing.compatible_versions || prev.compatible_versions
            }));
         }
      }
    }, [lineageId, cloudModsList]);
  
    const handleAction = async (action: 'approved' | 'rejected') => {
      if (!activeScout) return;
      setIsProcessing(true);
      
      if (action === 'approved') {
        if (lineageId) {
          await supabase.from('mod_versions').upsert({
            mod_id: lineageId,
            dna_hash: activeScout.dna_hash,
            version_label: editForm.hash_version
          }, { onConflict: 'dna_hash' });
          
          await supabase.from('mods').update({
             name: editForm.name,
             mason_id: editForm.mason_id || null,
             category_override: editForm.category_override,
             sub_type: editForm.sub_type,
               file_extension: editForm.file_extension,
             description: editForm.description,
             image_url: editForm.image_url,
             url: editForm.url,
             compliance_tier: editForm.compliance_tier,
             compatible_versions: editForm.compatible_versions,
             status: 'verified'
          }).eq('id', lineageId);
        } else {
          const { data: modData } = await supabase.from('mods').insert({
            name: editForm.name,
            mason_id: editForm.mason_id || null,
            category_override: editForm.category_override,
            sub_type: editForm.sub_type,
               file_extension: editForm.file_extension,
            description: editForm.description,
            image_url: editForm.image_url,
            latest_version: editForm.latest_version,
            url: editForm.url,
            compliance_tier: editForm.compliance_tier,
            compatible_versions: editForm.compatible_versions,
            status: 'verified'
          }).select().single();
          
          if (modData) {
            await supabase.from('mod_versions').upsert({
              mod_id: modData.id,
              dna_hash: activeScout.dna_hash,
              version_label: editForm.hash_version
            }, { onConflict: 'dna_hash' });
          }
        }
        await supabase.from('scout_suggestions').update({ status: 'approved' }).eq('id', activeScout.id);
        logArchitectAction('Approved Scout Submission', 'scout_suggestions', activeScout.id);
      } else {
        await supabase.from('scout_suggestions').update({ status: 'rejected' }).eq('id', activeScout.id);
        logArchitectAction('Rejected Scout Submission', 'scout_suggestions', activeScout.id);
      }
  
      setActiveScout(null);
      await fetchSubmissions();
      setIsProcessing(false);
    };
  
    const activeSubmissions = submissions.filter((s: any) => filterTab === 'pending' ? s.status === 'pending' : s.status !== 'pending');
    let filteredSubmissions = activeSubmissions.filter((s: any) => {
      return s.suggested_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.id?.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    const seenHashes = new Set();
    filteredSubmissions = filteredSubmissions.filter((s: any) => {
      if (!s.dna_hash) return true;
      if (seenHashes.has(s.dna_hash)) return false;
      seenHashes.add(s.dna_hash);
      return true;
    });
  
    return (
      <div className="flex flex-col w-full relative h-full">
        <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_search")}</span>
            </div>
            <span className="truncate">{t("scout_queue")}</span>
          </h2>
          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
            <div className="relative flex-1 max-w-[300px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
              <input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder={t("search_queue")} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>            <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 shadow-inner h-12 shrink-0 hidden md:flex mr-4">
              <button onClick={() => setFilterTab('pending')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_pending")}</button>
              <button onClick={() => setFilterTab('completed')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'completed' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_completed")}</button>
            </div>
          </div>
        </div>
  
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
              <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("intercepting")}</div>
          ) : filteredSubmissions.length === 0 ? (
              <EmptyState icon={t("icon_account_balance") || "account_balance"} title={t("no_pending_submissions")} className="col-span-full py-16" />
          ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                {filteredSubmissions.slice(0, visibleCount).map((mod: any) => (
                    <ArtifactCard key={mod.id} mod={{ ...mod, name: mod.suggested_name, category_override: mod.suggested_type || "Scout Suggestion" }} onClick={() => setActiveScout(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view")} />
                ))}
                </div>
                {filteredSubmissions.length > visibleCount && (
                  <button 
                    onClick={() => setVisibleCount(v => v + 100)}
                    className="w-full py-4 mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] font-black uppercase tracking-widest transition-all"
                  >
                    {t("ui_btn_load_more")} ({visibleCount} / {filteredSubmissions.length})
                  </button>
                )}
              </div>
          )}
        </div>
  
        <SidePanel
          isOpen={!!activeScout}
          onClose={() => setActiveScout(null)}
          title={t("reviewing")}
            icon={t("icon_search")}
          subtitle={`HASH: ${activeScout?.dna_hash}`}
          actions={
            <>
              <button onClick={() => handleAction('rejected')} disabled={isProcessing} className={standardDangerButtonClass}>
                {t("discard")}
              </button>
              <button onClick={() => handleAction('approved')} disabled={isProcessing} className={standardSuccessButtonClass}>
                {isProcessing ? t("btn_saving") : t("approve")}
              </button>
            </>
          }
        >
          {activeScout && (
            <div className="flex flex-col gap-6">
                
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent pointer-events-none rounded-2xl" />
                  
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_account_tree")}</span>
                      {t("label_lineage")}
                    </label>
                    <ModSearchDropdown 
                      modList={cloudModsList || []} 
                      onSelect={(m: any) => setLineageId(m.id)} 
                      selectedItem={cloudModsList?.find((m: any) => m.id === lineageId)} 
                      onClear={() => setLineageId("")}
                      placeholder={t("ph_link_lineage")}
                    />
                    <p className="text-[9px] font-bold text-[var(--subtext)] opacity-60 mt-1 ml-2">
                      {t("label_lineage_desc")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                    {t("btn_view")}
                  </h4>
                  
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_modname")}</label>
                      <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_select")}</label>
                      <div className="flex gap-2 relative">
                        <div className="flex-1 min-w-0">
                          <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({...editForm, mason_id: id})} />
                        </div>
                        <button onClick={() => setIsMasonPanelOpen(true)} className="bg-white/10 hover:theme-bg-accent hover:text-[var(--bg)] text-[var(--text)] px-5 rounded-xl font-black transition-colors shrink-0">
                          +
                        </button>
                      </div>
                    </div>
                  </div>
    
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                      <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({...editForm, category_override: newType})} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_file_ext")}</label>
                        <input value={editForm.file_extension} onChange={e => setEditForm({...editForm, file_extension: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder={t("ph_file_ext")} />
                      </div>
                      <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_col_subcat")}</label>
                      <input value={editForm.sub_type} onChange={e => setEditForm({...editForm, sub_type: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" placeholder={t("auto_e_g_tuning_object_cas")} />
                    </div>
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span>
                    {t("label_resources")}
                  </h4>

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                    <input value={editForm.url || ""} onChange={e => setEditForm({...editForm, url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("cc_cover_url")}</label>
                    <input value={editForm.image_url || ""} onChange={e => setEditForm({...editForm, image_url: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
                    <textarea value={editForm.description || ""} onChange={e => setEditForm({...editForm, description: e.target.value})} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold h-28 resize-none focus:outline-none focus:border-emerald-500/50 bg-black/20" />
                  </div>
                </div>
  
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("status_verified")}</span>
                    {t("compliance_tier")}
                  </h4>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("compliance_tier")}</label>
                      <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({...editForm, compliance_tier: val})} includeTier3={false} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2 flex items-center gap-1">
                        {t("registry_label_version")}
                      </label>
                      <input value={editForm.latest_version} onChange={e => setEditForm({ ...editForm, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="theme-glass-inner rounded-xl px-5 h-12 text-purple-400 text-sm font-bold focus:outline-none focus:border-purple-500/50 bg-black/20" />
                    </div>
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
                    <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({...editForm, compatible_versions: v})} />
                  </div>
                </div>

            </div>
          )}
        </SidePanel>
  
        <SidePanel
          isOpen={isMasonPanelOpen}
          onClose={() => setIsMasonPanelOpen(false)}
          title={t("create_title")}
            icon={t("icon_person_add")}
            actions={
            <button onClick={handleCreateMason} className={standardAccentGlassButtonClass}>
              {t("create_btn_create")}
            </button>
          }
        >
          <div className="p-6">
            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("mason_name")}</label>
            <input value={newMasonName} onChange={e => setNewMasonName(e.target.value)} placeholder={t("create_ph_name")} className="theme-glass-inner rounded-xl px-5 h-12 mt-2 w-full text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
          </div>
        </SidePanel>
      </div>
    )
  }

