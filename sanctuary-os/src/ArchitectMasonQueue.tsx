import React, { useState, useEffect } from "react";
import { DashboardStatTile, fetchAllPaginated } from "./shared";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { 
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect, 
  CustomComplianceDropdown, CustomDatePicker, StatTile, 
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, 
  standardDangerButtonClass, standardAccentGlassButtonClass, 
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MarkdownRenderer from "./MarkdownRenderer";


export function MasonQueue({ modList = [], setStatus }: { modList?: any[], setStatus?: any }) {
    const { t } = useLexicon();
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTab, setFilterTab] = useState<'pending' | 'completed'>('pending');
    const [visibleCount, setVisibleCount] = useState(100);
    const [masonsList, setMasonsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMod, setActiveMod] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
  
    const [editForm, setEditForm] = useState({
      name: '',
      mason_id: '',
      category_override: '',
      sub_type: '',
        file_extension: '',
      description: '',
      image_url: '',
      latest_version: '',
      url: '',
      compliance_tier: 0,
      compatible_versions: [] as string[]
    });
  
    const fetchData = async () => {
      setLoading(true);
      const { data: qData } = await fetchAllPaginated(() => supabase.from('mods').select('*').order('updated_at', { ascending: false }));
      if (qData) setSubmissions(qData);
      const { data: mData } = await supabase.from('masons').select('id, name').order('name');
      if (mData) setMasonsList(mData);
      setLoading(false);
    };
  
    useEffect(() => { fetchData(); }, []);
  
    useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);
  
    const handleSelect = (mod: any) => {
      setActiveMod(mod);
      setEditForm({
        name: mod.name || '',
        mason_id: mod.mason_id || '',
        category_override: mod.category_override || 'Script',
        sub_type: mod.sub_type || '',
          file_extension: mod.file_extension || '',
        description: mod.description || '',
        image_url: mod.image_url || '',
        latest_version: mod.latest_version || '',
        url: mod.url || '',
        compliance_tier: mod.compliance_tier || 0,
        compatible_versions: mod.compatible_versions || []
      });
    };
  
    const handleApprove = async () => {
      if (!activeMod) return;
      setIsProcessing(true);
      
      const { error } = await supabase.from('mods').update({
        ...editForm,
        status: 'verified'
      }).eq('id', activeMod.id);
  
      if (!error) {
        logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
        setActiveMod(null);
        fetchData();
      } else {
        if (setStatus) setStatus(`${t("icon_block")} ${t("err_save_failed")} ${t(error.message)}`);
      }
      setIsProcessing(false);
    };
  
    const handleReject = async () => {
      if (!activeMod) return;
      const reason = prompt(t("prompt_reject_reason"));
      if (reason === null) return;
      setIsProcessing(true);
      
      const { error } = await supabase.from('mods').update({
        status: 'unverified',
        description: (editForm.description + '\n\nREJECTION REASON: ' + reason).trim()
      }).eq('id', activeMod.id);
  
      if (!error) {
        logArchitectAction('Updated Mod Metadata', 'mods', activeMod.name);
        setActiveMod(null);
        fetchData();
      } else {
        if (setStatus) setStatus(`${t("icon_block")} ${t("err_save_failed")} ${t(error.message)}`);
      }
      setIsProcessing(false);
    };
  
    const activeSubmissions = submissions.filter((s: any) => filterTab === 'pending' ? s.status === 'under_review' : s.status !== 'under_review');
    let filteredSubmissions = activeSubmissions.filter((s: any) => s.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const seenNames = new Set();
    filteredSubmissions = filteredSubmissions.filter((s: any) => {
      if (!s.name) return true;
      const lowerName = s.name.toLowerCase();
      if (seenNames.has(lowerName)) return false;
      seenNames.add(lowerName);
      return true;
    });
  
    return (
      <div className="flex flex-col w-full relative h-full">
        <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_construction")}</span>
            </div>
            <span className="truncate">{t("stat_mason_queue")}</span>
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
              <div className="h-full flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("hub_loading")}</div>
          ) : filteredSubmissions.length === 0 ? (
              <EmptyState icon={t("icon_account_balance") || "account_balance"} title={t("no_pending_masons")} className="col-span-full py-16" />
          ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                {filteredSubmissions.slice(0, visibleCount).map((mod: any) => (
                    <ArtifactCard key={mod.id} mod={mod} onClick={() => handleSelect(mod)} masonsList={masonsList} overrideActionLabel={t("btn_view")} />
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
          isOpen={!!activeMod}
          onClose={() => setActiveMod(null)}
          title={t("registry_select_master")}
            icon={t("icon_construction")}
          subtitle={`UUID: ${activeMod?.id}`}
          actions={
            <>
              <button onClick={handleReject} disabled={isProcessing} className={standardDangerButtonClass}>{t("registry_btn_sever")}</button>
              <button onClick={handleApprove} disabled={isProcessing} className={standardSuccessButtonClass}>{isProcessing ? t("btn_saving") : t("registry_btn_approve")}</button>
            </>
          }
        >
          {activeMod && (
            <div className="flex flex-col gap-6">
                
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                    {t("btn_view")}
                  </h4>
                  
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_modname")}</label>
                    <input value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} className="theme-glass-inner rounded-xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent bg-black/20" />
                  </div>
    
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_mason")}</label>
                      <CustomMasonDropdown value={editForm.mason_id} options={masonsList} onChange={(id: string) => setEditForm({...editForm, mason_id: id})} />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                      <CustomClassificationDropdown value={editForm.category_override} onChange={(newType: string) => setEditForm({...editForm, category_override: newType})} />
                    </div>
                  </div>
    
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
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

                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("compliance_tier")}</label>
                    <CustomComplianceDropdown value={editForm.compliance_tier || 0} onChange={(val: number) => setEditForm({...editForm, compliance_tier: val})} includeTier3={false} />
                  </div>
    
                  <div className="flex flex-col gap-2 relative z-10">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
                    <GameVersionMultiSelect selectedVersions={editForm.compatible_versions || []} onChange={(v: string[]) => setEditForm({...editForm, compatible_versions: v})} />
                  </div>
                </div>
  
            </div>
          )}
        </SidePanel>
      </div>
    )
  }

