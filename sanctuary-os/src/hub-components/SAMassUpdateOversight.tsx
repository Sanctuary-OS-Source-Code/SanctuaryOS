import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, ActionButton, ScreenUtilityBar
} from "../shared";
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
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);

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
            await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'logical_conflicts', p_payload: { mod_a_id: id, mod_b_id: massConflictId.id, mod_a: mod.name, mod_b: massConflictId.name, severity_rank: 4 } });
          }
        }

        if (Object.keys(modUpdates).length > 0) {
          await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'mods', p_payload: { id, ...modUpdates } });
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

      await supabase.rpc('secure_upsert_cloud_file', {
        p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: actionStr,
          target_table: 'mods',
          target_name: 'BATCH OPERATION',
          actor_id: myId,
          reason: editReason.trim()
        }
      });

      setMassStatus(""); setMassCategory(""); setMassSubCategory(""); setMassCompliance(""); setMassGameVersions([]); setMassConflictId(null); setEditReason("");
      setSelectedIds(new Set());
      setIsActionPanelOpen(false);
      await loadData();
      useStore.getState().pushStatus(t("auto_mass_update_completed_39"));
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

      <ScreenUtilityBar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t("search_ph") as string}
        className="px-6 py-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full z-30"
      >
        <div className="w-max min-w-[192px] z-40 shrink-0">
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
            placeholder={t("filter_category")}
          />
        </div>

        <div className="w-max min-w-[200px] z-30 shrink-0">
          <GameVersionMultiSelect selectedVersions={filterGameVersions} onChange={setFilterGameVersions} />
        </div>

        <div className="flex items-stretch overflow-hidden glass-panel rounded-xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] h-12 shrink-0 z-40">
          <button
            onClick={() => setShowOnlySelected(!showOnlySelected)}
            className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${showOnlySelected ? 'bg-[var(--accent)]/[20%] text-[var(--accent)] shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.1)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
          >
            <span className="material-symbols-outlined !text-[16px] mr-2">checklist</span>
            {showOnlySelected ? "SHOWING SELECTED" : "SELECTED ONLY"}
          </button>
          <button
            onClick={handleSelectAllFiltered}
            className="h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[16px] mr-2">done_all</span>
            {t("auto_toggle_all_visible") || "TOGGLE ALL"}
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="shrink-0 animate-in fade-in zoom-in duration-300">
            <ActionButton
              onClick={() => setIsActionPanelOpen(true)}
              variant="accent"
              icon="tune"
              label={`${t("mass_update_apply") || "CONFIGURE UPDATE"} (${selectedIds.size})`}
              className="h-12 px-6 font-black uppercase tracking-widest text-[10px]"
            />
          </div>
        )}
      </ScreenUtilityBar>

      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-6 pb-24">
          {loading ? (
            <div className="py-20 text-center font-black opacity-50 uppercase tracking-widest animate-pulse">{t("loading_registry")}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-4">
                {filteredMods.slice(0, visibleCount).map(m => (
                  <div
                    key={m.id}
                    onClick={() => handleToggle(m.id)}
                    className={`relative group/item flex flex-col p-4 rounded-3xl glass-panel border transition-all duration-300 isolate cursor-pointer ${selectedIds.has(m.id)
                      ? 'border-[var(--accent)]/[50%] shadow-[0_10px_30px_rgba(var(--accent-rgb),0.2)] bg-[var(--accent)]/[10%] scale-[1.02]'
                      : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/[30%] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.1)] hover:bg-[var(--accent)]/[5%]'
                      }`}
                  >
                    <div className="flex items-start justify-start gap-3 mb-4">
                      <div className={`w-12 h-12 flex items-center justify-center shrink-0 rounded-2xl border shadow-inner transition-colors ${selectedIds.has(m.id)
                        ? 'bg-[var(--accent)]/[20%] border-[var(--accent)]/[50%] text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]'
                        : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover/item:border-[var(--accent)]/[30%]'
                        }`}>
                        {selectedIds.has(m.id) ? (
                          <span className="material-symbols-outlined !text-[24px] drop-shadow-[0_0_5px_var(--accent)]">check</span>
                        ) : (
                          <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-40">extension</span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest leading-none border ${selectedIds.has(m.id)
                          ? 'bg-[var(--accent)]/[20%] text-[var(--accent)] border-[var(--accent)]/[30%]'
                          : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'
                          }`}>
                          {m.master_author || 'UNKNOWN'}
                        </span>
                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase mt-1">
                          {t("auto_status")} {(m.status || "UNVERIFIED").replace(/_/g, ' ')} | {t("auto_tier")} {m.compliance_tier}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-2">
                      <span className={`text-[13px] font-black uppercase tracking-widest leading-tight transition-colors duration-300 break-words line-clamp-2 ${selectedIds.has(m.id) ? 'text-[var(--text)]' : 'text-[var(--text)] group-hover/item:text-[var(--accent)]'
                        }`}>
                        {m.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {filteredMods.length > visibleCount && (
                <div className="col-span-full flex justify-center w-full pt-4 pb-8">
                  <button
                    onClick={() => setVisibleCount(v => v + 100)}
                    className="group px-12 py-4 rounded-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black uppercase tracking-widest hover:border-[var(--accent)]/[50%] hover:text-[var(--accent)] hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)] hover:bg-[var(--accent)]/[5%] transition-all shadow-xl flex items-center gap-3"
                  >
                    <span className="material-symbols-outlined !text-[20px] group-hover:animate-bounce">expand_more</span>
                    {t("ui_btn_load_more")} ({visibleCount} / {filteredMods.length})
                  </button>
                </div>
              )}

              {!loading && filteredMods.length === 0 && (
                <EmptyState icon={t("icon_extension_off") || "extension_off"} title={t("sa_no_artifacts")} className="col-span-full py-16" />
              )}
            </>
          )}
        </div>
      </div>

      <SidePanel
        isOpen={isActionPanelOpen}
        onClose={() => setIsActionPanelOpen(false)}
        title={t("mass_update_apply") || "APPLY MASS UPDATE"}
        subtitle={`${selectedIds.size} ${t("artifacts_selected") || "ARTIFACTS SELECTED"}`}
        icon="batch_prediction"
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
        keepMounted={true}
        noPadding={true}
      >
        <div className="flex flex-col gap-6 w-full relative flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">

          <div className="flex flex-col gap-8 flex-1">
            <div className="flex flex-col gap-2 relative z-50">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <span className={`material-symbols-outlined !text-[16px] ${massStatus ? 'text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]' : 'text-[var(--subtext)] opacity-50'}`}>policy</span>
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
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <span className={`material-symbols-outlined !text-[16px] ${massCompliance ? 'text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]' : 'text-[var(--subtext)] opacity-50'}`}>verified_user</span>
                {t("vault_stat_tier")}
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
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <span className={`material-symbols-outlined !text-[16px] ${massCategory ? 'text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]' : 'text-[var(--subtext)] opacity-50'}`}>category</span>
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
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <span className={`material-symbols-outlined !text-[16px] ${massGameVersions.length > 0 ? 'text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]' : 'text-[var(--subtext)] opacity-50'}`}>videogame_asset</span>
                {t("auto_replace_game_versions")}
              </label>
              <GameVersionMultiSelect selectedVersions={massGameVersions} onChange={setMassGameVersions} />
            </div>

            <div className="flex flex-col gap-2 relative z-10">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <span className={`material-symbols-outlined !text-[16px] ${massConflictId ? 'text-[var(--danger)] drop-shadow-[0_0_5px_var(--danger)]' : 'text-[var(--danger)] opacity-80'}`}>gavel</span>
                {t("mass_assign_conflict")}
              </label>
              <ModSearchDropdown
                placeholder={t("auto_select_artifact_to_32")}
                selectedItem={massConflictId}
                onSelect={setMassConflictId}
                onClear={() => setMassConflictId(null)}
                modList={mods}
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0 flex flex-col gap-4 pb-6">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-pulse shadow-[0_0_5px_var(--danger)]"></span>
                {t("batch_reason_req")}
              </label>
              <textarea
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder={t("reason_update")}
                className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-5 py-4 text-[var(--text)] text-[11px] font-black uppercase tracking-widest h-24 resize-none focus:outline-none focus:border-red-500/[50%] transition-all border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-red-500/[30%]"
              />
            </div>

            <div className="flex items-center justify-center gap-4 mt-2">
              <ActionButton
                onClick={() => setIsActionPanelOpen(false)}
                variant="glass"
                icon="close"
                label={t("nav_cancel") || "CANCEL"}
              />
              <ActionButton
                disabled={isUpdating || selectedIds.size === 0 || !hasAnyAction || !editReason.trim()}
                onClick={executeMassUpdate}
                variant="success"
                icon="done_all"
                label={isUpdating ? "EXECUTING..." : "INITIATE MASS UPDATE"}
              />
            </div>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}

