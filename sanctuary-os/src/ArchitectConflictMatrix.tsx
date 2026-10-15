import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ModSearchDropdown, SidePanel, EmptyState, ActionButton, CustomTierDropdown, PanelHeaderGroup, PanelHeaderButton } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "./components/layouts/ElevatedHubLayout";
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
  const [filterTab, setFilterTab] = useState<'overview' | 'pending' | 'completed'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [editConflictId, setEditConflictId] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
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

  const renderConflictCard = (g: any) => {
    const statusIcon = g.status === 'active' || g.status === 'approved' ? 'check_circle' : 'hourglass_empty';
    
    return (
      <UniversalCard
        key={g.id}
        onClick={() => handleEditConflict(g)}
        layout="vertical"
        icon={statusIcon}
        title={
          <div className="flex flex-col gap-2 w-full mt-2">
            <div className="flex flex-col gap-1">
              <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${g.severity_rank == 4 ? 'text-[var(--danger)]' : g.severity_rank == 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
                {t("enemy_a") || "Artifact A"}
              </span>
              <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameA}</span>
            </div>
            <div className="relative h-px w-full flex items-center justify-center z-20 my-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] absolute border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm text-[var(--subtext)]">
                <span className="text-[7px] font-black italic capitalize">{t("vs") || "VS"}</span>
              </div>
              <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-[9px] font-black capitalize tracking-widest flex items-center gap-1.5 opacity-80 ${g.severity_rank == 4 ? 'text-[var(--danger)]' : g.severity_rank == 3 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
                {t("enemy_b") || "Artifact B"}
              </span>
              <span className="text-sm font-black text-[var(--text)] line-clamp-2 tracking-tight">{g.nameB}</span>
            </div>
          </div>
        }
        badges={
          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest backdrop-blur-md shadow-sm border ${g.severity_rank == 4 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>{t("ui_icon_logo") || "T"}{g.severity_rank}</span>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60">
              <span className="material-symbols-outlined !text-[12px] normal-case">{t("icon_calendar_today") || "calendar_today"}</span>
              {new Date(g.created_at).toLocaleDateString()}
            </span>
            <span className="text-[9px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0">
              {t("btn_review") || "Review"} <span className="text-lg leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="schedule"
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending") || "Recent Pending"}
        isEmpty={filteredPendingGhosts.length === 0}
        emptyIcon="check_circle"
        emptyTitle={t("no_pending_conflicts") || "No pending conflicts"}
      >
        {filteredPendingGhosts.slice(0, 4).map(renderConflictCard)}
      </HubOverviewSection>

      <HubOverviewSection
        icon="check_circle"
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed") || "Recent Completed"}
        isEmpty={filteredActiveGhosts.length === 0}
        emptyIcon="history"
        emptyTitle={t("no_history") || "No conflict history"}
      >
        {filteredActiveGhosts.slice(0, 4).map(renderConflictCard)}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("architect_conflict_matrix") || "Matrix"}
        headerSubtitle={t("architect_conflict_matrix_desc") || "Registry review, metadata governance, and conflict triage"}
        headerIcon="developer_board"
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={(t("ui_placeholder_search") || "Search conflicts...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={[
          { id: 'overview', label: t("landing_overview") || "Overview (HQ)", icon: 'dashboard', number: ghosts.length.toString(), colorClass: 'text-[var(--accent)]' },
          { id: 'pending', label: t("pending") || "Pending", icon: 'schedule', number: pendingGhosts.length.toString() },
          { id: 'completed', label: t("status_completed") || "Completed", icon: 'check_circle', number: activeGhosts.length.toString() }
        ]}
        primaryPopover={{
          icon: "tune",
          label: t("filters") || "Filters",
          content: (
            <div className="flex flex-col w-[300px] p-4 text-left">
              <div className="flex flex-col mb-5 w-full">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
                  {t("severity") || "TIER"}
                </div>
                <div className="flex items-stretch glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner h-10 shrink-0 divide-x divide-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">
                  <button onClick={() => setTierFilter(null)} className={`flex-1 px-3 rounded-none flex items-center justify-center text-[10px] font-black capitalize tracking-widest transition-all ${tierFilter === null ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("ql_all") || "All"}</button>
                  {[4, 3].map(tLevel => (
                    <button key={tLevel} onClick={() => setTierFilter(tLevel)} className={`flex-1 px-3 rounded-none flex items-center justify-center text-[10px] font-black capitalize tracking-widest transition-all ${tierFilter === tLevel ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{`${t("ui_icon_logo") || "T"}${tLevel}`}</button>
                  ))}
                </div>
              </div>
            </div>
          )
        }}
        actions={[
          {
            id: "create",
            icon: "add",
            label: t("auto_create") || "Create",
            onClick: () => { setEditConflictId(null); setModA(null); setModB(null); setNote(""); setSeverity(4); setIsSidePanelOpen(true); }
          }
        ]}
      >
        {filterTab === 'overview' && renderLanding()}

        {filterTab === 'pending' && (
          <div className="mb-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {filteredPendingGhosts.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : (t("icon_verified_user") || "verified_user")} title={searchTerm ? (t("no_matches") || "No matches") : (t("no_pending_conflicts") || "No pending conflicts")} className="col-span-full py-16" />
              ) : filteredPendingGhosts.slice(0, visibleCount).map(renderConflictCard)}
            </div>
            {filteredPendingGhosts.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} / {filteredPendingGhosts.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'completed' && (
          <div className="pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {loading ? (
                <div className="col-span-full p-12 text-center">
                  <span className="theme-text-accent font-black capitalize tracking-widest text-xs animate-pulse">{t("syncing") || "Syncing..."}</span>
                </div>
              ) : filteredActiveGhosts.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : (t("icon_check_circle") || "check_circle")} title={searchTerm ? (t("no_matches") || "No matches") : (t("no_active_conflicts") || "No active conflicts")} className="col-span-full py-16" />
              ) : (
                filteredActiveGhosts.slice(0, visibleCount).map(renderConflictCard)
              )}
            </div>
            {!loading && filteredActiveGhosts.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} / {filteredActiveGhosts.length})
              </button>
            )}
          </div>
        )}
      </ElevatedHubLayout>

      {(() => {
        const editingGhost = ghosts.find(g => g.id === editConflictId);

        return (
          <SidePanel
            isOpen={isSidePanelOpen}
            onClose={() => setIsSidePanelOpen(false)}
            title={editConflictId ? (t("edit_side_panel") || "Edit Conflict") : (t("forge_title") || "New Conflict")}
            icon="security"
            headerActions={
              <PanelHeaderGroup>
                {editConflictId && !isDeleting && (
                  <PanelHeaderButton icon="delete" variant="danger" tooltip={editingGhost?.status === 'pending' ? (t("matrix_btn_reject") || "Reject") : (t("purge") || "Delete")} onClick={() => setIsDeleting(true)} />
                )}
                {editingGhost?.status !== 'pending' && !isDeleting && (
                  <PanelHeaderButton icon="check" variant="success" disabled={!modA || !modB || (!!editConflictId && !updateReason.trim())} tooltip={editConflictId ? (t("edit_side_panel") || "Save") : (t("inject") || "Create")} onClick={() => handleAddGhost()} />
                )}
                {editingGhost?.status === 'pending' && !isDeleting && (
                  <PanelHeaderButton icon="check" variant="success" tooltip={t("ui_btn_approve") || "Approve"} onClick={() => handleConfirmSidePanelApprove()} />
                )}
              </PanelHeaderGroup>
            }
          >
            <form onSubmit={handleAddGhost} className="flex flex-col h-full gap-8">
              <SidePanelTitleInput
                value={modA && modB ? `${modA.name} vs ${modB.name}` : (editConflictId ? (t("edit_side_panel") || "Conflict Rule") : (t("forge_title") || "Create Conflict Rule"))}
                readOnly
                subtitle={editingGhost ? `${t("date_created") || "Created"}: ${new Date(editingGhost.created_at).toLocaleDateString()} • ${editingGhost.author_id ? (t("tab_architect") || "Architect") : (t("source_system") || "System")}` : undefined}
              />

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                    {t("enemy_a") || "Artifact A"}
                  </label>
                  <ModSearchDropdown placeholder={t("enemy_a") || "Artifact A"} modList={allMods} selectedItem={modA} onSelect={setModA} onClear={() => setModA(null)} />
                </div>

                <div className="relative h-6 w-full flex items-center justify-center z-20 my-2">
                  <div className="absolute left-6 right-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] z-10 pointer-events-none" />
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm relative z-20 text-[var(--subtext)]">
                    <span className="text-[8px] font-black italic capitalize">{t("vs") || "VS"}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                    {t("enemy_b") || "Artifact B"}
                  </label>
                  <ModSearchDropdown placeholder={t("enemy_b") || "Artifact B"} modList={allMods} selectedItem={modB} onSelect={setModB} onClear={() => setModB(null)} />
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full mt-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                  {t("label_severity") || "Severity"}
                </label>
                <div className="relative z-50">
                  <CustomTierDropdown value={severity} onChange={setSeverity} />
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full mt-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                  {t("resolution") || "Resolution Note"}
                </label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("resolution") || "Resolution Note"} className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:theme-border-accent resize-none custom-scrollbar shadow-inner relative z-10" />
              </div>

              {editConflictId && editingGhost?.status !== 'pending' && (
                <div className="flex flex-col gap-2 w-full mt-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-2">
                    {t("matrix_update_reason_ph") || "Update Reason"}
                  </label>
                  <input
                    value={updateReason}
                    onChange={e => setUpdateReason(e.target.value)}
                    placeholder={t("matrix_update_reason_ph") || "Reason for update..."}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all text-[var(--text)] placeholder:opacity-40 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                  />
                </div>
              )}

              {isDeleting && (
                <div className="flex flex-col gap-4 p-5 mt-4 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] backdrop-blur-md animate-in slide-in-from-bottom-2">
                  <span className="text-sm font-black text-[var(--danger)] capitalize tracking-widest text-center">{t("ui_confirm_delete") || "Confirm Delete"}</span>
                  <input
                    value={deleteReason}
                    onChange={e => setDeleteReason(e.target.value)}
                    placeholder={t("matrix_delete_reason_ph") || "Reason for deletion..."}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] transition-all text-[var(--text)] placeholder:opacity-40 border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                  />
                  <div className="flex justify-center gap-3 mt-2">
                    <ActionButton type="button" onClick={handleConfirmSidePanelDelete} label={t("yeet_btn_confirm") || "Confirm"} className="!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"></ActionButton>
                    <ActionButton type="button" onClick={() => { setIsDeleting(false); setDeleteReason(""); }} label={t("nav_cancel") || "Cancel"}></ActionButton>
                  </div>
                </div>
              )}
            </form>
          </SidePanel>
        );
      })()}
    </>
  );
}




