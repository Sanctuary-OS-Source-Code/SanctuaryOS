import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, ActionButton, PanelHeaderGroup, PanelHeaderButton,
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard, StatBox } from "../components/universal/UniversalLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
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
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);
  const [recentChanges, setRecentChanges] = useState<any[]>([]);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterGameVersions, setFilterGameVersions] = useState<string[]>([]);
  const [filterVersionSearch, setFilterVersionSearch] = useState<string>("");

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

    const { data: auditData } = await supabase.from('audit_logs')
      .select('*')
      .ilike('action', 'Mass Updated%')
      .order('created_at', { ascending: false })
      .limit(50);
    if (auditData) setRecentChanges(auditData);

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
      useStore.getState().pushStatus(t("auto_mass_update_completed_39", "Mass update completed."));
    } catch (e) {
      console.error(e);
      useStore.getState().pushStatus(t("auto_mass_update_failed", "Mass update failed."));
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

  const tabs = [
    { id: "overview", label: t("landing_overview", "Overview"), icon: "dashboard" },
    { id: "mass_select", label: t("mass_update_apply", "Mass Select"), icon: "checklist" },
    { id: "recent", label: t("recent_changes", "Recent Changes"), icon: "history" }
  ];

  return (
    <ElevatedHubLayout
      headerTitle={t("mass_update_apply", "Mass Update")}
      headerSubtitle={t("mass_update_subtitle", "Select artifacts to perform batch operations")}
      headerIcon="batch_prediction"
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("search_ph", "Search...") as string}
      hideSearch={activeTab !== 'mass_select'}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={tabs}
      actions={activeTab === 'mass_select' ? [
        {
          id: "toggleSelected",
          icon: "checklist",
          label: showOnlySelected ? t("artifacts_selected", "Showing Selected") : t("mass_update_apply", "Selected Only"),
          activeClassName: showOnlySelected ? "bg-[var(--accent)] text-black" : "",
          onClick: () => setShowOnlySelected(!showOnlySelected)
        },
        {
          id: "selectAll",
          icon: "done_all",
          label: t("auto_toggle_all_visible", "Toggle All Visible") as string,
          onClick: handleSelectAllFiltered
        },
        ...(selectedIds.size > 0 ? [{
          id: "applyMassUpdate",
          icon: "tune",
          label: `${t("mass_update_apply", "Mass Update")} (${selectedIds.size})`,
          activeClassName: "bg-[var(--accent)] text-black",
          onClick: () => setIsActionPanelOpen(true)
        }] : [])
      ] : undefined}
      primaryPopover={activeTab === 'mass_select' ? {
        icon: "tune",
        label: t("filters", "Filters"),
        content: (
          <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Category")}</span>
              <CustomDropdown disableTint={true}
                flat={true} variant="pill"
                value={filterCategory}
                onChange={(v: string[]) => setFilterCategory(v[0])}
                options={[
                  { id: "", label: t("ql_all", "All Categories") },
                  ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                    id: cat.id,
                    label: t(cat.lexicon_key, cat.id)
                  })) || [])
                ]}
              />
            </div>
            <div className="w-full h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("sa_game_versions", "Game Versions")}</span>
              <GameVersionMultiSelect selectedVersions={filterGameVersions} onChange={setFilterGameVersions} variant="pill" />
            </div>
          </div>
        )
      } : undefined}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
        {loading ? (
          <div className="py-20 text-center font-black opacity-50 capitalize tracking-widest animate-pulse">{t("loading_registry", "Loading Registry...")}</div>
        ) : activeTab === 'overview' ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon="inventory_2"
              iconColorClass="text-[var(--accent)]"
              title={t("items", "Artifact Registry")}
              isEmpty={mods.length === 0}
              emptyIcon="inventory_2"
              emptyTitle={t("no_artifacts", "No Artifacts")}
            >
              {mods.slice(0, 4).map(mod => (
                <UniversalCard
                  key={mod.id}
                  onClick={() => setActiveTab('mass_select')}
                  layout="vertical"
                  icon="inventory_2"
                  title={mod.name}
                  subtitle={mod.master_author || mod.category_override || t("items", "Artifact")}
                />
              ))}
            </HubOverviewSection>
            <HubOverviewSection
              icon="history"
              iconColorClass="text-[var(--success)]"
              title={t("recent_activity", "Recent Batch Updates")}
              isEmpty={recentChanges.length === 0}
              emptyIcon="history"
              emptyTitle={t("no_logs", "No Recent Updates")}
            >
              {recentChanges.slice(0, 4).map(log => (
                <UniversalCard
                  key={log.id}
                  layout="vertical"
                  icon="history"
                  title={log.action}
                  subtitle={new Date(log.created_at).toLocaleString()}
                />
              ))}
            </HubOverviewSection>
          </HubOverviewLanding>
        ) : activeTab === 'recent' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {recentChanges.map(log => (
              <UniversalCard
                key={log.id}
                layout="vertical"
                icon="history"
                title={log.action}
                subtitle={<span className="text-xs opacity-70">{new Date(log.created_at).toLocaleString()}</span>}
                badges={[]}
                footer={<div className="text-xs font-bold text-[var(--subtext)] italic truncate">{log.reason || t("no_reason", "No reason provided")}</div>}
              />
            ))}
            {recentChanges.length === 0 && (
              <EmptyState icon="history" title={t("no_logs", "No Recent Changes")} />
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
              {filteredMods.slice(0, visibleCount).map(m => (
                <UniversalCard
                  key={m.id}
                  onClick={() => handleToggle(m.id)}
                  layout="vertical-compact"
                  isActive={selectedIds.has(m.id)}
                  icon={selectedIds.has(m.id) ? "check" : "extension"}
                  title={m.name}
                  badges={
                    <div className="flex justify-between items-center w-full mt-2">
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest leading-none border bg-transparent ${selectedIds.has(m.id)
                        ? 'text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                        : 'text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]'
                        }`}>
                        {m.master_author || t("unknown_mason", "UNKNOWN")}
                      </span>
                      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 capitalize">
                        {t("auto_status", "Status")} {(m.status || t("unverified", "UNVERIFIED")).replace(/_/g, ' ')} | {t("auto_tier", "Tier")} {m.compliance_tier}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>

            {filteredMods.length > visibleCount && (
              <div className="flex justify-center w-full py-8">
                <button
                  onClick={() => setVisibleCount(v => v + 100)}
                  className="group px-12 py-4 rounded-full glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black capitalize tracking-widest hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)] bg-transparent transition-all shadow-xl flex items-center gap-3"
                >
                  <span className="material-symbols-outlined !text-[20px] group-hover:animate-bounce">expand_more</span>
                  {t("ui_btn_load_more", "Load More")} ({visibleCount} / {filteredMods.length})
                </button>
              </div>
            )}

            {!loading && filteredMods.length === 0 && (
              <EmptyState icon={t("icon_extension_off", "extension_off")} title={t("sa_no_artifacts", "No Artifacts Found")} className="py-16" />
            )}
          </>
        )}
      </div>

      <SidePanel
        isOpen={isActionPanelOpen}
        onClose={() => setIsActionPanelOpen(false)}
        title={t("mass_update_apply", "Mass Update")}
        subtitle={`${selectedIds.size} ${t("artifacts_selected", "Artifacts Selected")}`}
        icon="batch_prediction"
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        keepMounted={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon="done_all"
              variant="success"
              tooltip={isUpdating ? t("ui_btn_processing", "Executing...") : t("mass_update_apply", "Initiate Mass Update")}
              disabled={isUpdating || selectedIds.size === 0 || !hasAnyAction || !editReason.trim()}
              onClick={executeMassUpdate}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon="batch_prediction"
            overline={t("mass_update_apply", "Mass Update")}
            title={`${selectedIds.size} ${t("artifacts_selected", "Artifacts Selected")}`}
            description={t("mass_update_subtitle", "Select artifacts to perform batch operations")}
            badge={`${selectedIds.size} ${t("items", "Items")}`}
            badgeIcon="checklist"
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("artifacts_selected", "Selected Artifacts")}
                value={selectedIds.size}
                icon="checklist"
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("mass_status_protocol", "Status Protocol")}
                value={massStatus ? massStatus.toUpperCase() : t("ql_all", "Unchanged")}
                icon="policy"
                iconColorClass={massStatus ? "text-[var(--success)]" : "text-[var(--subtext)]"}
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup title={t("mass_status_protocol", "Status & Classification Protocol")} icon="policy">
            <div className="flex flex-col gap-1.5 relative z-50">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("mass_status_protocol", "Status Protocol")}
              </label>
              <CustomDropdown disableTint={true}
                value={massStatus}
                onChange={(v: string[]) => setMassStatus(v[0])}
                options={[
                  { id: "", label: t("ql_all", "-- Leave Unchanged --") },
                  { id: "verified", label: t("verified", "VERIFIED") },
                  { id: "unverified", label: t("unverified", "UNVERIFIED") },
                  { id: "deprecated", label: t("status_inactive", "DEPRECATED") },
                  { id: "quarantined", label: t("recent_quarantine", "QUARANTINED") }
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5 relative z-40">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("vault_stat_tier", "Compliance Tier")}
              </label>
              <CustomDropdown disableTint={true}
                value={massCompliance}
                onChange={(v: string[]) => setMassCompliance(v[0])}
                options={[
                  { id: "", label: t("ql_all", "-- Leave Unchanged --") },
                  { id: "0", label: t("tier_0_label", "Clean (Tier 0)") },
                  { id: "1", label: t("tier_1_label", "NSFW 18+ (Tier 1)") },
                  { id: "2", label: t("tier_2_label", "Explicit (Tier 2)") },
                  { id: "3", label: t("tier_3_label", "Malware (Tier 3)") }
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5 relative z-30">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("mass_category_override", "Category Override")}
              </label>
              <CustomDropdown disableTint={true}
                value={massCategory}
                onChange={(v: string[]) => setMassCategory(v[0])}
                options={[
                  { id: "", label: t("ql_all", "-- Leave Unchanged --") },
                  ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                    id: cat.id,
                    label: (t(cat.lexicon_key, cat.id) || cat.id).toUpperCase()
                  })) || [])
                ]}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup title={t("sa_game_versions", "Compatibility & Conflict Assignment")} icon="videogame_asset">
            <div className="flex flex-col gap-1.5 relative z-20">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("auto_replace_game_versions", "Replace Game Versions")}
              </label>
              <GameVersionMultiSelect selectedVersions={massGameVersions} onChange={setMassGameVersions} />
            </div>

            <div className="flex flex-col gap-1.5 relative z-10">
              <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                {t("mass_assign_conflict", "Assign Logical Conflict")}
              </label>
              <ModSearchDropdown
                placeholder={t("auto_select_artifact_to_32", "Select artifact to link conflict...")}
                selectedItem={massConflictId}
                onSelect={setMassConflictId}
                onClear={() => setMassConflictId(null)}
                modList={mods}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("batch_reason_req", "Audit Justification")}
            icon="gavel"
            headerColorClass="text-[var(--danger)]"
          >
            <UniversalTextArea
              label={`${t("batch_reason_req", "Batch Reason Required")} *`}
              value={editReason}
              onChange={setEditReason}
              placeholder={t("reason_update", "Enter reason for mass update...")}
            />

            <div className="flex items-center justify-end gap-3 pt-1">
              <ActionButton
                onClick={() => setIsActionPanelOpen(false)}
                variant="glass"
                icon="close"
                label={t("nav_cancel", "Cancel")}
              />
              <ActionButton
                disabled={isUpdating || selectedIds.size === 0 || !hasAnyAction || !editReason.trim()}
                onClick={executeMassUpdate}
                variant="glass"
                icon="done_all"
                label={isUpdating ? t("ui_btn_processing", "Executing...") : t("mass_update_apply", "Initiate Mass Update")}
              />
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
