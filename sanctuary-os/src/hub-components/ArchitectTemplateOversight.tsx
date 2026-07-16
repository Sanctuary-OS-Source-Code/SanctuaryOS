import React, { useState, useEffect, useMemo } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { useLexicon } from "../LexiconContext";
import { standardPrimaryButtonClass, standardButtonClass, standardSuccessButtonClass, SidePanel, CustomDropdown, EmptyState } from "../shared";
import TemplatePreviewer from "../TemplatePreviewer";
import { supabase } from "../supabase";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";

export default function ArchitectTemplateOversight() {
  const { t } = useLexicon();
  const vaultPath = useStore(state => state.vaultPath);
  const incrementCommunityDefaultsRefreshTrigger = useStore(state => state.incrementCommunityDefaultsRefreshTrigger);
  const [trackedFiles, setTrackedFiles] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedFileGroup, setSelectedFileGroup] = useState<string | null>(null);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<any | null>(null);
  
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  
  const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [fileSearch, setFileSearch] = useState("");
  const [fileSort, setFileSort] = useState<string>("date");
  
  const [tmplSearch, setTmplSearch] = useState("");
  const [tmplSort, setTmplSort] = useState<string>("date");

  const [activeFilterTab, setActiveFilterTab] = useState<"active" | "flagged">("active");
  const [flaggedTemplateIds, setFlaggedTemplateIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        const [trackedRes, tmplRes, ticketsRes] = await Promise.all([
            supabaseServices.getTrackedTemplateFiles(),
            supabaseServices.getWorkbenchTemplates(),
            supabase.from('sanctuary_tickets').select('metadata').eq('ticket_type', 'TEMPLATE_FLAG').not('status', 'in', '("closed","resolved")')
        ]);
        
        if (!trackedRes.error && trackedRes.data) {
            setTrackedFiles(trackedRes.data);
        }
        if (!tmplRes.error && tmplRes.data) {
            setTemplates(tmplRes.data.map((tmpl: any) => {
                let parsedJson: any = {};
                try { parsedJson = JSON.parse(tmpl.json_data); } catch (e) {}
                return {
                    ...tmpl,
                    parsedData: parsedJson,
                    targetFile: parsedJson.target_file || tmpl.name
                };
            }));
        }
        if (ticketsRes && ticketsRes.data) {
            const ids = ticketsRes.data.map((t: any) => t.metadata?.target_mod_id).filter(Boolean);
            setFlaggedTemplateIds(ids);
        }
        setIsLoading(false);
    };
    fetchData();
  }, [refreshTrigger]);

  const handleAddSubmit = async () => {
      if (newFileName && newFileName.trim()) {
          const { data: { session } } = await supabase.auth.getSession();
          await supabaseServices.addTrackedTemplateFile(newFileName.trim(), session?.user?.id || "");
          setNewFileName("");
          setIsAddPanelOpen(false);
          setRefreshTrigger(prev => prev + 1);
      }
  };

  const handleSetDefault = async (tmpl: any) => {
    setIsSettingDefault(tmpl.id);
    const res = await supabaseServices.setCommunityDefaultTemplate(tmpl.id, tmpl.targetFile);
    console.log("Set Default Result:", res);
    if (res.error) {
        console.error("Failed to set default:", res.error);
        alert("Failed to set default: " + res.error.message);
    } else {
        incrementCommunityDefaultsRefreshTrigger();
    }
    setIsSettingDefault(null);
    setSelectedTemplateForPreview(null);
    setRefreshTrigger(prev => prev + 1);
  };

  const processedFiles = useMemo(() => {
      let filtered = trackedFiles;
      if (activeFilterTab === "flagged") {
          filtered = filtered.filter(f => {
              const fileTemplates = templates.filter(t => t.targetFile === f.file_name);
              return fileTemplates.some(t => flaggedTemplateIds.includes(t.id));
          });
      }
      if (fileSearch) {
          filtered = filtered.filter(f => f.file_name.toLowerCase().includes(fileSearch.toLowerCase()));
      }
      return filtered.sort((a, b) => {
          if (fileSort === "name") return a.file_name.localeCompare(b.file_name);
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [trackedFiles, fileSearch, fileSort, activeFilterTab, templates, flaggedTemplateIds]);

  const processedTemplates = useMemo(() => {
      if (!selectedFileGroup) return [];
      let filtered = templates.filter(t => t.targetFile === selectedFileGroup);
      if (activeFilterTab === "flagged") {
          filtered = filtered.filter(t => flaggedTemplateIds.includes(t.id));
      }
      if (tmplSearch) {
          filtered = filtered.filter(t => 
              (t.name || "").toLowerCase().includes(tmplSearch.toLowerCase()) || 
              (t.author || "").toLowerCase().includes(tmplSearch.toLowerCase())
          );
      }
      return filtered.sort((a, b) => {
          if (tmplSort === "name") return (a.name || "").localeCompare(b.name || "");
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [templates, selectedFileGroup, tmplSearch, tmplSort, activeFilterTab, flaggedTemplateIds]);

  return (
    <div className="flex flex-col gap-6 w-full pb-32 text-[var(--text)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      

      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_data_object") || "data_object"}</span>
          </div>
          <span className="truncate">{t("tab_templates") || "Community Templates"}</span>
        </h2>
        
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">

            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
               <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search") || "search"}</span>
               <input 
                  type="text" 
                  placeholder={t("template_search_files") || "Search tracked files..."}
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
               />
            </div>

            <div className="w-max min-w-[192px] max-w-xs hidden xl:block shrink-0 z-40">
               <CustomDropdown 
                  disableTint={true} 
                  value={fileSort} 
                  options={[{id: "date", label: t("template_sort_date") || "DATE ADDED"}, {id: "name", label: t("sort_name") || "NAME (A-Z)"}]} 
                  onChange={(val: string[]) => setFileSort(val[0])} 
               />
            </div>
            
            <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 shadow-inner h-12 shrink-0 z-40">
                <button 
                    onClick={() => setActiveFilterTab("active")}
                    className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilterTab === 'active' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
                >
                    {t("status_active") || "Active"}
                </button>
                <button 
                    onClick={() => setActiveFilterTab("flagged")}
                    className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeFilterTab === 'flagged' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
                >
                    {t("oversight_tab_flagged") || "Flagged"}
                </button>
            </div>
            
            <button 
               onClick={() => setIsAddPanelOpen(true)}
               className="h-12 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] font-black uppercase tracking-[0.1em] text-[10px]"
            >
               <span className="material-symbols-outlined !text-[16px]">{t("icon_add") || "add"}</span>
               {t("btn_add") || "Add Target File"}
            </button>
        </div>
      </div>

      <div className="w-full flex flex-col gap-4 mt-2">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50">
            <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("ui_btn_processing") || t("ui_loading") || "Loading..."}</span>
          </div>
        ) : processedFiles.length === 0 ? (
          <EmptyState icon={t("icon_architecture") || "architecture"} title={t("no_tracked_files") || "No Tracked Files"} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 px-6">
            {processedFiles.map((tf) => {
                const groupTemplates = templates.filter(t => t.targetFile === tf.file_name);
                const defaultTmpl = groupTemplates.find(t => t.is_community_default);
                
                return (
                  <div 
                    key={tf.id}
                    onClick={() => { setSelectedFileGroup(tf.file_name); setSelectedTemplateForPreview(null); }}
                    className="theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] p-6"
                  >
                      <div className="absolute inset-0 transition-opacity duration-500 pointer-events-none opacity-0 group-hover:opacity-100 bg-gradient-to-br from-[var(--accent)]/5 to-transparent" />
                      <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${defaultTmpl ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
                      
                      <div className="flex items-start justify-between relative z-10 mb-4">
                          <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)]/30 transition-all duration-500 shadow-inner bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]">
                             <span className="material-symbols-outlined !text-[24px] text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-500 opacity-50 group-hover:opacity-100">{t("icon_description") || "description"}</span>
                          </div>
                          {defaultTmpl && (
                              <span className="material-symbols-outlined text-emerald-400 opacity-80" title="Has Community Default">{t("template_icon_verified") || "verified"}</span>
                          )}
                      </div>
                      
                      <div className="flex flex-col mt-auto relative z-10">
                          <span className="text-lg font-black text-[var(--text)] truncate">{tf.file_name}</span>
                          <span className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest mt-1 opacity-70">
                              {groupTemplates.length} {groupTemplates.length === 1 ? 'Template' : 'Templates'} Available
                          </span>
                      </div>
                  </div>
                );
            })}
          </div>
        )}
      </div>

      <SidePanel
         isOpen={isAddPanelOpen}
         onClose={() => setIsAddPanelOpen(false)}
         title="Add Target File"
         subtitle="Track a new configuration file"
         icon="add"
         iconColorClass="text-[var(--accent)]"
         actions={
             <>
                 <button onClick={() => setIsAddPanelOpen(false)} className={standardButtonClass}>
                     {t("shared_cancel") || "Cancel"}
                 </button>
                 <button onClick={handleAddSubmit} disabled={!newFileName.trim()} className={standardSuccessButtonClass}>
                     Save File
                 </button>
             </>
         }
      >
         <div className="p-6 flex flex-col gap-6">
             <div className="flex flex-col gap-2">
                 <label className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">File Name</label>
                 <input 
                    type="text" 
                    placeholder="e.g. mc_settings.cfg" 
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubmit()}
                    className="h-12 w-full px-4 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)]/50 transition-colors bg-black/40 text-sm font-bold text-[var(--text)] placeholder:text-[var(--subtext)] outline-none"
                    autoFocus
                 />
                 <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60">This exact file name will be used to query community templates.</span>
             </div>
         </div>
      </SidePanel>

      <SidePanel
        isOpen={!!selectedFileGroup}
        onClose={() => setSelectedFileGroup(null)}
        title={selectedFileGroup || "Template Configuration"}
        subtitle="Manage community defaults"
        icon="description"
        iconColorClass="text-[var(--accent)]"
        isResizable={false}
        widthClass="w-[900px]"
      >
        <div className="flex flex-col gap-6 p-6 overflow-y-auto custom-scrollbar h-full">
            
            {processedTemplates.find(t => t.is_community_default) && (
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[16px]">{t("template_icon_verified") || "verified"}</span>
                        Active Sanctuary Default
                    </h3>
                    {(() => {
                        const defaultTmpl = processedTemplates.find(t => t.is_community_default)!;
                        return (
                            <div 
                                onClick={() => setSelectedTemplateForPreview(defaultTmpl)}
                                className="flex flex-col theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(16,185,129,0.15)] relative overflow-hidden group"
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-[var(--success)] opacity-50" />
                                <div className="p-6 flex items-start gap-5">
                                    <div className="w-14 h-14 rounded-[1rem] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-inner bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]">
                                        <span className="material-symbols-outlined !text-[28px]">{t("icon_data_object") || "data_object"}</span>
                                    </div>
                                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-xl font-black text-[var(--text)] truncate group-hover:text-[var(--success)] transition-colors">{defaultTmpl.name || defaultTmpl.targetFile}</span>
                                        </div>
                                        <span className="text-xs text-[var(--subtext)] line-clamp-2 leading-relaxed">{defaultTmpl.description || "No description provided."}</span>
                                        <div className="flex items-center gap-4 text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest mt-2">
                                            <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_person") || "person"}</span> {defaultTmpl.author || (t("vlocal") || "Unknown")}</span>
                                            <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_calendar_today") || "calendar_today"}</span> {new Date(defaultTmpl.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            <div className="flex flex-col gap-4 mt-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">{t("available") || "Available Templates"}</h3>
                
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                       <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] !text-[16px]">search</span>
                       <input 
                          type="text" 
                          placeholder={t("search_tmpl") || "Search templates..."}
                          value={tmplSearch}
                          onChange={(e) => setTmplSearch(e.target.value)}
                          className="w-full h-12 pl-10 pr-4 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)]/50 transition-colors bg-black/20 text-[12px] font-bold text-[var(--text)] placeholder:text-[var(--subtext)] outline-none"
                       />
                    </div>
                    <div className="shrink-0 flex items-center gap-2 w-max min-w-[192px] max-w-xs">
                       <CustomDropdown 
                          disableTint={true} 
                          value={tmplSort} 
                          options={[{id: "date", label: t("template_sort_newest") || "NEWEST"}, {id: "name", label: t("sort_name") || "NAME (A-Z)"}]} 
                          onChange={(val: string[]) => setTmplSort(val[0])} 
                       />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pb-12">
                    {processedTemplates.filter(t => !t.is_community_default).length === 0 ? (
                        <EmptyState icon={t("icon_folder_open") || "folder_open"} title={t("no_additional") || "No additional templates"} className="col-span-2 py-8" />
                    ) : processedTemplates.filter(t => !t.is_community_default).map((tmpl) => (
                        <div 
                            key={tmpl.id} 
                            onClick={() => setSelectedTemplateForPreview(tmpl)}
                            className="flex flex-col theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 bg-black/20 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-lg group"
                        >
                            <div className="h-1 w-full rounded-t-2xl bg-transparent transition-colors group-hover:bg-[var(--accent)]/50" />
                            <div className="p-5 flex flex-col gap-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] text-[var(--accent)] group-hover:bg-[var(--accent)]/10 transition-colors">
                                        <span className="material-symbols-outlined !text-[20px]">{t("icon_data_object") || "data_object"}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-black text-[var(--text)] truncate">{tmpl.name || tmpl.targetFile}</span>
                                    <div className="flex flex-col gap-2 text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 mt-1">
                                        <span className="flex items-center gap-1.5 truncate"><span className="material-symbols-outlined !text-[12px]">{t("icon_person") || "person"}</span> {tmpl.author || (t("vlocal") || "Unknown")}</span>
                                        <span className="flex items-center gap-1.5 shrink-0"><span className="material-symbols-outlined !text-[12px]">{t("icon_calendar_today") || "calendar_today"}</span> {new Date(tmpl.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={!!selectedTemplateForPreview}
        onClose={() => setSelectedTemplateForPreview(null)}
        title={selectedTemplateForPreview?.name || selectedTemplateForPreview?.targetFile || t("preview_title") || "Template Preview"}
        subtitle={t("preview_subtitle") || "Visual configuration layout"}
        icon="visibility"
        iconColorClass="text-[var(--accent)]"
        isResizable={false}
        widthClass="w-[850px]"
        backdropZ="z-[45000]"
        panelZ="z-[45001]"
        noBackdropDim={true}
        actions={
            selectedTemplateForPreview ? (
                <>
                    <button onClick={() => setSelectedTemplateForPreview(null)} className={standardButtonClass}>
                        {t("shared_cancel") || "Cancel"}
                    </button>
                    {selectedTemplateForPreview.is_community_default ? (
                        <button disabled={true} className="px-8 py-4 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                            <span className="material-symbols-outlined !text-[18px]">{t("template_icon_verified") || "verified"}</span>
                            {t("active_default") || "Active Default"}</button>
                    ) : (
                        <button 
                            onClick={() => handleSetDefault(selectedTemplateForPreview)} 
                            disabled={isSettingDefault === selectedTemplateForPreview.id} 
                            className={standardSuccessButtonClass}
                        >
                            {isSettingDefault === selectedTemplateForPreview.id ? '' + (t("setting") || "Setting...") + '' : '' + (t("set_default") || "Set as Community Default") + ''}
                        </button>
                    )}
                </>
            ) : null
        }
      >
        {selectedTemplateForPreview && (
            <div className="flex flex-col h-full w-full overflow-hidden">
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar h-full">
                    
                    {selectedTemplateForPreview.is_community_default && (
                        <div className="px-4 py-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)] text-xs font-black uppercase tracking-widest flex items-center gap-3 shrink-0">
                            <span className="material-symbols-outlined !text-[18px]">{t("template_icon_verified") || "verified"}</span>
                            {t("active_default_msg") || "This is the active community default template"}
                        </div>
                    )}

                    <div className="flex-1 theme-glass-panel rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-black/10 p-6 overflow-y-auto custom-scrollbar min-h-[400px]">
                        <TemplatePreviewer templateData={selectedTemplateForPreview.parsedData} />
                    </div>
                </div>
            </div>
        )}
      </SidePanel>
    </div>
  );
}

