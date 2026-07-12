import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion } from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import MasonPostViewer from "./side-panels/MasonPostViewer";


export function MasonSandbox({ masonId, initialSandboxMod, onClear, vaultPath }: { masonId: string, initialSandboxMod: any, onClear: any, vaultPath?: string }) {
  const { t } = useLexicon();
  const [activeMod, setActiveMod] = useState<any>(initialSandboxMod || null);
  const [sandboxMods, setSandboxMods] = useState<any[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [existingMods, setExistingMods] = useState<any[]>([]);
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [linkSearch, setLinkSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sandboxTabFilter, setSandboxTabFilter] = useState<'local' | 'synced'>('local');
  const [sandboxTypeFilter, setSandboxTypeFilter] = useState<'ALL' | 'ARTIFACTS' | 'CONFIGS' | 'TEMPLATES'>('ALL');
  const [confirmPurge, setConfirmPurge] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(!!initialSandboxMod);

  const fetchExistingMods = async () => {
    const { data } = await supabase.from('mods').select('id, name, mod_versions(dna_hash)').eq('mason_id', masonId).order('name');
    if (data) {
      setExistingMods(data);
      const hashes = new Set<string>();
      data.forEach(m => {
        if (m.mod_versions) {
          m.mod_versions.forEach((v: any) => {
            if (v.dna_hash) hashes.add(v.dna_hash);
          });
        }
      });
      setExistingHashes(hashes);
    }
  };

  useEffect(() => {
    fetchExistingMods();
  }, [masonId]);

  const handleLinkToExisting = async (modId: string) => {
    if (!activeMod || !activeMod.hash) return;
    setIsCommitting(true);
    try {
      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: modId,
          dna_hash: activeMod.hash,
          version_label: "New Update",
          game_version: activeMod.compatible_versions && activeMod.compatible_versions.length > 0 ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });

      if (versionError) throw versionError;

      await invoke('mark_mod_synced', { hash: activeMod.hash, dbId: modId });
      useStore.getState().pushStatus(t("auto_mod_successfully_linked_to_existing_reco"), "success");
      setIsLinkModalOpen(false);
      setIsEditorOpen(false);
      fetchExistingMods();
      if (onClear) onClear();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error linking mod: ${err.message}`, 'error');
    }
    setIsCommitting(false);
  };

  const fetchSandboxMods = async () => {
    if (!vaultPath) return;
    try {
      setIsLoading(true);
      const mods = await invoke<any[]>("scan_sandbox", { vaultPath });
      setSandboxMods(mods);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialSandboxMod) {
      setActiveMod(initialSandboxMod);
      setIsEditorOpen(true);
    }
    fetchSandboxMods();
  }, [initialSandboxMod, vaultPath]);

  const handleImportToSandbox = async () => {
    if (!vaultPath) {
      useStore.getState().pushStatus(t("auto_vault_path_not_configured"), "error");
      return;
    }

    try {
      setIsImporting(true);
      const selected = await open({
        multiple: true,
        filters: [{ name: "Artifacts & Configs", extensions: [...(useStore.getState().activeGameSchema?.extensions?.supported?.map((e: string) => e.replace('.','')) || ["package", "ts4script"]), "zip", "txt", "js", "ts", "xml", "json", "cfg", "ini", "html", "css"] }]
      });

      if (!selected || (Array.isArray(selected) && selected.length === 0)) {
        setIsImporting(false);
        return;
      }

      const files = Array.isArray(selected) ? selected : [selected];

      const importedCount = await invoke<number>("import_to_sandbox", { files, vaultPath });

      useStore.getState().pushStatus(`Imported ${importedCount} file(s) to Sandbox!`, "success");
      await fetchSandboxMods();
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(`Failed to import to Sandbox: ${err.message || String(err)}`, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncToNetwork = async () => {
    if (!activeMod || !activeMod.hash) {
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_mod_selected_or_missing"), "error");
      return;
    }
    setIsCommitting(true);
    try {
      const { data: newMod, error: insertError } = await supabase.from('mods').insert([{
        name: activeMod.name || "Unknown Sandbox Mod",
        mason_id: masonId,
        description: activeMod.description || "",
        image_url: activeMod.image_url || null,
        url: activeMod.url || null,
        allow_write: activeMod.allow_write || false,
        category_override: activeMod.category_override || activeMod.type || null,
        sub_type: activeMod.sub_type || null,
        file_extension: activeMod.file_extension || null,
        status: activeMod.status || 'unverified',
        created_at: activeMod.created_at || new Date().toISOString(),
        updated_at: activeMod.updated_at || new Date().toISOString(),
        compatible_versions: activeMod.compatible_versions || [],
        folder_structure: activeMod.folder_structure || []
      }]).select().single();

      if (insertError) throw insertError;

      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: newMod.id,
          dna_hash: activeMod.hash,
          version_label: "v1.0",
          game_version: activeMod.compatible_versions && activeMod.compatible_versions.length > 0 ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });

      if (versionError) throw versionError;

      useStore.getState().pushStatus(t("auto_mod_synced_to_network_successfully"), "success");
      setIsEditorOpen(false);
      fetchExistingMods();
      if (onClear) onClear();
    } catch (err: any) {
      useStore.getState().pushStatus(`Error syncing to network: ${err.message}`, 'error');
    }
    setIsCommitting(false);
  };

  const handlePurge = async () => {
    if (!activeMod) return;
    if (!confirmPurge) {
      setConfirmPurge(true);
      setTimeout(() => setConfirmPurge(false), 3000);
      return;
    }

    try {
      let vDir = vaultPath || "";
      let devLane = vDir.endsWith("Mods") || vDir.endsWith("Mods/") || vDir.endsWith("Mods\\")
        ? vDir.replace(/[\\/]Mods[\\/]?$/, "") + "/Dev/Sandbox"
        : vDir + "/Dev/Sandbox";

      const fullPath = `${devLane}/${activeMod.name}`;
      await invoke("delete_local_file", { path: fullPath });
      useStore.getState().pushStatus((t("purge") || "Deleted") + " " + activeMod.name, "success");
      setIsEditorOpen(false);
      setConfirmPurge(false);
      fetchSandboxMods();
    } catch (e: any) {
      useStore.getState().pushStatus(`Failed to delete: ${e}`, "error");
    }
  };

  const searchFilter = (m: any) => {
    if (searchTerm && !m.name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;

    const nameLower = m.name?.toLowerCase() || "";
    if (sandboxTypeFilter === 'ARTIFACTS') {
      return !nameLower.endsWith('.ini') && !nameLower.endsWith('.cfg') && !nameLower.endsWith('.json');
    }
    if (sandboxTypeFilter === 'CONFIGS') {
      return nameLower.endsWith('.ini') || nameLower.endsWith('.cfg');
    }
    if (sandboxTypeFilter === 'TEMPLATES') {
      return nameLower.endsWith('.json');
    }

    return true;
  };
  const syncedMods = sandboxMods.filter(m => existingHashes.has(m.hash) && searchFilter(m));
  const unlinkedMods = sandboxMods.filter(m => !existingHashes.has(m.hash) && searchFilter(m));

  return (
    <div className="flex flex-col w-full relative">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_handyman")}</span>
          </div>
          <span className="truncate">{t("sandbox_title")}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t("vault_search")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
              </button>
            )}
          </div>
          <div className="w-max min-w-[180px] max-w-xs shrink-0">
            <CustomDropdown
              disableTint={true}
              value={sandboxTypeFilter}
              onChange={(v: string[]) => setSandboxTypeFilter(v[0] as any)}
              options={[
                { id: "ALL", label: t("ql_all") || "ALL" },
                { id: "ARTIFACTS", label: t("items") || "ARTIFACTS" },
                { id: "CONFIGS", label: t("type_configs") || "CONFIGS" },
                { id: "TEMPLATES", label: t("ql_templates") || "TEMPLATES" }
              ]}
            />
          </div>
          <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl border border-white/5 shadow-inner h-12 shrink-0 hidden md:flex mr-4 divide-x divide-white/5">
            <button onClick={() => setSandboxTabFilter('local')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${sandboxTabFilter === 'local' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("unlinked_badge") || "LOCAL"}</button>
            <button onClick={() => setSandboxTabFilter('synced')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${sandboxTabFilter === 'synced' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("synced_badge") || "SYNCED"}</button>
          </div>
          <button
            onClick={handleImportToSandbox}
            disabled={isImporting}
            className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:scale-105 shadow-lg font-black uppercase tracking-widest text-[10px] group disabled:opacity-50"
          >
            {isImporting ? <span className="material-symbols-outlined !text-[16px] animate-spin">{t("icon_refresh")}</span> : <span className="material-symbols-outlined !text-[16px] group-hover:-translate-y-0.5 transition-transform">{t("icon_download")}</span>}
            {isImporting ? t("btn_importing") : t("btn_import")}
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-10 pb-32 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50 uppercase font-black tracking-widest text-[var(--text)]">
            {t("scanning")}
          </div>
        ) : (
          <>
            {sandboxTabFilter === 'local' && (
              <div className="flex flex-col gap-6">
                <h3 className="text-lg font-black text-[var(--text)] uppercase tracking-widest px-2 opacity-80">
                  {t("unlinked_badge")}
                </h3>
                {unlinkedMods.length === 0 ? (
                  <EmptyState icon={t("icon_folder_off") || "folder_off"} title={t("empty")} className="col-span-full py-16" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {unlinkedMods.map(mod => (
                      <button
                        key={mod.hash}
                        onClick={() => { setActiveMod(mod); setIsEditorOpen(true); setConfirmPurge(false); }}
                        className="theme-glass-panel rounded-[var(--radius)] relative group flex flex-col text-left overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-orange-500/50 hover:shadow-[0_0_40px_rgba(249,115,22,0.15)] transition-all duration-500 hover:-translate-y-1.5 bg-gradient-to-br from-white/5 to-transparent min-h-[160px]"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/50 transition-all duration-500 group-hover:bg-orange-500 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.5)]" />

                        <div className="p-6 flex flex-col gap-4 relative z-10 w-full h-full">
                          <div className="flex justify-between items-start w-full">
                            <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-orange-500/30">
                              <span className="material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">folder_zip</span>
                            </div>
                            <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-orange-500/20">
                              {t("unlinked_badge")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 mt-auto">
                            <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate group-hover:text-orange-400 transition-colors">{mod.name.split(/[\\/]/).pop()}</h4>
                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sandboxTabFilter === 'synced' && (
              <div className="flex flex-col gap-6">
                <h3 className="text-lg font-black text-[var(--text)] uppercase tracking-widest px-2 opacity-80">
                  {t("synced_badge")}
                </h3>
                {syncedMods.length === 0 ? (
                  <EmptyState icon={t("ui_icon_sync_disabled") || "sync_disabled"} title={t("no_synced")} className="col-span-full py-16" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {syncedMods.map(mod => (
                      <button
                        key={mod.hash}
                        onClick={() => { setActiveMod(mod); setIsEditorOpen(true); setConfirmPurge(false); }}
                        className="theme-glass-panel rounded-[var(--radius)] relative group flex flex-col text-left overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] transition-all duration-500 hover:-translate-y-1.5 bg-gradient-to-br from-white/5 to-transparent min-h-[160px] opacity-80 hover:opacity-100"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/50 transition-all duration-500 group-hover:bg-emerald-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]" />

                        <div className="p-6 flex flex-col gap-4 relative z-10 w-full h-full">
                          <div className="flex justify-between items-start w-full">
                            <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-emerald-500/30">
                              <span className="material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">cloud_done</span>
                            </div>
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-emerald-500/20">
                              {t("synced_badge")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 mt-auto">
                            <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate group-hover:text-emerald-400 transition-colors">{mod.name.split(/[\\/]/).pop()}</h4>
                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isEditorOpen && activeMod && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            title={t("artifact_config")}
            subtitle={`${t("hash_prefix")} ${activeMod?.hash}`}
            icon="settings"
            widthClass="w-[600px]"
            backdropZ="z-[50000]"
            panelZ="z-[50001]"
            footer={
              <div className="flex justify-center items-center gap-4 w-full">
                <button onClick={handlePurge} disabled={isCommitting} className={standardButtonClass + (confirmPurge ? " !border-[var(--danger)] !text-[var(--danger)] !bg-[var(--danger)]/20 shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)]" : " !border-[var(--danger)]/30 !text-[var(--danger)] hover:!border-[var(--danger)]/60 hover:!bg-[var(--danger)]/10")}>
                  {confirmPurge ? (t("ui_confirm_delete") || "ARE YOU SURE?") : (t("ui_btn_purge") || "PURGE")}
                </button>
                <button onClick={handleSyncToNetwork} disabled={isCommitting} className={standardSuccessButtonClass}>
                  {isCommitting ? t("btn_syncing") : (t("sandbox_btn_sync"))}
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("placeholder_name")}</label>
                <input value={activeMod.name || ""} onChange={e => setActiveMod({ ...activeMod, name: e.target.value })} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_class")}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({ ...activeMod, category_override: val })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_file_ext")}</label>
                  <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({ ...activeMod, file_extension: e.target.value })} placeholder={t("placeholder_file_ext")} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_subclass")}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({ ...activeMod, sub_type: e.target.value })} placeholder={t("placeholder_subclass")} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("registry_label_url")}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({ ...activeMod, url: e.target.value })} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("upload_desc")}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({ ...activeMod, description: e.target.value })} className="w-full theme-glass-panel rounded-[var(--radius)] px-6 py-5 text-[var(--text)] text-sm font-bold min-h-[150px] custom-scrollbar resize-none focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("cc_cover_url")}</label>
                  <input value={activeMod.image_url || ""} onChange={e => setActiveMod({ ...activeMod, image_url: e.target.value })} className="w-full theme-glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all border border-white/5 hover:border-[var(--accent)]/30 shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("label_condition")}</label>
                  <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("uploaded_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={date => setActiveMod({ ...activeMod, created_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("updated_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={date => setActiveMod({ ...activeMod, updated_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("game_versions")}</label>
                  <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({ ...activeMod, compatible_versions: v })} />
                </div>
              </div>

              <div className="mt-auto shrink-0 pt-8 pb-4 flex flex-col gap-4">
                {existingHashes.has(activeMod.hash) && (
                  <div className="theme-glass-panel border-green-500/20 bg-green-500/5 px-6 py-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-black text-green-400 uppercase tracking-widest flex items-center justify-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span> {t("already_synced")}</span>
                    <p className="text-[10px] text-[var(--subtext)] mt-1 font-bold">{t("already_synced_desc")}</p>
                  </div>
                )}
                <div className="flex justify-end gap-4 mt-2">
                  <button onClick={() => setIsLinkModalOpen(true)} disabled={isCommitting} className="flex-1 py-4 font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-300 theme-glass-panel border border-white/5 text-[var(--text)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_link")}</span> {t("btn_link_existing")}
                  </button>
                </div>
              </div>
            </div>
          </SidePanel>
        </>
      )}

      <SidePanel
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={t("link_modal_title")}
        icon="link"
        widthClass="w-[450px]"
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
      >
        <div className="flex flex-col gap-6 h-full">
          <div className="shrink-0 relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
            <input
              type="text"
              placeholder={t("link_search")}
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 shadow-inner"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
            {existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 ? (
              <EmptyState icon={t("icon_search_off") || "search_off"} title={t("link_no_results")} className="py-8" />
            ) : (
              existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).map(m => (
                <button
                  key={m.id}
                  onClick={() => handleLinkToExisting(m.id)}
                  className="w-full text-left p-5 rounded-2xl theme-glass-panel border border-white/5 hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] hover:-translate-y-0.5 transition-all duration-300 group flex items-center justify-between"
                >
                  <span className="font-black text-xs text-[var(--text)] uppercase tracking-tight truncate mr-4 group-hover:text-[var(--accent)] transition-colors">{m.name}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span> {t("btn_link_existing")}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
