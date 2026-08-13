import { SearchBar } from "./shared";
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "./hub-components/SharedRegistry";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, HubTabButton, ModSearchDropdown, EmptyState, FilterTabs, FilterTabButton, ActionButton,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion, ScreenUtilityBar
} from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
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
      useStore.getState().pushStatus(t("auto_mod_successfully_linked_45"), "success");
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
      useStore.getState().pushStatus(t("auto_vault_path_not_30"), "error");
      return;
    }

    try {
      setIsImporting(true);
      const selected = await open({
        multiple: true,
        filters: [{ name: "Artifacts & Configs", extensions: [...(useStore.getState().activeGameSchema?.extensions?.supported?.map((e: string) => e.replace('.', '')) || ["package", "ts4script"]), "zip", "txt", "js", "ts", "xml", "json", "cfg", "ini", "html", "css"] }]
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
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_45"), "error");
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
        folder_structure: activeMod.folder_structure || [],
        is_paid: activeMod.is_paid || false,
        is_early_access: activeMod.is_early_access || false,
        latest_version: activeMod.latest_version || "v1.0"
      }]).select().single();

      if (insertError) throw insertError;

      const { error: versionError } = await supabase.from("mod_versions").upsert([
        {
          mod_id: newMod.id,
          dna_hash: activeMod.hash,
          version_label: activeMod.latest_version || "v1.0",
          game_version: activeMod.compatible_versions && activeMod.compatible_versions.length > 0 ? activeMod.compatible_versions[0] : null
        }
      ], { onConflict: "dna_hash" });

      if (versionError) throw versionError;

      useStore.getState().pushStatus(t("auto_mod_synced_to_39"), "success");
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
      let devLane = vDir.toLowerCase().endsWith("mods") || vDir.toLowerCase().endsWith("mods/") || vDir.toLowerCase().endsWith("mods\\")
        ? vDir.replace(/[\\/]Mods[\\/]?$/, "") + "/Dev/Sandbox"
        : vDir + "/Dev/Sandbox";

      const fullPath = `${devLane}/${activeMod.name}`;
      await invoke("delete_local_file", { path: fullPath });
      useStore.getState().pushStatus((t("purge")) + " " + activeMod.name, "success");
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
      <ScreenUtilityBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("search_ph") as string}
      >
        <>
          <div className="w-max min-w-[180px] max-w-xs shrink-0">
            <CustomDropdown
              disableTint={true}
              value={sandboxTypeFilter}
              onChange={(v: string[]) => setSandboxTypeFilter(v[0] as any)}
              options={[
                { id: "ALL", label: t("ql_all") },
                { id: "ARTIFACTS", label: t("items") },
                { id: "CONFIGS", label: t("type_configs") },
                { id: "TEMPLATES", label: t("ql_templates") }
              ]}
            />
          </div>
          <div className="flex items-stretch overflow-hidden glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner h-12 shrink-0 divide-x divide-white/5 mr-4 hidden md:flex">
            <button onClick={() => setSandboxTabFilter('local')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black capitalize tracking-widest transition-all ${sandboxTabFilter === 'local' ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("unlinked_badge")}</button>
            <button onClick={() => setSandboxTabFilter('synced')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black capitalize tracking-widest transition-all ${sandboxTabFilter === 'synced' ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>{t("synced_badge")}</button>
          </div>
          <ActionButton
            onClick={handleImportToSandbox}
            disabled={isImporting}
            icon={isImporting ? t("icon_refresh") : t("icon_download")}
            label={isImporting ? t("btn_importing") : t("btn_import")}
            className="h-12 px-6 shrink-0 font-black capitalize tracking-widest text-[10px]"
          />
        </>
      </ScreenUtilityBar>

      <div className="p-6 flex flex-col gap-10 pb-32 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50 capitalize font-black tracking-widest text-[var(--text)]">
            {t("scanning")}
          </div>
        ) : (
          <>
            {sandboxTabFilter === 'local' && (
              <div className="flex flex-col gap-6">
                {unlinkedMods.length === 0 ? (
                  <EmptyState icon={t("icon_folder_off")} title={t("empty")} className="col-span-full py-16" />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                    {unlinkedMods.map(mod => (
                      <UniversalCard
                        key={mod.hash}
                        onClick={() => { setActiveMod(mod); setIsEditorOpen(true); setConfirmPurge(false); }}
                        layout="vertical"
                        icon="folder_zip"
                        title={mod.name.split(/[\\/]/).pop()}
                        statusColor="border-[color-mix(in_srgb,var(--warning)_50%,transparent)]"
                        badges={[
                          <span key="badge" className="bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-orange-400 border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                            {t("unlinked_badge")}
                          </span>
                        ]}
                      >
                        <div className="flex flex-col gap-1 mt-auto pb-4">
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                        </div>
                      </UniversalCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sandboxTabFilter === 'synced' && (
              <div className="flex flex-col gap-6">
                {syncedMods.length === 0 ? (
                  <EmptyState icon={t("ui_icon_sync_disabled")} title={t("no_synced")} className="col-span-full py-16" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {syncedMods.map(mod => (
                      <UniversalCard
                        key={mod.hash}
                        onClick={() => { setActiveMod(mod); setIsEditorOpen(true); setConfirmPurge(false); }}
                        layout="vertical"
                        icon="cloud_done"
                        title={mod.name.split(/[\\/]/).pop()}
                        statusColor="border-[color-mix(in_srgb,var(--success)_50%,transparent)]"
                        isGhosted={true}
                        badges={[
                          <span key="badge" className="bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-emerald-400 border border-[color-mix(in_srgb,var(--success)_20%,transparent)] px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest shadow-inner shrink-0 transition-colors group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                            {t("synced_badge")}
                          </span>
                        ]}
                      >
                        <div className="flex flex-col gap-1 mt-auto pb-4">
                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
                        </div>
                      </UniversalCard>
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
                <ActionButton onClick={handlePurge} disabled={isCommitting} label={confirmPurge ? (t("ui_confirm_delete")) : (t("purge"))} className="!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]">

                </ActionButton>
                <ActionButton onClick={handleSyncToNetwork} disabled={isCommitting} label={isCommitting ? t("btn_syncing") : (t("sandbox_btn_sync"))}>

                </ActionButton>
              </div>
            }
          >
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_modname")}</label>
                <input value={activeMod.name || ""} onChange={e => setActiveMod({ ...activeMod, name: e.target.value })} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category")}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({ ...activeMod, category_override: val })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_file_ext")}</label>
                  <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({ ...activeMod, file_extension: e.target.value })} placeholder={t("placeholder_file_ext")} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_subclass")}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({ ...activeMod, sub_type: e.target.value })} placeholder={t("placeholder_subclass")} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] placeholder-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url")}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({ ...activeMod, url: e.target.value })} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc")}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({ ...activeMod, description: e.target.value })} className="w-full glass-panel rounded-[var(--radius)] px-6 py-5 text-[var(--text)] text-sm font-bold min-h-[150px] custom-scrollbar resize-none focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url")}</label>
                  <input value={activeMod.image_url || ""} onChange={e => setActiveMod({ ...activeMod, image_url: e.target.value })} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_condition")}</label>
                  <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("uploaded_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={date => setActiveMod({ ...activeMod, created_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("updated_date")}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={date => setActiveMod({ ...activeMod, updated_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-1">
                    {t("label_mason_version")}
                  </label>
                  <input value={activeMod.latest_version || ""} onChange={e => setActiveMod({ ...activeMod, latest_version: e.target.value })} placeholder={t("ph_mod_version")} className="w-full glass-panel rounded-2xl px-5 h-12 text-[var(--text)] text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-inner" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 col-span-full">
                  <label className={`w-full glass-panel rounded-2xl px-5 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${activeMod.is_paid ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                    <span className={`text-xs font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${activeMod.is_paid ? 'text-yellow-500' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_monetization_on")}</span>
                      {t("label_is_paid")}
                    </span>
                    <div className={`w-10 h-6 rounded-full transition-colors relative shadow-inner shrink-0 ${activeMod.is_paid ? 'bg-yellow-500' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                      <div className={`w-4 h-4 rounded-full bg-[var(--bg)] absolute top-1 transition-transform shadow-md flex items-center justify-center ${activeMod.is_paid ? 'translate-x-5' : 'translate-x-1'}`}>
                      </div>
                    </div>
                    <input type="checkbox" checked={activeMod.is_paid || false} onChange={e => setActiveMod({ ...activeMod, is_paid: e.target.checked })} className="hidden" />
                  </label>

                  <label className={`w-full glass-panel rounded-2xl px-5 h-12 flex items-center justify-start cursor-pointer transition-all border shadow-inner group hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] ${activeMod.is_early_access ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}>
                    <span className={`text-xs font-black capitalize tracking-widest transition-colors flex items-center gap-2 ${activeMod.is_early_access ? 'text-purple-500' : 'text-[var(--subtext)] group-hover:text-[var(--text)]'}`}>
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_science")}</span>
                      {t("label_is_early_access")}
                    </span>
                    <div className={`w-10 h-6 rounded-full transition-colors relative shadow-inner shrink-0 ${activeMod.is_early_access ? 'bg-purple-500' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                      <div className={`w-4 h-4 rounded-full bg-[var(--bg)] absolute top-1 transition-transform shadow-md flex items-center justify-center ${activeMod.is_early_access ? 'translate-x-5' : 'translate-x-1'}`}>
                      </div>
                    </div>
                    <input type="checkbox" checked={activeMod.is_early_access || false} onChange={e => setActiveMod({ ...activeMod, is_early_access: e.target.checked })} className="hidden" />
                  </label>
                </div>

                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("game_versions")}</label>
                  <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({ ...activeMod, compatible_versions: v })} />
                </div>
              </div>

              <div className="mt-auto shrink-0 pt-8 pb-4 flex flex-col gap-4">
                {existingHashes.has(activeMod.hash) && (
                  <div className="glass-panel border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] px-6 py-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-black text-green-400 capitalize tracking-widest flex items-center justify-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span> {t("already_synced")}</span>
                    <p className="text-[10px] text-[var(--subtext)] mt-1 font-bold">{t("already_synced_desc")}</p>
                  </div>
                )}
                <div className="flex justify-end gap-4 mt-2">
                  <button onClick={() => setIsLinkModalOpen(true)} disabled={isCommitting} className="flex-1 py-4 font-black text-xs capitalize tracking-widest rounded-2xl transition-all duration-300 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] disabled:opacity-50 flex items-center justify-center gap-2">
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
              className="w-full glass-panel rounded-2xl pl-10 pr-5 h-12 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] placeholder:opacity-40 shadow-inner"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
            {existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 ? (
              <EmptyState icon={t("icon_search_off")} title={t("link_no_results")} className="py-8" />
            ) : (
              existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).map(m => (
                <button
                  key={m.id}
                  onClick={() => handleLinkToExisting(m.id)}
                  className="w-full text-left p-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] transition-all duration-300 group flex items-center justify-start"
                >
                  <span className="font-black text-xs text-[var(--text)] capitalize tracking-tight truncate mr-4 group-hover:text-[var(--accent)] transition-colors">{m.name}</span>
                  <span className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span> {t("btn_link_existing")}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
