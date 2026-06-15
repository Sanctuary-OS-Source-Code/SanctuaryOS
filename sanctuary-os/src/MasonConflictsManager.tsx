import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, SidePanel, standardDangerButtonClass, standardAccentGlassButtonClass, standardButtonClass } from "./shared";

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

export default function MasonConflictsManager({ masonId }: { masonId: string }) {
  const { t } = useLexicon();
  const [ghosts, setGhosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [activeMaster, setActiveMaster] = useState<any | null>(null);
  const [conflictEnemy, setConflictEnemy] = useState<any | null>(null);
  const [conflictSeverity, setConflictSeverity] = useState(4);
  const [conflictResolution, setConflictResolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editConflictId, setEditConflictId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const [cloudMods, setCloudMods] = useState<any[]>([]);
  const [myMods, setMyMods] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    // Fetch all mods for dropdowns
    const { data: modsData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, mason_id').order('name'));
    if (modsData) {
      setCloudMods(modsData);
      setMyMods(modsData.filter(m => m.mason_id === masonId));
    }

    // Fetch conflicts involving myMods
    const { data: conflictsData, error } = await supabase.from('logical_conflicts').select(`
      *,
      mod_a:mods!logical_conflicts_mod_a_id_fkey(id, name, mason_id),
      mod_b:mods!logical_conflicts_mod_b_id_fkey(id, name, mason_id)
    `).order('status', { ascending: false }).order('created_at', { ascending: false });
    
    if (!error && conflictsData) {
        // Only keep conflicts where at least one mod belongs to this mason
        const myConflicts = conflictsData.filter(c => 
            (c.mod_a && c.mod_a.mason_id === masonId) || 
            (c.mod_b && c.mod_b.mason_id === masonId)
        );
        setGhosts(myConflicts);
    }
    setLoading(false);
  };

  useEffect(() => { 
    if (masonId) fetchData(); 
  }, [masonId]);

  const handleAddConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMaster || !conflictEnemy) return;
    setIsSubmitting(true);
    
    if (editConflictId) {
      await supabase.from('logical_conflicts').update({ 
        mod_a_id: activeMaster.id, 
        mod_b_id: conflictEnemy.id, 
        severity_rank: conflictSeverity, 
        resolution_note: conflictResolution,
        status: 'pending' // Any edit by mason requires review
      }).eq('id', editConflictId);
    } else {
      await supabase.from('logical_conflicts').insert([{ 
        mod_a_id: activeMaster.id, 
        mod_b_id: conflictEnemy.id, 
        severity_rank: conflictSeverity, 
        resolution_note: conflictResolution,
        status: 'pending' // New entries by mason start pending
      }]);
    }
    
    setConflictEnemy(null); setConflictResolution(""); setConflictSeverity(4); setActiveMaster(myMods[0] || null); setEditConflictId(null);
    setIsSidePanelOpen(false);
    await fetchData();
    setIsSubmitting(false);
  };

  const handleEditConflict = (c: any) => {
    // If we are editing, determine which is "our" mod
    let myMod = c.mod_a;
    let enemyMod = c.mod_b;

    if (c.mod_b && c.mod_b.mason_id === masonId) {
        myMod = c.mod_b;
        enemyMod = c.mod_a;
    }

    setActiveMaster(myMod || null);
    setConflictEnemy(enemyMod || null);
    setConflictSeverity(c.severity_rank || 4);
    setConflictResolution(c.resolution_note || "");
    setEditConflictId(c.id);
    setDeleteConfirmId(null);
    setIsSidePanelOpen(true);
  };

  const handleDeleteConflict = async (id: string) => {
    const { error } = await supabase.from('logical_conflicts').delete().eq('id', id);
    if (!error) {
      if(deleteReason.trim()) {
         const { data: { user } } = await supabase.auth.getUser();
         if(user) {
           await supabase.from('audit_logs').insert({ action: `Deleted Conflict Rule - Reason: ${deleteReason}`, target_table: 'logical_conflicts', target_name: id, actor_id: user.id, reason: "Automated from Mason Hub" });
         }
      }
      setDeleteConfirmId(null);
      setDeleteReason("");
      setIsSidePanelOpen(false);
      fetchData();
    }
  };

  const filteredGhosts = ghosts.filter(c => {
    if (tierFilter !== null && c.severity_rank !== tierFilter) return false;
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const nameA = c.mod_a?.name || c.mod_a || "";
    const nameB = c.mod_b?.name || c.mod_b || "";
    return nameA.toLowerCase().includes(search) || nameB.toLowerCase().includes(search) || (c.resolution_note || "").toLowerCase().includes(search);
  });

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_security") || "security"}</span>
          </div>
          <span className="truncate">{t("masonhub_title_conflicts")?.replace("⚔️ ", "") || "Conflict Matrix"}</span>
        </h2>
        <div className="flex-1 flex justify-end gap-4 items-center">
          <div className="relative w-64 h-12 shrink-0">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("ui_icon_search") || "search"}</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("ui_placeholder_search") || "Search matrix..."}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("ui_icon_close") || "close"}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 shadow-inner h-12 shrink-0 hidden md:flex">
            <button onClick={() => setTierFilter(null)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tierFilter === null ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}>ALL</button>
            {[4, 3].map(tLevel => (
              <button key={tLevel} onClick={() => setTierFilter(tLevel)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tierFilter === tLevel ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}>
                T{tLevel}
              </button>
            ))}
          </div>
          <button onClick={() => { setEditConflictId(null); setActiveMaster(myMods[0] || null); setConflictEnemy(null); setConflictResolution(""); setConflictSeverity(4); setIsSidePanelOpen(true); }} className={standardAccentGlassButtonClass + " !h-12 !py-0 shrink-0 px-6"}>
            <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_add") || "add"}</span> {t("ui_btn_create")}
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar p-6 pb-32 transition-all duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
          {loading ? (
            <div className="col-span-full py-12 flex items-center justify-center theme-text-accent font-black tracking-widest text-xs uppercase animate-pulse">{t("hub_loading")}</div>
          ) : filteredGhosts.length === 0 ? (
             <div className="col-span-full py-12 flex flex-col items-center justify-center opacity-30 gap-4">
              <span className="text-4xl grayscale">👻</span>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text)]">{t("masonhub_no_conflicts")}</span>
            </div>
          ) : (
            filteredGhosts.map(c => {
              const nameA = c.mod_a?.name || c.mod_a || "UNKNOWN";
              const nameB = c.mod_b?.name || c.mod_b || "UNKNOWN";
              const isPending = c.status === 'pending';

              const tierColor = c.severity_rank === 4 ? 'text-[var(--danger)]' : c.severity_rank === 3 ? 'text-[var(--warning)]' : c.severity_rank === 2 ? 'text-[var(--accent)]' : 'text-white/50';
              const glowC = c.severity_rank === 4 ? 'bg-[var(--danger)]/10 group-hover:bg-[var(--danger)]/20' : c.severity_rank === 3 ? 'bg-[var(--warning)]/10 group-hover:bg-[var(--warning)]/20' : c.severity_rank === 2 ? 'bg-[var(--accent)]/10 group-hover:bg-[var(--accent)]/20' : 'bg-white/5 group-hover:bg-white/10';
              const borderHover = c.severity_rank === 4 ? 'hover:border-[var(--danger)]/30' : c.severity_rank === 3 ? 'hover:border-[var(--warning)]/30' : c.severity_rank === 2 ? 'hover:border-[var(--accent)]/30' : 'hover:border-white/10';

              return (
                <div key={c.id} onClick={() => handleEditConflict(c)} className={`theme-glass-panel p-5 rounded-[2rem] flex flex-col gap-4 group cursor-pointer border hover:-translate-y-1 transition-all duration-500 overflow-hidden relative ${isPending ? 'border-orange-500/20 hover:border-orange-500/50 hover:shadow-[0_0_30px_rgba(249,115,22,0.15)]' : `border-white/5 hover:shadow-2xl ${borderHover}`}`}>
                  
                  {/* Ambient Glows */}
                  <div className={`absolute top-0 right-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />
                  <div className={`absolute bottom-0 left-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />

                  {/* Header */}
                  <div className="flex justify-between items-center z-10">
                     <div className="flex items-center gap-2">
                       {isPending ? (
                         <>
                           <div className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center animate-pulse">
                             <span className="material-symbols-outlined !text-[10px] text-orange-400">hourglass_empty</span>
                           </div>
                           <span className="text-[9px] font-black uppercase tracking-widest text-orange-400 opacity-90">{t("hub_pending") || "PENDING"}</span>
                         </>
                       ) : (
                         <>
                           <span className="material-symbols-outlined !text-[12px] opacity-50">gavel</span>
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-50">{t("active_network_directives") || "ACTIVE DIRECTIVE"}</span>
                         </>
                       )}
                     </div>
                     <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest backdrop-blur-md shadow-sm border ${c.severity_rank === 4 ? 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20' : 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20'}`}>T{c.severity_rank}</span>
                  </div>
                
                  <div className="flex flex-col gap-3 relative z-10">
                    {/* Mod A */}
                    <div className="p-4 rounded-2xl bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500">
                       <span className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          <span className="material-symbols-outlined !text-[12px]">inventory_2</span> {t("masonhub_my_mod") || "MY MOD"}
                       </span>
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{nameA}</span>
                    </div>
                  
                    {/* VS Divider */}
                    <div className="relative h-px w-full flex items-center justify-center z-20">
                       <div className="w-7 h-7 rounded-full theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg flex items-center justify-center bg-[var(--bg)] absolute">
                          <span className="text-[8px] font-black text-[var(--subtext)] italic uppercase">VS</span>
                       </div>
                    </div>
                  
                    {/* Mod B */}
                    <div className="p-4 rounded-2xl bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500">
                       <span className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          <span className="material-symbols-outlined !text-[12px]">error</span> {t("matrix_label_mod_b") || "CONFLICTING MOD"}
                       </span>
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{nameB}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {(() => {
        const editingGhost = ghosts.find(g => g.id === editConflictId);
        
        return (
          <SidePanel
            isOpen={isSidePanelOpen}
            onClose={() => setIsSidePanelOpen(false)}
            title={editConflictId ? t("nexus_edit_side_panel") || "Edit" : t("nexus_forge_title") || "Create"}
            icon="security"
            noPadding={true}
            noScroll={true}
            ambientGlows={
              <>
                <div className={`absolute -top-20 -right-20 w-96 h-96 rounded-full blur-[100px] pointer-events-none dark:mix-blend-screen transition-all duration-700 ${conflictSeverity === 4 ? 'bg-[var(--danger)]/20' : conflictSeverity === 3 ? 'bg-[var(--warning)]/20' : 'bg-[var(--accent)]/20'}`} />
                <div className={`absolute -bottom-20 -left-20 w-96 h-96 rounded-full blur-[100px] pointer-events-none dark:mix-blend-screen transition-all duration-700 ${conflictSeverity === 4 ? 'bg-[var(--danger)]/20' : conflictSeverity === 3 ? 'bg-[var(--warning)]/20' : 'bg-[var(--accent)]/20'}`} />
              </>
            }
          >
            <div className="flex flex-col h-full overflow-hidden relative">

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32 relative z-10">
                
                <form onSubmit={handleAddConflict} className="flex flex-col gap-8 relative z-10">
                  <div className="flex flex-col gap-6">
                    {editingGhost && (
                       <div className="flex flex-col gap-2 p-5 rounded-[2rem] theme-glass-panel border border-white/10 shadow-inner text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          <div className="flex justify-between items-center">
                             <span className="opacity-60">{t("nexus_date_created") || "DATE CREATED"}</span>
                             <span className="text-[var(--text)]">{new Date(editingGhost.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between items-center mt-2 border-t border-white/5 pt-3">
                             <span className="opacity-60">{t("nexus_source") || "SOURCE"}</span>
                             <span className="text-[var(--accent)]">{editingGhost.author_id ? (t("nexus_source_architect") || "ARCHITECT") : (t("nexus_source_system") || "SANCTUARY NETWORK")}</span>
                          </div>
                       </div>
                    )}
                    
                <div className="w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500 gap-3">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-2 ${conflictSeverity === 4 ? 'text-[var(--danger)]' : conflictSeverity === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}><span className="material-symbols-outlined !text-[14px]">inventory_2</span> {t("masonhub_my_mod")}</label>
                  <ModSearchDropdown placeholder={t("registry_select_master")} modList={myMods} selectedItem={activeMaster} onSelect={(m: any) => setActiveMaster(m)} onClear={() => setActiveMaster(null)} />
                </div>
                
                <div className="relative h-px w-full flex items-center justify-center z-20 -my-4">
                  <div className="w-8 h-8 rounded-full theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg flex items-center justify-center bg-[var(--bg)] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="text-[9px] font-black text-[var(--subtext)] italic uppercase">VS</span>
                  </div>
                </div>

                <div className="w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500 gap-3">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-2 ${conflictSeverity === 4 ? 'text-[var(--danger)]' : conflictSeverity === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}><span className="material-symbols-outlined !text-[14px]">error</span> {t("masonhub_conflicting_mod")}</label>
                  <ModSearchDropdown placeholder={t("mason_enemy_placeholder")} modList={cloudMods} selectedItem={conflictEnemy} onSelect={(m: any) => setConflictEnemy(m)} onClear={() => setConflictEnemy(null)} />
                </div>
              </div>
              
              <div className="flex flex-col gap-3 w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner relative z-50 transition-all hover:border-white/20">
                <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-1">{t("nexus_label_severity")}</label>
                <div className="flex flex-col gap-2 relative z-50">
                    <CustomTierDropdown value={conflictSeverity} onChange={(val: number) => setConflictSeverity(val)} />
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner relative z-10 transition-all hover:border-white/20">
                <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-1 flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_edit_note") || "edit_note"}</span> {t("nexus_label_notes")}</label>
                <textarea value={conflictResolution} onChange={(e) => setConflictResolution(e.target.value)} placeholder={t("masonhub_resolution_placeholder")} className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent resize-none custom-scrollbar shadow-inner" />
              </div>

              <div className="flex flex-col gap-4 pt-6 mt-2 border-t border-white/10">
                {deleteConfirmId === editConflictId && editConflictId ? (
                   <div className="flex flex-col gap-4 p-5 bg-[var(--danger)]/10 rounded-2xl border border-[var(--danger)]/30 backdrop-blur-md shadow-[0_0_20px_rgba(var(--danger-rgb),0.2)] animate-in slide-in-from-bottom-2">
                     <span className="text-sm font-black text-[var(--danger)] uppercase tracking-widest text-center">{t("ui_confirm_delete") || "ARE YOU SURE?"}</span>
                     <input 
                         type="text" 
                         value={deleteReason} 
                         onChange={e => setDeleteReason(e.target.value)} 
                         placeholder={t("matrix_delete_reason_ph") || "Enter mandatory reason for deletion..."}
                         className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[var(--danger)]/50 transition-all text-[var(--text)] border border-[var(--danger)]/30 placeholder:opacity-40"
                     />
                     <div className="flex gap-3">
                       <button type="button" disabled={!deleteReason.trim()} onClick={() => handleDeleteConflict(editConflictId)} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--danger)] bg-[var(--danger)]/20 border border-[var(--danger)]/50 hover:bg-[var(--danger)]/30 backdrop-blur-md transition-all shadow-[0_0_20px_rgba(var(--danger-rgb),0.3)] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">{t("ui_btn_delete") || "DELETE"}</button>
                       <button type="button" onClick={() => { setDeleteConfirmId(null); setDeleteReason(""); }} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--text)] bg-white/5 border border-white/10 hover:bg-white/10 backdrop-blur-md transition-all shadow-sm uppercase tracking-widest flex items-center justify-center gap-2">{t("ui_btn_cancel") || "CANCEL"}</button>
                     </div>
                   </div>
                ) : (
                  <>
                    <button type="submit" disabled={isSubmitting || !activeMaster || !conflictEnemy} className={standardAccentGlassButtonClass + " !w-full disabled:bg-transparent"}>
                      <span className="material-symbols-outlined !text-[16px]">{editConflictId ? "save" : "add"}</span>
                      {isSubmitting ? "..." : (editConflictId ? t("masonhub_update_conflict") : t("masonhub_add_conflict"))}
                    </button>
                    
                    {editConflictId && (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setDeleteConfirmId(editConflictId)} className={standardDangerButtonClass + " flex-1"}>
                          <span className="material-symbols-outlined !text-[14px]">{t("ui_icon_delete") || "delete"}</span>
                          {t("ui_btn_delete") || "DELETE"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </SidePanel>
        );
      })()}
    </div>
  );
}

function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { id: 4, label: t("nexus_tier4") || "TIER 4", color: 'theme-text-danger', glow: 'theme-bg-danger' },
    { id: 3, label: t("nexus_tier3") || "TIER 3", color: 'theme-text-warning', glow: 'theme-bg-warning' },
  ];

  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className={`relative w-full shrink-0 ${isOpen ? 'z-[6000]' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full theme-glass-inner rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="text-[10px] opacity-50 text-[var(--text)]">-</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full theme-glass-panel backdrop-blur-3xl bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] border border-white/20 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] z-[6000] max-h-60 overflow-y-auto custom-scrollbar flex flex-col p-2 animate-in fade-in slide-in-from-top-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setIsOpen(false); }}
              className={`text-left px-4 py-3 rounded-lg text-sm font-black uppercase tracking-widest transition-all flex items-center gap-3 ${value === opt.id ? 'bg-white/10 shadow-sm ' + opt.color : 'text-[var(--text)] hover:bg-white/5 opacity-70 hover:opacity-100'}`}
            >
              <div className={`w-2 h-2 rounded-full ${opt.glow} ${value === opt.id ? 'animate-pulse' : ''}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
