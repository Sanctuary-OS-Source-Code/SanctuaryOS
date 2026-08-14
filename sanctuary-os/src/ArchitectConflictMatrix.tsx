import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, SidePanel, standardDangerButtonClass, standardAccentGlassButtonClass, standardSuccessButtonClass, standardButtonClass, EmptyState, ActionButton, ScreenUtilityBar, FilterTabs, FilterTabButton } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
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
    { id: 4, label: t("tier4"), color: 'theme-text-danger', glow: 'theme-bg-danger', activeBg: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]' },
    { id: 3, label: t("tier3"), color: 'theme-text-warning', glow: 'theme-bg-warning', activeBg: 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]' },
  ];

  const selected = options.find(o => o.id === value) || options[0];

  return (
    <div className={`relative w-full shrink-0 ${isOpen ? 'z-[6000]' : ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-12 glass-surface rounded-xl px-5 text-[11px] font-black capitalize tracking-widest focus:outline-none flex justify-start items-center transition-all ${selected.color}`}
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
       <div className="fixed glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl shadow-md z-[50001] max-h-60 overflow-y-auto custom-scrollbar flex flex-col animate-in fade-in slide-in-from-top-2" style={{
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
                    <span className="text-[11px] font-black capitalize tracking-widest">{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          );
        })(), document.body
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
  const [filterTab, setFilterTab] = useState<'pending' | 'completed'>('pending');
  const [visibleCount, setVisibleCount] = useState(100);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [editConflictId, setEditConflictId] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmingApprove, setConfirmingApprove] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [updateReason, setUpdateReason] = useState("");

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

  useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab, tierFilter]);

  const handleAddGhost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!modA || !modB) return;
    if (editConflictId) {
      if (!updateReason.trim()) return;
      const { error } = await supabase.from('logical_conflicts').update({ mod_a_id: modA.id, mod_b_id: modB.id, severity_rank: severity, resolution_note: note, status: 'approved' }).eq('id', editConflictId);
      if (!error) {
        logArchitectAction("Updated Global Conflict Rule", "logical_conflicts", editConflictId, updateReason);
        setModA(null); setModB(null); setNote(""); setIsSidePanelOpen(false); setEditConflictId(null); setUpdateReason(""); fetchGhosts();
      }
    } else {
      const { error } = await supabase.from('logical_conflicts').insert([{ mod_a_id: modA.id, mod_b_id: modB.id, severity_rank: severity, resolution_note: note, status: 'approved' }]);
      if (!error) {
        logArchitectAction("Created Global Conflict Rule", "logical_conflicts", "T" + severity);
        setModA(null); setModB(null); setNote(""); setIsSidePanelOpen(false); setUpdateReason(""); fetchGhosts();
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
    setUpdateReason("");
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
      if (reason) logArchitectAction("Deleted Global Conflict Rule", "logical_conflicts", id, reason);
      else logArchitectAction("Deleted Pending Conflict Rule", "logical_conflicts", id);
      fetchGhosts();
    }
  };

  const handleConfirmSidePanelDelete = async () => {
    if (!editConflictId) return;
    await handleDeleteGhost(editConflictId, deleteReason);
    setIsSidePanelOpen(false);
    setEditConflictId(null);
  };

  const handleConfirmSidePanelApprove = async () => {
    if (!editConflictId) return;
    await handleApproveGhost(editConflictId);
    setIsSidePanelOpen(false);
    setEditConflictId(null);
  };

  const pendingGhosts = ghosts.filter(g => g.status === 'pending');
  const activeGhosts = ghosts.filter(g => g.status !== 'pending');

  const filteredPendingGhosts = pendingGhosts.map(g => {
    const nameA = g.mod_a_id ? allMods.find(m => m.id === g.mod_a_id)?.name || g.mod_a : g.mod_a;
    const nameB = g.mod_b_id ? allMods.find(m => m.id === g.mod_b_id)?.name || g.mod_b : g.mod_b;
    return { ...g, nameA, nameB };
  }).filter(g =>
    (tierFilter === null || g.severity_rank === tierFilter) &&
    ((g.nameA || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.nameB || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredActiveGhosts = activeGhosts.map(g => {
    const nameA = g.mod_a_id ? allMods.find(m => m.id === g.mod_a_id)?.name || g.mod_a : g.mod_a;
    const nameB = g.mod_b_id ? allMods.find(m => m.id === g.mod_b_id)?.name || g.mod_b : g.mod_b;
    return { ...g, nameA, nameB };
  }).filter(g =>
    (tierFilter === null || g.severity_rank === tierFilter) &&
    ((g.nameA || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.nameB || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.resolution_note || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden text-[var(--text)]">

      <ScreenUtilityBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("ui_placeholder_search") as string}
        className="px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full"
      >
          <FilterTabs className="hidden md:flex mr-4">
            <FilterTabButton id="pending" activeTab={filterTab} setTab={setFilterTab} label={t("pending")} />
            <FilterTabButton id="completed" activeTab={filterTab} setTab={setFilterTab} label={t("status_active")} />
          </FilterTabs>
          <FilterTabs className="hidden md:flex">
            <FilterTabButton id={null} activeTab={tierFilter} setTab={setTierFilter} label={t("ql_all")} />
            {[4, 3].map(tLevel => (
              <FilterTabButton key={tLevel} id={tLevel} activeTab={tierFilter} setTab={setTierFilter} label={`${t("ui_icon_logo")}${tLevel}`} />
            ))}
          </FilterTabs>
          <ActionButton
            onClick={() => { setEditConflictId(null); setModA(null); setModB(null); setNote(""); setSeverity(4); setIsSidePanelOpen(true); }}
            className="h-12 px-6 shrink-0 font-black capitalize tracking-widest text-[10px]"
            icon={t("icon_add")}
            label={t("auto_create")}
          />
      </ScreenUtilityBar>

      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar p-6 pb-32 transition-all duration-500">
        {filterTab === 'pending' && (
          <div className="mb-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {filteredPendingGhosts.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : t("icon_verified_user")} title={searchTerm ? t("no_matches") : t("no_pending_conflicts")} className="col-span-full py-16" />
              ) : filteredPendingGhosts.slice(0, visibleCount).map((g) => {
                const tierColor = g.severity_rank == 4 ? 'text-[var(--danger)]' : g.severity_rank == 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]';
                return (
                  <div
                    key={g.id}
                    onClick={() => handleEditConflict(g)}
          className="glass-panel p-5 rounded-[var(--radius)] flex flex-col gap-4 group border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl transition-all duration-500 relative cursor-pointer"
                  >
                    <div className="absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 group-hover:opacity-40" />

                    {/* Header */}
                    <div className="flex justify-start items-start z-10 relative">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)]">hourglass_empty</span>
                        <span className="text-[10px] font-black capitalize tracking-widest opacity-80 text-[var(--subtext)]">{t("matrix_pending_queue")}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest backdrop-blur-md shadow-sm border ${g.severity_rank == 4 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>{t("ui_icon_logo")}{g.severity_rank}</span>
                    </div>

                    {/* A vs B Section */}
                    <div className="flex flex-col gap-2 relative z-10 w-full mt-2">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          {t("enemy_a")}
                        </span>
                        <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{g.nameA}</span>
                      </div>

                      <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
                          <span className="text-[7px] font-black italic capitalize">{t("vs")}</span>
                        </div>
                        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                          {t("enemy_b")}
                        </span>
                        <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{g.nameB}</span>
                      </div>
                    </div>

                    <div className="mt-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex justify-start items-center w-full relative z-10">
                      <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
                        <span className="material-symbols-outlined !text-[12px] normal-case">{t("icon_calendar_today")}</span>
                        {new Date(g.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[9px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0">
                        {t("btn_review")} <span className="text-lg leading-none">&rarr;</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredPendingGhosts.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more")} ({visibleCount} / {filteredPendingGhosts.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'completed' && (
          <div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {loading ? (
                <div className="col-span-full p-12 text-center">
                  <span className="theme-text-accent font-black capitalize tracking-widest text-xs animate-pulse">{t("syncing")}</span>
                </div>
              ) : (
                <>
                  {filteredActiveGhosts.length === 0 ? (
                    <EmptyState icon={searchTerm ? "search_off" : t("icon_check_circle")} title={searchTerm ? t("no_matches") : t("no_active_conflicts")} className="col-span-full py-16" />
                  ) : filteredActiveGhosts.slice(0, visibleCount).map((g) => {
                    const tierColor = g.severity_rank == 4 ? 'text-[var(--danger)]' : g.severity_rank == 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]';
                    const borderHover = g.severity_rank == 4 ? 'hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : g.severity_rank == 3 ? 'hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]' : 'hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]';
                    return (
           <div key={g.id} onClick={() => handleEditConflict(g)} className={`glass-panel p-5 rounded-[var(--radius)] flex flex-col gap-4 group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:shadow-2xl ${borderHover} transition-all duration-500 relative`}>

                        <div className="flex justify-start items-center z-10">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined !text-[12px] opacity-50">{t("icon_gavel")}</span>
                            <span className="text-[9px] font-black capitalize tracking-widest opacity-50">{t("active_network_directives")}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest backdrop-blur-md shadow-sm border ${g.severity_rank == 4 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>{t("ui_icon_logo")}{g.severity_rank}</span>
                        </div>

                        <div className="flex flex-col gap-2 relative z-10 w-full mt-2">
                          <div className="flex flex-col gap-1">
                            <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                              {t("enemy_a")}
                            </span>
                            <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{g.nameA}</span>
                          </div>

                          <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
                              <span className="text-[7px] font-black italic capitalize">{t("vs")}</span>
                            </div>
                            <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${tierColor}`}>
                              {t("enemy_b")}
                            </span>
                            <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight drop-shadow-md">{g.nameB}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            {!loading && filteredActiveGhosts.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more")} ({visibleCount} / {filteredActiveGhosts.length})
              </button>
            )}
          </div>
        )}
      </div>

      {(() => {
        const editingGhost = ghosts.find(g => g.id === editConflictId);

        return (
          <SidePanel
            isOpen={isSidePanelOpen}
            onClose={() => setIsSidePanelOpen(false)}
            title={editConflictId ? (t("edit_side_panel")) : (t("forge_title"))}
            icon="security"
            footer={
              <div className="flex flex-col gap-4 w-full">
                {isDeleting ? (
                  <div className="flex flex-col gap-4 p-5 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] backdrop-blur-md shadow-[0_0_20px_rgba(var(--danger-rgb),0.2)] animate-in slide-in-from-bottom-2">
                    <span className="text-sm font-black text-[var(--danger)] capitalize tracking-widest text-center">{t("ui_confirm_delete")}</span>
                    <input
                      value={deleteReason}
                      onChange={e => setDeleteReason(e.target.value)}
                      placeholder={t("matrix_delete_reason_ph")}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all text-[var(--text)] placeholder:opacity-40 border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                    />
                    <div className="flex gap-3">
                      <ActionButton type="button" onClick={handleConfirmSidePanelDelete} label={t("yeet_btn_confirm")} className="!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"></ActionButton>
                      <ActionButton type="button" onClick={() => { setIsDeleting(false); setDeleteReason(""); }} label={t("nav_cancel")}></ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 w-full">
                    {editConflictId && editingGhost?.status !== 'pending' && (
                      <input
                        value={updateReason}
                        onChange={e => setUpdateReason(e.target.value)}
                        placeholder={t("matrix_update_reason_ph")}
                        className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all text-[var(--text)] placeholder:opacity-40 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                      />
                    )}
                    <div className="flex justify-center items-center gap-4 mt-2 w-full">
                      {!editConflictId && (
                        <ActionButton type="button" onClick={() => setIsSidePanelOpen(false)} label={t("nav_cancel")}>

                        </ActionButton>
                      )}
                      {editConflictId && (
                        <ActionButton type="button" onClick={() => setIsDeleting(true)} label={editingGhost?.status === 'pending' ? (t("matrix_btn_reject")) : (t("purge"))}>

                        </ActionButton>
                      )}
                      {editingGhost?.status !== 'pending' && (
                        <ActionButton type="button" onClick={() => handleAddGhost()} disabled={!modA || !modB || (!!editConflictId && !updateReason.trim())} label={editConflictId ? (t("edit_side_panel")) : (t("inject"))}>

                        </ActionButton>
                      )}
                      {editingGhost?.status === 'pending' && (
                        <ActionButton type="button" onClick={() => handleConfirmSidePanelApprove()} label={t("ui_btn_approve")}>

                        </ActionButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            }
            noPadding={true}
            noScroll={true}
          >
            <div className="flex flex-col h-full overflow-hidden relative">

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32 relative z-10">

                <form onSubmit={handleAddGhost} className="flex flex-col gap-8 relative z-10">
                  <div className="flex flex-col gap-6">
                    {editingGhost && (
                      <div className="flex flex-col gap-2 relative z-10 w-full text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-4">
                        <div className="flex justify-start items-center">
                          <span className="opacity-60 flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">calendar_today</span>{t("date_created")}</span>
                          <span className="text-[var(--text)] drop-shadow-md">{new Date(editingGhost.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-start items-center mt-2 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-3 relative z-10">
                          <span className="opacity-60 flex items-center gap-2"><span className="material-symbols-outlined !text-[14px]">fingerprint</span>{t("source")}</span>
                          <span className="text-[var(--accent)] drop-shadow-md">{editingGhost.author_id ? (t("tab_architect")) : (t("source_system"))}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 w-full">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                        {t("enemy_a")}
                      </label>
                      <ModSearchDropdown placeholder={t("enemy_a")} modList={allMods} selectedItem={modA} onSelect={setModA} onClear={() => setModA(null)} />
                    </div>

                    <div className="relative h-6 w-full flex items-center justify-center z-20 my-2">
                      <div className="absolute left-6 right-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] z-10 pointer-events-none" />
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm relative z-20 text-[var(--subtext)]">
                        <span className="text-[8px] font-black italic capitalize drop-shadow-md">{t("vs")}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                        {t("enemy_b")}
                      </label>
                      <ModSearchDropdown placeholder={t("enemy_b")} modList={allMods} selectedItem={modB} onSelect={setModB} onClear={() => setModB(null)} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full mt-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                      {t("label_severity")}
                    </label>
                    <div className="relative z-50">
                      <CustomTierDropdown value={severity} onChange={setSeverity} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full mt-2 mb-8">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                      {t("resolution")}
                    </label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("resolution")} className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:theme-border-accent resize-none custom-scrollbar shadow-inner relative z-10 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]" />
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

