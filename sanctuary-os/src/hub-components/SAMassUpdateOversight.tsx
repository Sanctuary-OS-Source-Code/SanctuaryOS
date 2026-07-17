import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";



export function MassUpdateOversight() {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s: any) => s.activeGameSchema);
  const [mods, setMods] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterGameVersions, setFilterGameVersions] = useState<string[]>([]);

  const [massStatus, setMassStatus] = useState<string>("");
  const [massGameVersions, setMassGameVersions] = useState<string[]>([]);
  const [massCategory, setMassCategory] = useState<string>("");
  const [massSubCategory, setMassSubCategory] = useState<string>("");
  const [massCompliance, setMassCompliance] = useState<string>("");
  const [massConflictId, setMassConflictId] = useState<any>(null);

  const [editReason, setEditReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const { data } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, status, category_override, sub_type, compliance_tier, compatible_versions, master_author').order('name'));
    if (data) setMods(data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const executeMassUpdate = async () => {
    if (selectedIds.size === 0 || !editReason.trim()) return;
    setIsUpdating(true);

    const updates: any = {};
    if (massStatus) updates.status = massStatus;
    if (massCategory) updates.category_override = massCategory;
    if (massSubCategory) updates.sub_type = massSubCategory;
    if (massCompliance) updates.compliance_tier = parseInt(massCompliance);
    if (massGameVersions.length > 0) updates.compatible_versions = massGameVersions;

    updates.updated_at = new Date().toISOString();

    try {
      for (const id of Array.from(selectedIds)) {
        let modUpdates = { ...updates };
        if (massConflictId) {
          const mod = mods.find(m => m.id === id);
          if (mod) {
            await supabase.from('logical_conflicts').insert([{ mod_a_id: id, mod_b_id: massConflictId.id, mod_a: mod.name, mod_b: massConflictId.name, severity_rank: 4 }]);
          }
        }

        if (Object.keys(modUpdates).length > 0) {
          await supabase.from('mods').update(modUpdates).eq('id', id);
        }
      }

      const userRes = await supabase.auth.getUser();
      const myId = userRes.data.user?.id;

      let actionStr = `Mass Updated ${selectedIds.size} Artifacts: `;
      const changes = [];
      if (massStatus) changes.push(`Status->${massStatus}`);
      if (massCategory) changes.push(`Cat->${massCategory}`);
      if (massCompliance) changes.push(`Tier->${massCompliance}`);
      if (massGameVersions.length > 0) changes.push(`Versions Modified`);
      if (massConflictId) changes.push(`Added Conflict`);
      actionStr += changes.join(", ");

      await supabase.from('audit_logs').insert({
        action: actionStr,
        target_table: 'mods',
        target_name: 'BATCH OPERATION',
        actor_id: myId,
        reason: editReason.trim()
      });

      setMassStatus(""); setMassCategory(""); setMassSubCategory(""); setMassCompliance(""); setMassGameVersions([]); setMassConflictId(null); setEditReason("");
      setSelectedIds(new Set());
      await loadData();
      useStore.getState().pushStatus(t("auto_mass_update_completed_successfully"));
    } catch (e) {
      console.error(e);
      useStore.getState().pushStatus(t("auto_mass_update_failed"));
    }
    setIsUpdating(false);
  };

  const filteredMods = mods.filter(m => {
    if (showOnlySelected && !selectedIds.has(m.id)) return false;
    if (filterCategory && m.category_override !== filterCategory) return false;
    if (filterGameVersions.length > 0) {
      if (!m.compatible_versions || m.compatible_versions.length === 0) return false;
      const hasMatch = filterGameVersions.some(v => m.compatible_versions.includes(v));
      if (!hasMatch) return false;
    }
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    setVisibleCount(100);
  }, [searchQuery, showOnlySelected, filterCategory, filterGameVersions]);

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedIds);
    let allSelected = true;
    for (const m of filteredMods) {
      if (!next.has(m.id)) allSelected = false;
    }
    if (allSelected) {
      filteredMods.forEach(m => next.delete(m.id));
    } else {
      filteredMods.forEach(m => next.add(m.id));
    }
    setSelectedIds(next);
  };

  const hasAnyAction = !!(massStatus || massCategory || massCompliance || massGameVersions.length > 0 || massConflictId);

  return (
    <div className="flex flex-col w-full relative h-full">

      <div className="flex flex-col md:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_dynamic_feed")}</span>
          </div>
          <span className="truncate">{t("mass_update_title")}</span>
        </h2>

        <div className="flex items-center gap-4 ml-auto">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-black theme-text-accent drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)] leading-none">{selectedIds.size}</span>
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{t("artifacts_selected")}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in h-full w-full mx-auto p-6 pt-6">

        <div className="flex-1 min-w-0 theme-glass-panel rounded-[var(--radius)] flex flex-col h-[850px] border border-white/5 overflow-hidden shadow-inner">
          <div className="p-6 border-b border-white/5 z-20 flex flex-col gap-4">

            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
                <input
                  type="text"
                  placeholder={t("search_mods")}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                />
              </div>
              <div className="w-max min-w-[192px] max-w-xs z-40 shrink-0">
                <CustomDropdown disableTint={true}
                  value={filterCategory}
                  onChange={(v: string[]) => setFilterCategory(v[0])}
                  options={[
                    { id: "", label: "ALL CATEGORIES" },
                    ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                      id: cat.id,
                      label: (t(cat.lexicon_key) || cat.id).toUpperCase()
                    })) || [])
                  ]}
                  placeholder={t("auto_filter_category")}
                />
              </div>
              <button
                onClick={() => setShowOnlySelected(!showOnlySelected)}
                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm shrink-0 ${showOnlySelected ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]" : "theme-glass-inner border-white/10 text-[var(--text)] hover:bg-white/5 hover:theme-border-accent"}`}
              >
                {showOnlySelected ? "SHOWING SELECTED" : "SHOW SELECTED ONLY"}
              </button>
              <button onClick={handleSelectAllFiltered} className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all theme-glass-inner border-white/10 text-[var(--text)] hover:bg-white/5 hover:theme-border-accent shrink-0">
                {t("auto_toggle_all_visible")}
              </button>
            </div>

            <div className="w-full z-30 relative mt-1">
              <GameVersionMultiSelect selectedVersions={filterGameVersions} onChange={setFilterGameVersions} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 p-6">
            {loading ? (
              <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest animate-pulse">{t("loading_registry")}</div>
            ) : (
              <>
                {filteredMods.slice(0, visibleCount).map(m => (
                  <div
                    key={m.id}
                    onClick={() => handleToggle(m.id)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center gap-5 border shadow-sm group ${selectedIds.has(m.id) ? "theme-border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] scale-[1.01]" : "border-white/5 theme-glass-inner hover:theme-border-accent hover:bg-white/5"}`}
                  >
                    <div className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedIds.has(m.id) ? "theme-bg-accent theme-border-accent text-[var(--bg)] shadow-[0_0_10px_var(--accent)]" : "border-white/20 bg-black/20 group-hover:border-white/40"}`}>
                      {selectedIds.has(m.id) && <span className="text-sm font-black">{t("_")}</span>}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-sm font-black uppercase truncate leading-tight transition-colors ${selectedIds.has(m.id) ? "theme-text-accent drop-shadow-md" : "text-[var(--text)] group-hover:text-white"}`}>{m.name}</span>
                      <span className="text-[9px] font-bold uppercase text-[var(--subtext)] opacity-60 mt-1 truncate">
                        {m.master_author ? `${m.master_author} | ` : ""}{t("auto_status")} {(m.status || "UNVERIFIED").replace(/_/g, ' ')} {t("auto_tier")} {m.compliance_tier}
                      </span>
                    </div>
                  </div>
                ))}

                {filteredMods.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount(v => v + 100)}
                    className="w-full py-4 mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] font-black uppercase tracking-widest transition-all"
                  >
                    {t("ui_btn_load_more")} ({visibleCount} / {filteredMods.length})
                  </button>
                )}

                {!loading && filteredMods.length === 0 && (
                  <EmptyState icon={t("icon_extension_off") || "extension_off"} title={t("sa_no_artifacts")} className="col-span-full py-16" />
                )}
              </>
            )}
          </div>
        </div>

        <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0 h-[850px]">
          <div className="theme-glass-panel rounded-[var(--radius)] p-8 border border-white/5 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)] flex-1 overflow-hidden relative">

            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500 opacity-5 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 theme-bg-accent opacity-5 blur-[100px] pointer-events-none" />

            <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-6 z-10 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_var(--danger)]" />
              <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-widest italic">{t("mass_update_apply")}</h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-2 z-10">

              <div className="flex flex-col gap-2 relative z-50">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massStatus ? 'theme-text-accent drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                  {t("mass_status_protocol")}
                </label>
                <CustomDropdown disableTint={true}
                  value={massStatus}
                  onChange={(v: string[]) => setMassStatus(v[0])}
                  options={[
                    { id: "", label: "-- LEAVE UNCHANGED --" },
                    { id: "verified", label: "VERIFIED" },
                    { id: "unverified", label: "UNVERIFIED" },
                    { id: "deprecated", label: "DEPRECATED" },
                    { id: "quarantined", label: "QUARANTINED" }
                  ]}
                />
              </div>

              <div className="flex flex-col gap-2 relative z-40">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massCompliance ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                  {t("Vault_stat_tier")}
                </label>
                <CustomDropdown disableTint={true}
                  value={massCompliance}
                  onChange={(v: string[]) => setMassCompliance(v[0])}
                  options={[
                    { id: "", label: "-- LEAVE UNCHANGED --" },
                    { id: "0", label: "CLEAN (TIER 0)" },
                    { id: "1", label: "NSFW 18+ (TIER 1)" },
                    { id: "2", label: "EXPLICIT (TIER 2)" },
                    { id: "3", label: "MALWARE (TIER 3)" }
                  ]}
                />
              </div>

              <div className="flex flex-col gap-2 relative z-30">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massCategory ? 'theme-text-warning drop-shadow-[0_0_5px_rgba(var(--warning-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                  {t("mass_category_override")}
                </label>
                <CustomDropdown disableTint={true}
                  value={massCategory}
                  onChange={(v: string[]) => setMassCategory(v[0])}
                  options={[
                    { id: "", label: "-- LEAVE UNCHANGED --" },
                    ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                      id: cat.id,
                      label: (t(cat.lexicon_key) || cat.id).toUpperCase()
                    })) || [])
                  ]}
                />
              </div>

              <div className="flex flex-col gap-2 relative z-20">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massGameVersions.length > 0 ? 'theme-text-accent drop-shadow-[0_0_5px_rgba(var(--accent-rgb),0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                  {t("auto_replace_game_versions")}
                </label>
                <GameVersionMultiSelect selectedVersions={massGameVersions} onChange={setMassGameVersions} />
              </div>

              <div className="flex flex-col gap-2 relative z-10">
                <label className={`text-[9px] font-black uppercase tracking-widest ml-2 flex items-center gap-2 transition-all ${massConflictId ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]' : 'text-[var(--subtext)] opacity-60'}`}>
                  {t("mass_assign_conflict")}
                </label>
                <ModSearchDropdown
                  placeholder={t("auto_select_artifact_to_conflict")}
                  selectedItem={massConflictId}
                  onSelect={setMassConflictId}
                  onClear={() => setMassConflictId(null)}
                  modList={mods}
                />
              </div>

            </div>

            <div className="mt-6 pt-6 border-t border-white/10 shrink-0 flex flex-col gap-4 z-10">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_var(--danger)]"></span>
                  {t("batch_reason_req")}
                </label>
                <textarea
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder={t("reason_update")}
                  className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-24 resize-none focus:outline-none focus:theme-border-danger transition-all border border-white/5"
                />
              </div>

              <button
                disabled={isUpdating || selectedIds.size === 0 || !hasAnyAction || !editReason.trim()}
                onClick={executeMassUpdate}
                className={`!w-full !rounded-[var(--radius)] !py-5 ${standardSuccessButtonClass}`}
              >
                {isUpdating ? "EXECUTING..." : "INITIATE MASS UPDATE"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

