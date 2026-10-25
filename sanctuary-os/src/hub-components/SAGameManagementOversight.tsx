import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, ActionButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, loadDLCMap, PanelHeaderGroup, PanelHeaderButton
} from "../shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { UniversalGroup, UniversalTextArea, SidePanelHeroCard } from "../components/universal/UniversalLayout";
import { UniversalCard } from "../components/universal/UniversalCard";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "../side-panels/MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";


export function GameManagementOversight() {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<'overview' | 'versions' | 'dlc'>('overview');

  const [versions, setVersions] = useState<any[]>([]);
  const [versionSearch, setVersionSearch] = useState("");
  const [dlcs, setDlcs] = useState<any[]>([]);
  const [dlcSearch, setDlcSearch] = useState("");
  const [dlcTypeFilter, setDlcTypeFilter] = useState("ALL");

  const [sidePanelMode, setSidePanelMode] = useState<"add_version" | "edit_version" | "delete_version" | "add_dlc" | "edit_dlc" | "delete_dlc" | null>(null);
  const [panelTarget, setPanelTarget] = useState<any>(null);
  const [panelInput1, setPanelInput1] = useState("");
  const [panelInput2, setPanelInput2] = useState("");
  const [panelInput3, setPanelInput3] = useState("EP");
  const [panelInput4, setPanelInput4] = useState("");
  const [panelReason, setPanelReason] = useState("");
  const [isPanelSubmitting, setIsPanelSubmitting] = useState(false);

  const fetchVersions = async () => {
    const { data } = await supabase.from('game_versions').select('*').order('version', { ascending: false });
    if (data) setVersions(data);
  };

  const fetchDlcs = async () => {
    const { data } = await supabase.from('dlc_registry').select('*').order('id', { ascending: true });
    if (data) setDlcs(data);
  };

  useEffect(() => {
    fetchVersions();
    fetchDlcs();
  }, []);

  const openPanel = (mode: string, target: any = null) => {
    setSidePanelMode(mode as any);
    setPanelTarget(target);
    setPanelReason("");
    if (mode === 'add_version') {
      setPanelInput1("");
    } else if (mode === 'edit_version') {
      setPanelInput1(target);
    } else if (mode === 'add_dlc') {
      setPanelInput1("");
      setPanelInput2("");
      setPanelInput3("EP");
    } else if (mode === 'edit_dlc') {
      setPanelInput1(target.id);
      setPanelInput2(target.name);
      setPanelInput3(target.type || "EP");
    }
  };

  const handlePanelCommit = async (isDelete: boolean = false) => {
    setIsPanelSubmitting(true);
    const userRes = await supabase.auth.getUser();

    const resolvedType = panelInput3 === "CUSTOM" ? panelInput4 : panelInput3;

    if (isDelete) {
      if (sidePanelMode === 'edit_version') {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_id: panelTarget });
        await logArchitectAction(
          `Deleted Game Version ${panelTarget}`,
          'game_versions',
          String(panelTarget),
          panelReason,
          'Oversight Game Management',
          false,
          { version: { from: panelTarget, to: null } }
        );
        useStore.getState().pushStatus(`Deleted Game Version ${panelTarget}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_id: panelTarget.id });
        await loadDLCMap();
        await logArchitectAction(
          `Deleted DLC Pack ${panelTarget.id}`,
          'dlc_registry',
          String(panelTarget.id),
          panelReason,
          'Oversight Game Management',
          false,
          { id: { from: panelTarget.id, to: null }, name: { from: panelTarget.name, to: null }, type: { from: panelTarget.type, to: null } }
        );
        useStore.getState().pushStatus(`Deleted DLC Pack ${panelTarget.id}`, "success");
        fetchDlcs();
      }
    } else {
      if (sidePanelMode === 'add_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await logArchitectAction(
          `Added Game Version ${panelInput1}`,
          'game_versions',
          panelInput1,
          panelReason,
          'Oversight Game Management',
          false,
          { version: { to: panelInput1 } }
        );
        useStore.getState().pushStatus(`Added Game Version ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await logArchitectAction(
          `Edited Game Version ${panelTarget} -> ${panelInput1}`,
          'game_versions',
          panelInput1,
          panelReason,
          'Oversight Game Management',
          false,
          { version: { from: panelTarget, to: panelInput1 } }
        );
        useStore.getState().pushStatus(`Edited Game Version ${panelTarget} -> ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'add_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await logArchitectAction(
          `Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`,
          'dlc_registry',
          panelInput1.toUpperCase(),
          panelReason,
          'Oversight Game Management',
          false,
          { id: { to: panelInput1.toUpperCase() }, name: { to: panelInput2 }, type: { to: resolvedType } }
        );
        useStore.getState().pushStatus(`Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await logArchitectAction(
          `Edited DLC Pack [${panelTarget.id}] -> [${panelInput1.toUpperCase()}] ${panelInput2}`,
          'dlc_registry',
          panelInput1.toUpperCase(),
          panelReason,
          'Oversight Game Management',
          false,
          {
            id: { from: panelTarget.id, to: panelInput1.toUpperCase() },
            name: { from: panelTarget.name, to: panelInput2 },
            type: { from: panelTarget.type, to: resolvedType }
          }
        );
        useStore.getState().pushStatus(`Edited DLC Pack [${panelTarget.id}]`, "success");
        fetchDlcs();
      }
    }

    setIsPanelSubmitting(false);
    setSidePanelMode(null);
  };

  const filteredDlcs = dlcs.filter(d =>
    (dlcTypeFilter === "ALL" || d.type === dlcTypeFilter) &&
    (!dlcSearch ||
      d.id.toLowerCase().includes(dlcSearch.toLowerCase()) ||
      d.name.toLowerCase().includes(dlcSearch.toLowerCase()))
  );

  const filteredVersions = versions.filter(v =>
    !versionSearch || v.version.toLowerCase().includes(versionSearch.toLowerCase())
  );

  const isCommitDisabled =
    isPanelSubmitting ||
    !panelReason.trim() ||
    ((sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && !panelInput1.trim()) ||
    ((sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (!panelInput1.trim() || !panelInput2.trim()));

  const renderVersionCard = (v: any) => (
    <UniversalCard
      key={v.version}
      onClick={() => openPanel('edit_version', v.version)}
      layout="vertical"
      icon={t("icon_gamepad", "gamepad")}
      title={v.version}
      subtitle={t("patch_release", "Patch Release")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_verified", "verified")}
            </span>
            <span>{t("patch_release", "Patch Release")}</span>
          </div>
        </div>
      }
      badges={
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
            {t("icon_calendar_today", "calendar_today")}
          </span>
          <span>
            {v.release_date ? new Date(v.release_date).toLocaleDateString() : (v.created_at ? new Date(v.created_at).toLocaleDateString() : t("status_active", "Active"))}
          </span>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            {v.version}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    />
  );

  const renderDlcCard = (d: any) => (
    <UniversalCard
      key={d.id}
      onClick={() => openPanel('edit_dlc', d)}
      layout="vertical"
      icon={t("icon_extension", "extension")}
      title={d.name}
      subtitle={d.type ? t(`dlc_type_${d.type.toLowerCase().replace(/ /g, '_')}`, `${d.type} PACK`) : t("unknown", "UNKNOWN")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_extension", "extension")}
            </span>
            <span>{d.type || t("dlc_registry", "DLC")}</span>
          </div>
        </div>
      }
      badges={
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {t("icon_fingerprint", "fingerprint")}
          </span>
          <span>{d.id}</span>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">{t("icon_calendar_today", "calendar_today")}</span>
            {d.release_date ? new Date(d.release_date).toLocaleDateString() : d.id}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_view", "View")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    />
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_game_versions", "Game Versions")}
      headerSubtitle={t("game_management_subtitle", "Manage patches, versions, and DLCs")}
      headerIcon={t("icon_settings", "settings")}
      headerIconColorClass="theme-text-accent"
      search={activeTab === 'versions' ? versionSearch : dlcSearch}
      onSearchChange={(e: string) => activeTab === 'versions' ? setVersionSearch(e) : setDlcSearch(e)}
      searchPlaceholder={activeTab === 'versions' ? t("search_ph", "Search {mods}...") : t("search_ph", "Search {mods}...")}
      hideSearch={activeTab === 'overview'}
      tabs={[
        { id: 'overview', label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), number: (versions.length + dlcs.length).toString() },
        { id: 'versions', label: t("sa_game_versions", "Game Versions"), icon: t("icon_gamepad", "gamepad"), number: versions.length.toString() },
        { id: 'dlc', label: t("dlc_registry", "DLC Registry"), icon: t("icon_extension", "extension"), number: dlcs.length.toString() }
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab as any}
      primaryPopover={
        activeTab === 'dlc' ? {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "DLC Type")}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={dlcTypeFilter}
                  onChange={(v: string[]) => setDlcTypeFilter(v[0])}
                  options={["ALL", ...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: x === "ALL" ? t("all_types", "All Types") : x }))}
                />
              </div>
            </div>
          )
        } : undefined
      }
      actions={
        activeTab !== 'overview' ? [
          {
            id: "register",
            icon: t("icon_add", "add"),
            label: activeTab === 'versions' ? t("btn_register_patch_naked", "Register Patch") : t("panel_add_dlc", "Register DLC"),
            onClick: () => openPanel(activeTab === 'versions' ? 'add_version' : 'add_dlc')
          }
        ] : undefined
      }
    >
      <div className="flex flex-col gap-8">

        {activeTab === 'overview' && (
          <HubOverviewLanding>
            <HubOverviewSection
              icon={t("icon_gamepad", "gamepad")}
              iconColorClass="text-[var(--accent)]"
              title={t("sa_game_versions", "Game Versions")}
              isEmpty={versions.length === 0}
              emptyIcon={t("icon_gamepad", "gamepad")}
              emptyTitle={t("no_versions", "No Game Versions")}
            >
              {versions.slice(0, 4).map(renderVersionCard)}
            </HubOverviewSection>
            <HubOverviewSection
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--success)]"
              title={t("dlc_registry", "DLC Registry")}
              isEmpty={dlcs.length === 0}
              emptyIcon={t("icon_extension", "extension")}
              emptyTitle={t("no_dlc", "No DLC Packs")}
            >
              {dlcs.slice(0, 4).map(renderDlcCard)}
            </HubOverviewSection>
          </HubOverviewLanding>
        )}

        {activeTab === 'versions' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
            {filteredVersions.map(renderVersionCard)}
            {filteredVersions.length === 0 && <EmptyState icon={t("icon_gamepad", "gamepad")} title={t("no_versions", "No Game Versions")} className="col-span-full py-16" />}
          </div>
        )}

        {activeTab === 'dlc' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
            {filteredDlcs.map(renderDlcCard)}
            {filteredDlcs.length === 0 && <EmptyState icon={t("icon_extension_off", "extension_off")} title={t("no_dlc", "No DLC Packs")} className="col-span-full py-16" />}
          </div>
        )}

      </div>

      <SidePanel
        isOpen={!!sidePanelMode}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === 'add_version' ? t("btn_register_patch_naked", "Register Patch") :
            sidePanelMode === 'edit_version' ? t("panel_edit_patch", "Edit Patch") :
              sidePanelMode === 'edit_dlc' ? t("panel_edit_dlc", "Edit DLC Pack") :
                t("panel_add_dlc", "Register DLC")
        }
        subtitle={sidePanelMode?.includes('version') ? t("panel_sub_version", "Game Version Registry") : t("dlc_registry", "DLC Registry")}
        icon={sidePanelMode?.includes('version') ? "gamepad" : "extension"}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && (
              <PanelHeaderButton
                icon="delete"
                variant="danger"
                tooltip={isPanelSubmitting ? t("ui_btn_processing", "Processing...") : t("purge", "Purge")}
                disabled={!panelReason.trim() || isPanelSubmitting}
                onClick={() => handlePanelCommit(true)}
              />
            )}
            <PanelHeaderButton
              icon="save"
              variant="accent"
              tooltip={isPanelSubmitting ? t("ui_btn_processing", "Processing...") : t("ui_btn_commit", "Commit")}
              disabled={isCommitDisabled}
              onClick={() => handlePanelCommit(false)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={sidePanelMode?.includes('version') ? "gamepad" : "extension"}
            overline={sidePanelMode?.includes('version') ? t("sa_game_versions", "Game Versions") : t("dlc_registry", "DLC Registry")}
            title={
              (sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && panelTarget
                ? (panelTarget?.name || panelTarget)
                : sidePanelMode === 'add_version'
                  ? t("btn_register_patch_naked", "Register Patch")
                  : t("panel_add_dlc", "Register DLC")
            }
            description={t("game_management_subtitle", "Manage patches, versions, and DLCs")}
            badge={sidePanelMode?.includes('edit') ? t("ql_targeting", "Editing") : t("ql_add", "New Entry")}
            badgeIcon={sidePanelMode?.includes('edit') ? "edit" : "add"}
            variant="accent"
          />

          {(sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && (
            <UniversalGroup title={t("sa_game_versions", "Version Details")} icon="gamepad">
              <div className="flex flex-col gap-1.5 relative z-10">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("game_version", "Game Version")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_gamepad", "gamepad")}</span>
                  <input
                    value={panelInput1}
                    onChange={e => setPanelInput1(e.target.value)}
                    placeholder={t("ph_game_version", "e.g. 1.108.318")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>
          )}

          {(sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (
            <UniversalGroup title={t("dlc_registry", "DLC Pack Configuration")} icon="extension">
              <div className="flex flex-col gap-1.5 relative z-50">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("dlc_id_code", "DLC Pack Code")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_fingerprint", "fingerprint")}</span>
                  <input
                    value={panelInput1}
                    onChange={e => setPanelInput1(e.target.value)}
                    placeholder={t("ph_pack_code", "e.g. EP01")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all uppercase"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 relative z-40">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("pack_type", "Pack Type")}</label>
                <CustomDropdown disableTint={true}
                  value={panelInput3}
                  onChange={(v: string[]) => setPanelInput3(v[0])}
                  options={[
                    ...[...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: t(`dlc_type_${x.toLowerCase().replace(/ /g, '_')}`, `${x} PACK`) })),
                    { id: "CUSTOM", label: t("auto_new_pack_type", "+ CUSTOM TYPE") }
                  ]}
                  placeholder={t("auto_select_type", "Select Type")}
                />
              </div>

              {panelInput3 === "CUSTOM" && (
                <div className="flex flex-col gap-1.5 relative z-30 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_edit", "edit")}</span>
                    {t("auto_new_pack_type", "New Pack Type")}
                  </label>
                  <input
                    value={panelInput4}
                    onChange={e => setPanelInput4(e.target.value.toUpperCase())}
                    placeholder={t("ph_pack_type", "e.g. SP")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all uppercase"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5 relative z-20">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("pack_name", "Pack Name")}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 !text-[18px]">{t("icon_badge", "badge")}</span>
                  <input
                    value={panelInput2}
                    onChange={e => setPanelInput2(e.target.value)}
                    placeholder={t("ph_pack_name", "e.g. Get to Work")}
                    className="w-full glass-surface rounded-xl pl-10 pr-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>
            </UniversalGroup>
          )}

          <UniversalGroup
            title={t("audit_reason_req", "Audit Reason Required")}
            icon="gavel"
            headerColorClass="text-[var(--danger)]"
          >
            <UniversalTextArea
              label={`${t("audit_reason_req", "Audit Reason Required")} *`}
              value={panelReason}
              onChange={setPanelReason}
              placeholder={t("mutation_reason", "Enter reason for mutation...")}
            />
          </UniversalGroup>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}
