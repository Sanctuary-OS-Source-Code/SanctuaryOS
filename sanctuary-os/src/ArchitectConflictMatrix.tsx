import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, SidePanel, standardDangerButtonClass, standardAccentGlassButtonClass } from "./shared";
import { logArchitectAction } from "./lib/audit";

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

function CustomTierDropdown({ value, onChange }: { value: number, onChange: (val: number) => void }) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = [
    { id: 4, label: t("nexus_tier4") || "TIER 4", color: 'theme-text-danger', glow: 'theme-bg-danger', activeBg: 'bg-[var(--danger)]/10 border-[var(--danger)]/20' },
    { id: 3, label: t("nexus_tier3") || "TIER 3", color: 'theme-text-warning', glow: 'theme-bg-warning', activeBg: 'bg-[var(--warning)]/10 border-[var(--warning)]/20' },
  ];

  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className={`relative w-full shrink-0 ${isOpen ? 'z-[6000]' : ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-12 theme-glass-inner rounded-xl px-5 text-[11px] font-black uppercase tracking-widest focus:outline-none flex justify-between items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="transition-colors shrink-0 flex items-center justify-center text-[var(--subtext)] opacity-60"><span className="material-symbols-outlined !text-[20px]">{isOpen ? 'expand_less' : 'expand_more'}</span></span>
      </button>
      
      {isOpen && createPortal(
        (() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const spaceBelow = window.innerHeight - rect.bottom;
          const shouldDropUp = spaceBelow < 200;
          
          return (
            <>
              <div className="fixed inset-0 z-[50000]" onClick={() => setIsOpen(false)} />
              <div className="fixed theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] z-[50001] overflow-hidden max-h-60 overflow-y-auto custom-scrollbar flex flex-col animate-in fade-in slide-in-from-top-2" style={{
                top: shouldDropUp ? undefined : rect.bottom + 8,
                bottom: shouldDropUp ? window.innerHeight - rect.top + 8 : undefined,
                left: rect.left,
                width: rect.width,
              }}>
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { onChange(opt.id); setIsOpen(false); }}
                    className={`w-full text-left px-5 py-4 transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center gap-3 ${value === opt.id ? opt.activeBg + ' ' + opt.color : 'text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-70 hover:opacity-100'}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${opt.glow} ${value === opt.id ? 'animate-pulse' : ''}`} />
                    <span className="text-[11px] font-black uppercase tracking-widest">{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          );
        })(),
        document.body
      )}
    </div>
  );
}

export default function ArchitectConflictMatrix({ modList }: { modList?: any[] }) {
  const { t } = useLexicon();
  const [ghosts, setGhosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modA, setModA] = useState<any | null>(null);
  const [modB, setModB] = useState<any | null>(null);
  const [severity, setSeverity] = useState(4);
  const [note, setNote] = useState("");
  const [allMods, setAllMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [editConflictId, setEditConflictId] = useState<string | null>(null);

  // Deletion specific
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmingApprove, setConfirmingApprove] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);

  const fetchMods = async () => {
    const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url').order('name'));
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
    if (editConflictId) {
      const { error } = await supabase.from('logical_conflicts').update({ mod_a_id: modA.id, mod_b_id: modB.id, severity_rank: severity, resolution_note: note, status: 'approved' }).eq('id', editConflictId);
      if (!error) { 
          logArchitectAction("Updated Global Conflict Rule", "logical_conflicts", editConflictId);
          setModA(null); setModB(null); setNote(""); setIsSidePanelOpen(false); setEditConflictId(null); fetchGhosts(); 
      }
    } else {
      const { error } = await supabase.from('logical_conflicts').insert([{ mod_a_id: modA.id, mod_b_id: modB.id, severity_rank: severity, resolution_note: note, status: 'approved' }]);
      if (!error) { 
          logArchitectAction("Created Global Conflict Rule", "logical_conflicts", "T"+severity);
          setModA(null); setModB(null); setNote(""); setIsSidePanelOpen(false); fetchGhosts(); 
      }
    }
  };

  const handleEditConflict = (g: any) => {
    const m1 = g.mod_a_id ? allMods.find(m => m.id === g.mod_a_id) : { name: g.mod_a, id: g.mod_a_id };
    const m2 = g.mod_b_id ? allMods.find(m => m.id === g.mod_b_id) : { name: g.mod_b, id: g.mod_b_id };
    setModA(m1 || null);
    setModB(m2 || null);
    setSeverity(g.severity_rank || 4);
    setNote(g.resolution_note || "");
    setEditConflictId(g.id);
    setIsDeleting(false);
    setDeleteReason("");
    setIsSidePanelOpen(true);
  };

  const handleApproveGhost = async (id: string) => {
    const { error } = await supabase.from('logical_conflicts').update({ status: 'approved' }).eq('id', id);
    if (!error) {
        logArchitectAction("Approved Pending Conflict Rule", "logical_conflicts", id);
        fetchGhosts();
    }
  };

  const handleDeleteGhost = async (id: string, reason?: string) => {
    const { error } = await supabase.from('logical_conflicts').delete().eq('id', id);
    if (!error) {
        if(reason) logArchitectAction(`Deleted Global Conflict Rule - Reason: ${reason}`, "logical_conflicts", id);
        else logArchitectAction("Deleted Pending Conflict Rule", "logical_conflicts", id);
        fetchGhosts();
    }
  };

  const handleConfirmSidePanelDelete = async () => {
      if (!editConflictId || !deleteReason.trim()) return;
      await handleDeleteGhost(editConflictId, deleteReason);
      setIsSidePanelOpen(false);
      setEditConflictId(null);
  };

  const pendingGhosts = ghosts.filter(g => g.status === 'pending');
  const activeGhosts = ghosts.filter(g => g.status !== 'pending');

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden text-[var(--text)]">
      
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_security") || "security"}</span>
          </div>
          <span className="truncate">{t("hub_ql_conflict") || "CONFLICT MATRIX"}</span>
        </h2>


        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
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
                S{tLevel}
              </button>
            ))}
          </div>
          <button onClick={() => { setEditConflictId(null); setModA(null); setModB(null); setNote(""); setSeverity(4); setIsSidePanelOpen(true); }} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group">
            <span className="material-symbols-outlined !text-[16px] group-hover:rotate-90 transition-transform duration-500">{t("ui_icon_add") || "add"}</span> {t("nexus_forge_title") || "CREATE DIRECTIVE"}
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar p-6 pb-32 transition-all duration-500">
        {pendingGhosts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg theme-glass-panel border border-[var(--warning)]/30 flex items-center justify-center shadow-md shrink-0 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse shadow-[0_0_10px_rgba(var(--warning-rgb),0.5)]"></span>
              </div>
              <h4 className="text-sm font-black text-[var(--warning)] uppercase tracking-widest drop-shadow-md">
                {t("matrix_pending_queue") || "Pending Architect Approval"} ({pendingGhosts.length})
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {pendingGhosts.map(g => {
                const nameA = g.mod_a_id ? allMods.find(m => m.id === g.mod_a_id)?.name || g.mod_a : g.mod_a;
                const nameB = g.mod_b_id ? allMods.find(m => m.id === g.mod_b_id)?.name || g.mod_b : g.mod_b;
                return { ...g, nameA, nameB };
              }).filter(g => 
                (tierFilter === null || g.severity_rank === tierFilter) &&
                ( (g.nameA || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                  (g.nameB || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (g.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase()) )
              ).map((g) => {
                const tierColor = g.severity_rank === 4 ? 'text-[var(--danger)]' : g.severity_rank === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]';
                const glowC = g.severity_rank === 4 ? 'bg-[var(--danger)]/10 group-hover:bg-[var(--danger)]/20' : g.severity_rank === 3 ? 'bg-[var(--warning)]/10 group-hover:bg-[var(--warning)]/20' : 'bg-[var(--accent)]/10 group-hover:bg-[var(--accent)]/20';
                const borderHover = g.severity_rank === 4 ? 'hover:border-[var(--danger)]/30' : g.severity_rank === 3 ? 'hover:border-[var(--warning)]/30' : 'hover:border-[var(--accent)]/30';
                return (
                <div key={g.id} onClick={() => handleEditConflict(g)} className={`theme-glass-panel p-5 rounded-[2rem] flex flex-col gap-4 group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl hover:-translate-y-1 ${borderHover} transition-all duration-500 overflow-hidden relative`}>
                  
                  {/* Ambient Glows */}
                  <div className={`absolute top-0 right-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />
                  <div className={`absolute bottom-0 left-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />

                  {/* Header */}
                  <div className="flex justify-between items-center z-10">
                     <div className="flex items-center gap-2">
                       <div className={`w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center animate-pulse`}>
                         <span className="material-symbols-outlined !text-[10px] text-orange-400">hourglass_empty</span>
                       </div>
                       <span className="text-[9px] font-black uppercase tracking-widest text-orange-400 opacity-90">{t("matrix_pending_queue") || "Pending Architect Approval"}</span>
                     </div>
                     <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest backdrop-blur-md shadow-sm border ${g.severity_rank === 4 ? 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20' : 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20'}`}>S{g.severity_rank}</span>
                  </div>
                
                  <div className="flex flex-col gap-3 relative z-10">
                    {/* Mod A */}
                    <div className="p-4 rounded-2xl bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500">
                       <span className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          <span className="material-symbols-outlined !text-[12px]">inventory_2</span> {t("matrix_label_mod_a") || "BASE MOD"}
                       </span>
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameA}</span>
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
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameB}</span>
                    </div>
                  </div>
                
                  {/* Footer Actions */}
                  <div className="pt-2 flex gap-2 relative z-10 border-t border-white/5 mt-auto">
                     {confirmingApprove === g.id ? (
                        <button onClick={(e) => { e.stopPropagation(); handleApproveGhost(g.id); setConfirmingApprove(null); }} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--success)] bg-[var(--success)]/20 border border-[var(--success)]/50 hover:bg-[var(--success)]/30 backdrop-blur-md transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.3)] uppercase tracking-widest flex items-center justify-center gap-2 animate-in fade-in zoom-in duration-300">
                          {t("ui_confirm_approve") || "CONFIRM APPROVE"}
                        </button>
                     ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmingApprove(g.id); setConfirmingReject(null); }} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--success)] border border-[var(--success)]/30 bg-[var(--success)]/10 hover:bg-[var(--success)]/20 hover:border-[var(--success)]/50 backdrop-blur-md transition-all shadow-sm uppercase tracking-widest flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">check</span> {t("matrix_btn_approve") || "APPROVE"}
                        </button>
                     )}
                     
                     {confirmingReject === g.id ? (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteGhost(g.id); setConfirmingReject(null); }} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--danger)] bg-[var(--danger)]/20 border border-[var(--danger)]/50 hover:bg-[var(--danger)]/30 backdrop-blur-md transition-all shadow-[0_0_20px_rgba(var(--danger-rgb),0.3)] uppercase tracking-widest flex items-center justify-center gap-2 animate-in fade-in zoom-in duration-300">
                          {t("ui_confirm_reject") || "CONFIRM REJECT"}
                        </button>
                     ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmingReject(g.id); setConfirmingApprove(null); }} className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/50 backdrop-blur-md transition-all shadow-sm uppercase tracking-widest flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">close</span> {t("matrix_btn_reject") || "REJECT"}
                        </button>
                     )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-3 mb-4 mt-2">
            <div className="w-8 h-8 rounded-lg theme-glass-panel border border-[color-mix(in_srgb,var(--text)_30%,transparent)] flex items-center justify-center shadow-md shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] opacity-70">account_tree</span>
            </div>
            <h4 className="text-sm font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest drop-shadow-md">
              {t("active_network_directives")}
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {loading ? (
              <div className="col-span-full p-12 text-center">
                <span className="theme-text-accent font-black uppercase tracking-widest text-xs animate-pulse">{t("nexus_syncing")}</span>
              </div>
            ) : (
              activeGhosts.map(g => {
                const nameA = g.mod_a_id ? allMods.find(m => m.id === g.mod_a_id)?.name || g.mod_a : g.mod_a;
                const nameB = g.mod_b_id ? allMods.find(m => m.id === g.mod_b_id)?.name || g.mod_b : g.mod_b;
                return { ...g, nameA, nameB };
              }).filter(g => 
                (tierFilter === null || g.severity_rank === tierFilter) &&
                ( (g.nameA || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                  (g.nameB || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (g.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase()) )
              ).map((g) => {
                const tierColor = g.severity_rank === 4 ? 'text-[var(--danger)]' : g.severity_rank === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]';
                const glowC = g.severity_rank === 4 ? 'bg-[var(--danger)]/10 group-hover:bg-[var(--danger)]/20' : g.severity_rank === 3 ? 'bg-[var(--warning)]/10 group-hover:bg-[var(--warning)]/20' : 'bg-[var(--accent)]/10 group-hover:bg-[var(--accent)]/20';
                const borderHover = g.severity_rank === 4 ? 'hover:border-[var(--danger)]/30' : g.severity_rank === 3 ? 'hover:border-[var(--warning)]/30' : 'hover:border-[var(--accent)]/30';
                return (
                <div key={g.id} onClick={() => handleEditConflict(g)} className={`theme-glass-panel p-5 rounded-[2rem] flex flex-col gap-4 group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl hover:-translate-y-1 ${borderHover} transition-all duration-500 overflow-hidden relative`}>
                  
                  {/* Ambient Glows */}
                  <div className={`absolute top-0 right-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />
                  <div className={`absolute bottom-0 left-0 w-48 h-48 blur-[50px] pointer-events-none mix-blend-screen transition-all duration-700 ${glowC}`} />

                  {/* Header */}
                  <div className="flex justify-between items-center z-10">
                     <div className="flex items-center gap-2">
                       <span className="material-symbols-outlined !text-[12px] opacity-50">gavel</span>
                       <span className="text-[9px] font-black uppercase tracking-widest opacity-50">{t("active_network_directives") || "Active Directive"}</span>
                     </div>
                     <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest backdrop-blur-md shadow-sm border ${g.severity_rank === 4 ? 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20' : 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20'}`}>S{g.severity_rank}</span>
                  </div>
                
                  <div className="flex flex-col gap-3 relative z-10">
                    {/* Mod A */}
                    <div className="p-4 rounded-2xl bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500">
                       <span className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          <span className="material-symbols-outlined !text-[12px]">inventory_2</span> {t("matrix_label_mod_a") || "BASE MOD"}
                       </span>
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameA}</span>
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
                       <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameB}</span>
                    </div>
                  </div>
                
                  {/* Footer */}
                  <div className="pt-2 flex gap-2 relative z-10 border-t border-white/5 mt-auto">
                     <button className="flex-1 h-9 rounded-xl text-[10px] font-black text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/50 backdrop-blur-md transition-all shadow-sm uppercase tracking-widest flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined !text-[14px]">visibility</span> {t("matrix_btn_view") || "VIEW DIRECTIVE"}
                     </button>
                  </div>
                </div>
              );
              })
            )}
          </div>
        </div>
      </div>

      {(() => {
        const editingGhost = ghosts.find(g => g.id === editConflictId);
        
        return (
          <SidePanel
            isOpen={isSidePanelOpen}
            onClose={() => setIsSidePanelOpen(false)}
            title={editConflictId ? (t("nexus_edit_side_panel") || "EDIT DIRECTIVE") : (t("nexus_forge_title") || "FORGE NEW DIRECTIVE")}
            icon="security"
            footer={
               editConflictId && !isDeleting ? (
                  <div className="flex justify-end gap-4 w-full">
                      <button type="button" onClick={() => setIsDeleting(true)} className={standardDangerButtonClass}>
                          {t("nexus_purge") || "DELETE"}
                      </button>
                  </div>
               ) : null
            }
            noPadding={true}
            noScroll={true}
            ambientGlows={
              <>
                <div className={`absolute -top-20 -right-20 w-96 h-96 rounded-full blur-[100px] pointer-events-none dark:mix-blend-screen transition-all duration-700 ${severity === 4 ? 'bg-[var(--danger)]/20' : severity === 3 ? 'bg-[var(--warning)]/20' : 'bg-[var(--accent)]/20'}`} />
                <div className={`absolute -bottom-20 -left-20 w-96 h-96 rounded-full blur-[100px] pointer-events-none dark:mix-blend-screen transition-all duration-700 ${severity === 4 ? 'bg-[var(--danger)]/20' : severity === 3 ? 'bg-[var(--warning)]/20' : 'bg-[var(--accent)]/20'}`} />
              </>
            }
          >
            <div className="flex flex-col h-full overflow-hidden relative">

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32 relative z-10">
                
                <form onSubmit={handleAddGhost} className="flex flex-col gap-8 relative z-10">
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
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-2 ${severity === 4 ? 'text-[var(--danger)]' : severity === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}><span className="material-symbols-outlined !text-[14px]">inventory_2</span> {t("nexus_enemy_a") || "ENEMY A"}</label>
                  <ModSearchDropdown placeholder={t("nexus_enemy_a")} modList={allMods} selectedItem={modA} onSelect={setModA} onClear={() => setModA(null)} />
                </div>
                
                <div className="relative h-px w-full flex items-center justify-center z-20 -my-4">
                  <div className="w-8 h-8 rounded-full theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg flex items-center justify-center bg-[var(--bg)] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="text-[9px] font-black text-[var(--subtext)] italic uppercase">VS</span>
                  </div>
                </div>

                <div className="w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner flex flex-col relative transition-colors duration-500 gap-3">
                  <label className={`text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-2 ${severity === 4 ? 'text-[var(--danger)]' : severity === 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}><span className="material-symbols-outlined !text-[14px]">error</span> {t("nexus_enemy_b") || "ENEMY B"}</label>
                  <ModSearchDropdown placeholder={t("nexus_enemy_b")} modList={allMods} selectedItem={modB} onSelect={setModB} onClear={() => setModB(null)} />
                </div>
              </div>
              
              <div className="flex flex-col gap-3 w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner relative z-50 transition-all hover:border-white/20">
                <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-1">{t("nexus_label_severity")}</label>
                <div className="flex flex-col gap-2 relative z-50">
                    <CustomTierDropdown value={severity} onChange={setSeverity} />
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full p-5 rounded-[2rem] bg-black/10 dark:bg-white/5 border border-white/10 shadow-inner relative z-10 transition-all hover:border-white/20">
                <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest ml-1 flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">{t("ui_icon_edit_note") || "edit_note"}</span> {t("nexus_resolution") || "RESOLUTION DIRECTIVE"}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("nexus_resolution")} className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-white/5 hover:theme-border-accent resize-none custom-scrollbar shadow-inner" />
              </div>

              <div className="flex flex-col gap-4 pt-6 mt-2 border-t border-white/10">
                {isDeleting ? (
                    <div className="flex flex-col gap-4 p-5 bg-[var(--danger)]/10 rounded-3xl border border-[var(--danger)]/30 backdrop-blur-md shadow-[0_0_20px_rgba(var(--danger-rgb),0.2)] animate-in slide-in-from-bottom-2">
                      <span className="text-sm font-black text-[var(--danger)] uppercase tracking-widest text-center">{t("ui_confirm_delete") || "ARE YOU SURE?"}</span>
                      <input 
                         value={deleteReason} 
                         onChange={e => setDeleteReason(e.target.value)} 
                         placeholder={t("matrix_delete_reason_ph") || "Enter mandatory reason for deletion..."}
                         className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[var(--danger)]/50 transition-all text-[var(--text)] placeholder:opacity-40 border border-[var(--danger)]/20"
                      />
                      <div className="flex gap-3">
                        <button type="button" disabled={!deleteReason.trim()} onClick={handleConfirmSidePanelDelete} className="flex-1 py-3 bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/50 rounded-xl uppercase font-black text-[10px] tracking-widest hover:bg-[var(--danger)] hover:text-white transition-all disabled:opacity-50 disabled:pointer-events-none">{t("matrix_btn_confirm_delete") || "CONFIRM DELETE"}</button>
                        <button type="button" onClick={() => { setIsDeleting(false); setDeleteReason(""); }} className="flex-1 py-3 bg-white/5 text-[var(--text)] rounded-xl uppercase font-black text-[10px] tracking-widest border border-white/10 hover:bg-white/10 transition-all">{t("ui_btn_cancel") || "CANCEL"}</button>
                      </div>
                    </div>
                ) : (
                    <button type="submit" disabled={!modA || !modB} className={standardAccentGlassButtonClass + " !w-full disabled:bg-transparent"}>
                      <span className="material-symbols-outlined !text-[16px]">{editConflictId ? "save" : "add"}</span>
                      {editConflictId ? (t("architect_update_conflict") || "SAVE DIRECTIVE") : (t("nexus_inject") || "INJECT DIRECTIVE INTO CLOUD")}
                    </button>
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
