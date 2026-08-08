import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass, ActionButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, loadDLCMap } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
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
  const [activeTab, setActiveTab] = useState<'versions' | 'dlc'>('versions');

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
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Deleted Game Version ${panelTarget}`, target_table: 'game_versions', target_name: panelTarget, actor_id: userRes.data.user?.id, reason: panelReason
        }});
        useStore.getState().pushStatus(`Deleted Game Version ${panelTarget}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_delete_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_id: panelTarget.id });
        await loadDLCMap();
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Deleted DLC Pack ${panelTarget.id}`, target_table: 'dlc_registry', target_name: panelTarget.id, actor_id: userRes.data.user?.id, reason: panelReason
        }});
        useStore.getState().pushStatus(`Deleted DLC Pack ${panelTarget.id}`, "success");
        fetchDlcs();
      }
    } else {
      if (sidePanelMode === 'add_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Added Game Version ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
        }});
        useStore.getState().pushStatus(`Added Game Version ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_version') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'game_versions', p_payload: { version: panelInput1 } });
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Edited Game Version ${panelTarget} -> ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
        }});
        useStore.getState().pushStatus(`Edited Game Version ${panelTarget} -> ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'add_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
        }});
        useStore.getState().pushStatus(`Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'dlc_registry', p_payload: { id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType } });
        await loadDLCMap();
        await supabase.rpc('secure_upsert_cloud_file', { p_token: useStore.getState().session?.access_token || '', p_target: 'audit_logs', p_payload: {
          action: `Edited DLC Pack [${panelTarget.id}] -> [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
        }});
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

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex flex-col lg:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl glass-panel border border-[var(--accent)]/[30%] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_settings")}</span>
          </div>
          <span className="truncate">{t("ql_game_versions")}</span>
        </h2>

        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input
              type="text"
              placeholder={activeTab === 'versions' ? "Search Patches..." : "Search DLC..."}
              value={activeTab === 'versions' ? versionSearch : dlcSearch}
              onChange={e => activeTab === 'versions' ? setVersionSearch(e.target.value) : setDlcSearch(e.target.value)}
              className="w-full glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          {activeTab === 'dlc' && (
            <div className="w-max min-w-[192px] max-w-xs z-40 shrink-0">
              <CustomDropdown disableTint={true}
                value={dlcTypeFilter}
                onChange={(v: string[]) => setDlcTypeFilter(v[0])}
                options={["ALL", ...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: x === "ALL" ? "ALL TYPES" : x }))}
                placeholder={t("gm_type_filter_placeholder")}
              />
            </div>
          )}

          <div className="flex items-stretch overflow-hidden glass-panel rounded-xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] h-12 shrink-0 z-40">
            <button
              onClick={() => setActiveTab("versions")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'versions' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
            >
              {t("sa_game_versions")}
            </button>
            <button
              onClick={() => setActiveTab("dlc")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'dlc' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
            >
              {t("dlc_registry")}
            </button>
          </div>

          <ActionButton
            onClick={() => openPanel(activeTab === 'versions' ? 'add_version' : 'add_dlc')}
            className="shrink-0 h-12 px-6 font-black uppercase tracking-widest text-[10px]"
            icon={t("icon_add")}
            label={activeTab === 'versions' ? "REGISTER PATCH" : `REGISTER DLC`}
          />
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-8 animate-in fade-in">

        {activeTab === 'versions' && (
          <>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
              {filteredVersions.map(v => (
                <UniversalCard
                  key={v.version}
                  onClick={() => openPanel('edit_version', v.version)}
                  layout="vertical"
                  icon="gamepad"
                  title={v.version}
                  subtitle={t("patch_release")}
                  footer={
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                        <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                        {v.release_date ? new Date(v.release_date).toLocaleDateString() : (v.created_at ? new Date(v.created_at).toLocaleDateString() : "UNKNOWN")}
                      </span>
                      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                        {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                      </button>
                    </div>
                  }
                />
              ))}
              {filteredVersions.length === 0 && <EmptyState icon={t("icon_gamepad") || "gamepad"} title={t("no_versions")} className="col-span-full py-16" />}
            </div>
          </>
        )}

        {activeTab === 'dlc' && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
              {filteredDlcs.map(d => (
                <UniversalCard
                  key={d.id}
                  onClick={() => openPanel('edit_dlc', d)}
                  layout="vertical"
                  icon="extension"
                  title={d.name}
                  subtitle={d.type ? (t(`sa_dlc_type_${d.type.toLowerCase().replace(/ /g, '_')}`) || `${d.type}PACK`) : "UNKNOWN"}
                  badges={[
                    <span key="dlc-id" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20">
                      {d.id}
                    </span>
                  ]}
                  footer={
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                        <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                        {d.release_date ? new Date(d.release_date).toLocaleDateString() : d.id}
                      </span>
                      <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                        {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                      </button>
                    </div>
                  }
                />
              ))}
              {filteredDlcs.length === 0 && <EmptyState icon={t("icon_extension_off") || "extension_off"} title={t("no_dlc")} className="col-span-full py-16" />}
            </div>
          </>
        )}

      </div>

      <SidePanel
        isOpen={!!sidePanelMode}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === 'add_version' ? (t("btn_register_patch_naked")) :
            sidePanelMode === 'edit_version' ? (t("panel_edit_patch")) :
              sidePanelMode === 'edit_dlc' ? (t("panel_edit_dlc")) :
                (t("panel_add_dlc"))
        }
        subtitle={sidePanelMode?.includes('version') ? (t("panel_sub_version")) : (t("dlc_registry"))}
        icon={sidePanelMode?.includes('version') ? "gamepad" : "extension"}
        footer={
          <div className="flex justify-center items-center gap-4 w-full px-8">
            {(sidePanelMode === 'add_version' || sidePanelMode === 'add_dlc') && (
              <ActionButton 
                onClick={() => setSidePanelMode(null)} 
                label={t("nav_cancel")}
                icon="close"
                className="flex-1"
              />
            )}
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && (
              <ActionButton
                disabled={!panelReason.trim() || isPanelSubmitting}
                onClick={() => handlePanelCommit(true)}
                label={isPanelSubmitting ? t("ui_btn_processing") : (t("purge") || "PURGE")}
                icon="delete"
                className="flex-1 !theme-bg-danger/20 !theme-text-danger !border-[var(--danger)]/50"
              />
            )}
            <ActionButton
              onClick={() => handlePanelCommit(false)}
              disabled={
                isPanelSubmitting ||
                !panelReason.trim() ||
                ((sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && !panelInput1.trim()) ||
                ((sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (!panelInput1.trim() || !panelInput2.trim()))
              }
              label={isPanelSubmitting ? (t("ui_btn_processing") || "PROCESSING...") : (t("ui_btn_commit") || "COMMIT CHANGES")}
              icon="save"
              className="flex-1 !theme-bg-success/20 !theme-text-success !border-[var(--success)]/50"
            />
          </div>
        }
      >
        <div className="p-8">
          <div className="flex flex-col gap-6">
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && panelTarget && (
              <div className="p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-80">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-1">{t("ql_targeting")}</p>
                <p className="text-sm font-bold theme-text-accent">{panelTarget?.name || panelTarget}</p>
              </div>
            )}

            {(sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && (
              <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2 relative z-10">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                  {t("metadata")}
                </h4>
                <div className="flex flex-col gap-2 relative z-10">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_version")}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("icon_gamepad")}</span>
                    <input
                      value={panelInput1}
                      onChange={e => setPanelInput1(e.target.value)}
                      placeholder={t("ph_game_version")}
                      className="glass-surface rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {(sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (
              <div className="flex flex-col gap-6 p-6 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2 relative z-10">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_extension")}</span>
                  {t("dlc_metadata")}
                </h4>

                <div className="flex flex-col gap-2 relative z-50">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("dlc_id_code")}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("icon_fingerprint")}</span>
                    <input
                      value={panelInput1}
                      onChange={e => setPanelInput1(e.target.value)}
                      placeholder={t("ph_pack_code")}
                      className="glass-surface rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] uppercase bg-transparent"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 relative z-40">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("pack_type")}</label>
                  <CustomDropdown disableTint={true}
                    value={panelInput3}
                    onChange={(v: string[]) => setPanelInput3(v[0])}
                    options={[
                      ...[...new Set(dlcs.map(d => d.type))].filter(Boolean).map(x => ({ id: x, label: t(`sa_dlc_type_${x.toLowerCase().replace(/ /g, '_')}`) || `${x} PACK` })),
                      { id: "CUSTOM", label: "+ CUSTOM TYPE" }
                    ]}
                    placeholder={t("auto_select_type")}
                  />
                </div>

                {panelInput3 === "CUSTOM" && (
                  <div className="flex flex-col gap-2 relative z-30 animate-in fade-in slide-in-from-top-2">
                    <label className="text-[9px] font-black theme-text-accent uppercase tracking-widest ml-2 flex items-center gap-2 drop-shadow-md">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_edit")}</span>
                      {t("auto_new_pack_type")}
                    </label>
                    <div className="relative">
                      <input
                        value={panelInput4}
                        onChange={e => setPanelInput4(e.target.value.toUpperCase())}
                        placeholder={t("ph_pack_type")}
                        className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] uppercase bg-[var(--accent)]/[5%]"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 relative z-30">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("pack_name")}</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 text-sm">{t("icon_badge")}</span>
                    <input
                      value={panelInput2}
                      onChange={e => setPanelInput2(e.target.value)}
                      placeholder={t("ph_pack_name")}
                      className="glass-surface rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-[color-mix(in_srgb,var(--text)_5%,transparent)] uppercase bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}


            <div className="flex flex-col gap-2 mt-4">
              <label className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest ml-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_var(--danger)]"></span>
                {t("audit_reason_req")}
              </label>
              <textarea
                value={panelReason}
                onChange={e => setPanelReason(e.target.value)}
                placeholder={t("mutation_reason")}
                className="glass-surface rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none focus:theme-border-danger transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
              />
            </div>

          </div>
        </div>
      </SidePanel>
    </div>
  );
}


