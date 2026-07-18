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
  fetchAllPaginated, CustomTierDropdown, loadDLCMap } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
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
        await supabase.from('game_versions').delete().eq('version', panelTarget);
        await supabase.from('audit_logs').insert({
          action: `Deleted Game Version ${panelTarget}`, target_table: 'game_versions', target_name: panelTarget, actor_id: userRes.data.user?.id, reason: panelReason
        });
        useStore.getState().pushStatus(`Deleted Game Version ${panelTarget}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.from('dlc_registry').delete().eq('id', panelTarget.id);
        await loadDLCMap();
        await supabase.from('audit_logs').insert({
          action: `Deleted DLC Pack ${panelTarget.id}`, target_table: 'dlc_registry', target_name: panelTarget.id, actor_id: userRes.data.user?.id, reason: panelReason
        });
        useStore.getState().pushStatus(`Deleted DLC Pack ${panelTarget.id}`, "success");
        fetchDlcs();
      }
    } else {
      if (sidePanelMode === 'add_version') {
        await supabase.from('game_versions').insert([{ version: panelInput1 }]);
        await supabase.from('audit_logs').insert({
          action: `Added Game Version ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
        });
        useStore.getState().pushStatus(`Added Game Version ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'edit_version') {
        await supabase.from('game_versions').update({ version: panelInput1 }).eq('version', panelTarget);
        await supabase.from('audit_logs').insert({
          action: `Edited Game Version ${panelTarget} -> ${panelInput1}`, target_table: 'game_versions', target_name: panelInput1, actor_id: userRes.data.user?.id, reason: panelReason
        });
        useStore.getState().pushStatus(`Edited Game Version ${panelTarget} -> ${panelInput1}`, "success");
        fetchVersions();
      } else if (sidePanelMode === 'add_dlc') {
        await supabase.from('dlc_registry').insert([{ id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType }]);
        await loadDLCMap();
        await supabase.from('audit_logs').insert({
          action: `Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
        });
        useStore.getState().pushStatus(`Added DLC Pack [${panelInput1.toUpperCase()}] ${panelInput2}`, "success");
        fetchDlcs();
      } else if (sidePanelMode === 'edit_dlc') {
        await supabase.from('dlc_registry').update({ id: panelInput1.toUpperCase(), name: panelInput2, type: resolvedType }).eq('id', panelTarget.id);
        await loadDLCMap();
        await supabase.from('audit_logs').insert({
          action: `Edited DLC Pack [${panelTarget.id}] -> [${panelInput1.toUpperCase()}] ${panelInput2}`, target_table: 'dlc_registry', target_name: panelInput1.toUpperCase(), actor_id: userRes.data.user?.id, reason: panelReason
        });
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
      <div className="flex flex-col lg:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
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
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
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

          <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 h-12 shrink-0 z-40">
            <button
              onClick={() => setActiveTab("versions")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'versions' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("sa_game_versions")}
            </button>
            <button
              onClick={() => setActiveTab("dlc")}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'dlc' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("dlc_registry")}
            </button>
          </div>

          <button
            onClick={() => openPanel(activeTab === 'versions' ? 'add_version' : 'add_dlc')}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group"
          >
            <span className="material-symbols-outlined !text-[16px] group-hover:rotate-90 transition-transform duration-500">{t("icon_add")}</span>
            {activeTab === 'versions' ? "REGISTER PATCH" : `REGISTER DLC`}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-8 animate-in fade-in">

        {activeTab === 'versions' && (
          <>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
              {filteredVersions.map(v => (
                <div key={v.version} onClick={() => openPanel('edit_version', v.version)} className="flex flex-col justify-between p-6 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[140px] cursor-pointer hover:-translate-y-1.5">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="flex justify-between items-start w-full relative z-10 mb-4">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                        <span className="material-symbols-outlined !text-[28px] theme-text-accent drop-shadow-md">{t("icon_gamepad")}</span>
                      </div>
                      <div className="flex flex-col pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">{t("patch_release")}</span>
                        <span className="text-xl font-mono font-black text-[var(--text)] group-hover:theme-text-accent transition-colors truncate drop-shadow-sm">{v.version}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("released")}</span>
                      <span className="text-xs font-bold text-[var(--text)] opacity-90 mt-1">
                        {v.release_date ? new Date(v.release_date).toLocaleDateString() : (v.created_at ? new Date(v.created_at).toLocaleDateString() : "UNKNOWN")}
                      </span>
                    </div>

                    <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                      {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                    </button>
                  </div>
                </div>
              ))}
              {filteredVersions.length === 0 && <EmptyState icon={t("icon_gamepad") || "gamepad"} title={t("no_versions")} className="col-span-full py-16" />}
            </div>
          </>
        )}

        {activeTab === 'dlc' && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 w-full">
              {filteredDlcs.map(d => (
                <div key={d.id} onClick={() => openPanel('edit_dlc', d)} className="flex flex-col justify-between p-6 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[140px] cursor-pointer hover:-translate-y-1.5">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="flex justify-between items-start w-full relative z-10 mb-2">
                    <div className="flex items-start gap-4 w-full truncate">
                      <div className="w-14 h-14 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-transparent pointer-events-none" />
                        <span className="relative z-10 text-sm font-black theme-text-accent drop-shadow-md tracking-wider">{d.id}</span>
                      </div>
                      <div className="flex flex-col truncate pt-1 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1">
                          {d.type ? (t(`sa_dlc_type_${d.type.toLowerCase().replace(/ /g, '_')}`) || `${d.type}PACK`) : "UNKNOWN"}
                        </span>
                        <span className="text-lg font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors drop-shadow-sm pr-4">{d.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[8px] font-black tracking-widest text-[var(--subtext)] opacity-50 uppercase">{t("released")}</span>
                      <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-[var(--text)] opacity-70 group-hover:opacity-100 transition-opacity">
                        {d.release_date ? new Date(d.release_date).toLocaleDateString() : d.id}
                      </span>
                    </div>
                    <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                      {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                    </button>
                  </div>
                </div>
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
          <div className="flex justify-center items-center gap-4 w-full">
            {(sidePanelMode === 'add_version' || sidePanelMode === 'add_dlc') && (
              <button onClick={() => setSidePanelMode(null)} className={standardButtonClass}>
                {t("nav_cancel")}
              </button>
            )}
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && (
              <button
                disabled={!panelReason.trim() || isPanelSubmitting}
                onClick={() => handlePanelCommit(true)}
                className={standardDangerButtonClass}
              >
                {isPanelSubmitting ? t("ui_btn_processing") : (t("purge"))}
              </button>
            )}
            <button
              onClick={() => handlePanelCommit(false)}
              disabled={
                isPanelSubmitting ||
                !panelReason.trim() ||
                ((sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && !panelInput1.trim()) ||
                ((sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (!panelInput1.trim() || !panelInput2.trim()))
              }
              className={standardSuccessButtonClass}
            >
              {isPanelSubmitting ? (t("ui_btn_processing")) : (t("ui_btn_commit"))}
            </button>
          </div>
        }
      >
        <div className="p-8">
          <div className="flex flex-col gap-6">
            {(sidePanelMode === 'edit_version' || sidePanelMode === 'edit_dlc') && panelTarget && (
              <div className="p-4 theme-glass-inner rounded-xl border border-white/5 opacity-80">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] mb-1">{t("ql_targeting")}</p>
                <p className="text-sm font-bold theme-text-accent">{panelTarget?.name || panelTarget}</p>
              </div>
            )}

            {(sidePanelMode === 'add_version' || sidePanelMode === 'edit_version') && (
              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2 relative z-10">
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
                      className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 bg-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {(sidePanelMode === 'add_dlc' || sidePanelMode === 'edit_dlc') && (
              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2 relative z-10">
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
                      className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-transparent"
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
                        className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
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
                      className="theme-glass-inner rounded-xl pl-10 pr-5 py-4 text-[var(--text)] text-sm font-black focus:outline-none focus:theme-border-accent transition-all w-full border border-white/5 uppercase bg-transparent"
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
                className="theme-glass-inner rounded-xl px-5 py-4 text-[var(--text)] text-sm font-bold h-32 resize-none focus:outline-none focus:theme-border-danger transition-all border border-white/5"
              />
            </div>

          </div>
        </div>
      </SidePanel>
    </div>
  );
}


