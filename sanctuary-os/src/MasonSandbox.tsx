
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
  standardDangerButtonClass, standardAccentGlassButtonClass, PanelHeaderGroup, PanelHeaderButton,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion, InlineFilterGroup
} from "./shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelPillToggle } from "./components/layouts/ElevatedHubLayout";
import { UniversalCard } from "./components/universal/UniversalCard";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";

import MasonPostViewer from "./side-panels/MasonPostViewer";


export function MasonSandbox({ masonId, masonName, isVerifiedMason = true, initialSandboxMod, onClear, vaultPath }: { masonId: string, masonName?: string, isVerifiedMason?: boolean, initialSandboxMod: any, onClear: any, vaultPath?: string }) {
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
  const [sandboxTabFilter, setSandboxTabFilter] = useState<'overview' | 'in_development' | 'local' | 'synced'>('overview');
  const [confirmPurge, setConfirmPurge] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(!!initialSandboxMod);

  const fetchExistingMods = async () => {
    if (!isVerifiedMason) return;
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
  }, [masonId, isVerifiedMason]);

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
      useStore.getState().pushStatus(t("auto_mod_successfully_linked_45") || "Mod linked!", "success");
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
      useStore.getState().pushStatus(t("auto_vault_path_not_30") || "Vault path not set", "error");
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

  const parseCsvList = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === "string") return val.split(",").map(v => v.trim()).filter(Boolean);
    return [];
  };

  const handleExportRelease = async () => {
    if (!activeMod) {
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_45") || "No valid sandbox mod", "error");
      return;
    }
    setIsCommitting(true);
    try {
      let previousHashes: string[] = parseCsvList(activeMod.previous_hashes_str);
      if (activeMod.id) {
        try {
          const { data: verData } = await supabase.from('mod_versions').select('dna_hash').eq('mod_id', activeMod.id);
          if (verData) {
            const dbHashes = verData.map((v: any) => v.dna_hash).filter(Boolean);
            previousHashes = Array.from(new Set([...previousHashes, ...dbHashes]));
          }
        } catch (e) {}
      }

      const safeNameSlug = (activeMod.name || "mod").replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
      const versionStr = (activeMod.latest_version || "1.0.0").trim();
      const customManifestUrl = (activeMod.manifest_url || "").trim();
      const customDownloadUrl = (activeMod.download_url || "").trim() || (
        customManifestUrl
          ? customManifestUrl.replace(/\/manifest\.json$/i, `/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`)
          : `https://example.com/${safeNameSlug}_v${versionStr.replace(/^v/i, "")}.zip`
      );

      const changelogLines = typeof activeMod.changelog_cache === "string" && activeMod.changelog_cache.trim()
        ? activeMod.changelog_cache.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
        : [t("edge_initial_release") || "Initial Release"];

      const manifest = {
        schema_version: "1.0",
        artifact: {
          id: activeMod.id || safeNameSlug || "unknown",
          name: activeMod.name || "Unknown Mod",
          author: masonName || masonId || "Unknown Author",
          version: versionStr,
          game_version: activeMod.compatible_versions?.[0] || "",
          release_date: new Date().toISOString(),
          game_id: useStore.getState().activeGameSchema?.id || "sims4"
        },
        payload: {
          download_url: customDownloadUrl,
          sha256: activeMod.hash || "",
          archive_type: "zip"
        },
        atomic_logic: {
          required_dlc: parseCsvList(activeMod.required_dlc_str),
          dependencies: parseCsvList(activeMod.dependencies_str),
          twins: parseCsvList(activeMod.twins_str),
          addons: parseCsvList(activeMod.addons_str),
          conflicts: parseCsvList(activeMod.conflicts_str),
          flavors: []
        },
        virtual_filesystem: {
          overrides: [],
          injected_folders: []
        },
        changelog: changelogLines,
        previous_hashes: previousHashes
      };

      const releaseDir = await invoke<string>("export_edge_release", { 
        vaultPath, 
        sandboxModName: activeMod.name, 
        manifest,
        customUrl: customManifestUrl
      });

      if (customManifestUrl && activeMod.hash && vaultPath) {
        try {
          await invoke("register_edge_override", {
            vaultPath,
            artifactId: manifest.artifact.id,
            masonId: manifest.artifact.author,
            manifestUrl: customManifestUrl,
            targetHash: activeMod.hash,
            archiveHashes: previousHashes,
            gameId: manifest.artifact.game_id
          });
          const savedOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
          const allHashes = Array.from(new Set([activeMod.hash, ...previousHashes]));
          for (const h of allHashes) {
            savedOverrides[h] = {
              ...(savedOverrides[h] || {}),
              name: manifest.artifact.name,
              author: manifest.artifact.author,
              version: manifest.artifact.version,
              manifest_url: customManifestUrl,
              url: activeMod.url || customManifestUrl
            };
          }
          localStorage.setItem("sanctuary_local_overrides", JSON.stringify(savedOverrides));
        } catch (regErr) {
          console.warn("Failed to auto-register exported manifest locally:", regErr);
        }
      }

      useStore.getState().pushStatus(
        `${t("edge_export_release_success") || "Exported manifest.json, override.json, and release .zip to:"} ${releaseDir}`,
        "success"
      );
    } catch (err: any) {
      console.error(err);
      useStore.getState().pushStatus(`Failed to export release: ${err.message || String(err)}`, "error");
    }
    setIsCommitting(false);
  };

  const handleSyncToNetwork = async () => {
    if (!activeMod || !activeMod.hash) {
      useStore.getState().pushStatus(t("auto_no_valid_sandbox_45") || "No valid sandbox mod", "error");
      return;
    }
    setIsCommitting(true);
    try {
      if (!isVerifiedMason) {
        // Unverified Mason / Citizen Creator -> Route through Scout Suggestions Firewall (gated by min_scout_submissions)
        const sessionUser = useStore.getState().session?.user;
        const { error: scoutErr } = await supabase.from("scout_suggestions").insert([{
          dna_hash: activeMod.hash,
          suggested_name: activeMod.name || "Unknown Sandbox Mod",
          suggested_author: masonName || sessionUser?.user_metadata?.username || (t("citizen_creator") || "Citizen Creator"),
          source_url: activeMod.url || activeMod.manifest_url || "",
          notes: activeMod.description || "",
          submitted_by: sessionUser?.id || null,
          status: "pending"
        }]);
        if (scoutErr) throw scoutErr;

        useStore.getState().pushStatus(
          t("sandbox_routed_to_scout_firewall") || "Submitted to Scout Community Firewall! Once this artifact hits the minimum citizen submission threshold, it will enter Architect review.",
          "success"
        );
        setIsEditorOpen(false);
        if (onClear) onClear();
        setIsCommitting(false);
        return;
      }

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

      useStore.getState().pushStatus(t("auto_mod_synced_to_39") || "Mod synced to network!", "success");
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
      useStore.getState().pushStatus((t("purge") || "Purge") + " " + activeMod.name, "success");
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
    // Only show Artifacts (no configs or misc files)
    return !nameLower.endsWith('.ini') && !nameLower.endsWith('.cfg') && !nameLower.endsWith('.json') && !nameLower.endsWith('.txt');
  };
  const syncedMods = sandboxMods.filter(m => existingHashes.has(m.hash) && searchFilter(m));
  const unlinkedMods = sandboxMods.filter(m => !existingHashes.has(m.hash) && searchFilter(m));

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: (unlinkedMods.length + syncedMods.length).toString()
    },
    {
      id: "in_development",
      label: t("filter_dev") || "In-Development",
      icon: "architecture",
      number: unlinkedMods.length.toString()
    },
    {
      id: "local",
      label: t("unlinked_badge") || "Local",
      icon: "folder",
      number: "0"
    },
    {
      id: "synced",
      label: t("synced_badge") || "Synced",
      icon: "cloud_done",
      number: syncedMods.length.toString()
    }
  ];

  const renderSandboxCard = (mod: any, type: 'local' | 'synced') => (
    <UniversalCard
      key={mod.hash}
      onClick={() => { setActiveMod(mod); setIsEditorOpen(true); setConfirmPurge(false); }}
      layout="horizontal"
      icon={type === 'local' ? "folder_zip" : "cloud_done"}
      title={mod.name.split(/[\\/]/).pop()}
      statusColor={type === 'local' ? "border-[color-mix(in_srgb,var(--warning)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--success)_50%,transparent)]"}
      badges={[
        <span key="badge" className={`px-2 py-0.5 rounded-md text-[8px] font-black capitalize tracking-widest shadow-inner shrink-0 transition-colors ${type === 'local' ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}>
          {type === 'local' ? (t("unlinked_badge") || "Unlinked") : (t("synced_badge") || "Synced")}
        </span>
      ]}
    >
      <div className="flex flex-col gap-1 mt-auto pb-4">
        <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest truncate group-hover:opacity-100 transition-opacity">{mod.hash}</span>
      </div>
    </UniversalCard>
  );

  const renderLanding = () => {
    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon="architecture"
          iconColorClass="text-[var(--warning)]"
          title={t("filter_dev") || "In-Development"}
          isEmpty={unlinkedMods.length === 0}
          emptyIcon={t("icon_folder_off") || "folder_off"}
          emptyTitle={t("empty") || "Empty"}
        >
          {unlinkedMods.slice(0, 4).map(mod => renderSandboxCard(mod, 'local'))}
        </HubOverviewSection>

        <HubOverviewSection
          icon="cloud_done"
          iconColorClass="text-[var(--success)]"
          title={t("synced_badge") || "Synced"}
          isEmpty={syncedMods.length === 0}
          emptyIcon={t("ui_icon_sync_disabled") || "sync_disabled"}
          emptyTitle={t("empty") || "Empty"}
        >
          {syncedMods.slice(0, 4).map(mod => renderSandboxCard(mod, 'synced'))}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const renderList = () => {
    let items: any[] = [];
    if (sandboxTabFilter === 'in_development') items = unlinkedMods;
    else if (sandboxTabFilter === 'synced') items = syncedMods;
    else if (sandboxTabFilter === 'local') items = [];

    const type = sandboxTabFilter === 'in_development' || sandboxTabFilter === 'local' ? 'local' : 'synced';

    return (
      <div className="flex flex-col gap-10 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {items.length === 0 ? (
          <EmptyState icon={type === 'local' ? (t("icon_folder_off") || "folder_off") : (t("ui_icon_sync_disabled") || "sync_disabled")} title={t("empty") || "Empty"} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {items.map(mod => renderSandboxCard(mod, type))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("tab_sandbox") || "Sandbox"}
      headerIcon="science"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={(t("search_ph") || "Search...") as string}
      tabs={tabs}
      activeTab={sandboxTabFilter}
      onTabChange={(id) => setSandboxTabFilter(id as any)}
      hideSearch={sandboxTabFilter === 'overview'}
      actions={
        sandboxTabFilter !== 'overview' ? [
          {
            id: 'import',
            icon: <span className={`material-symbols-outlined !text-[20px] ${isImporting ? 'animate-spin' : ''}`}>{isImporting ? "refresh" : "download"}</span>,
            label: (isImporting ? t("btn_importing") || "Importing" : t("btn_import") || "Import") as string,
            onClick: () => { if (!isImporting) handleImportToSandbox(); }
          }
        ] : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center items-center h-40 opacity-50 capitalize font-black tracking-widest text-[var(--text)]">
          {t("scanning") || "Scanning..."}
        </div>
      ) : (
        sandboxTabFilter === 'overview' ? renderLanding() : renderList()
      )}

      {isEditorOpen && activeMod && (
        <>
          <SidePanel
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            title={t("artifact_config") || "Artifact Configuration"}
            subtitle={`${t("hash_prefix") || "HASH:"} ${activeMod?.hash}`}
            icon="settings"
            widthClass="w-[600px]"
            backdropZ="z-[50000]"
            panelZ="z-[50001]"
            headerActions={
              <PanelHeaderGroup>
                <PanelHeaderButton 
                  icon="move_to_inbox" 
                  onClick={handleExportRelease} 
                  disabled={isCommitting} 
                  tooltip={t("btn_export_release") || "Export Release"} 
                />
                <PanelHeaderButton 
                  icon="delete" 
                  onClick={handlePurge} 
                  disabled={isCommitting} 
                  tooltip={confirmPurge ? (t("ui_confirm_delete") || "Confirm") : (t("purge") || "Purge")} 
                  variant="danger" 
                />
                <PanelHeaderButton 
                  icon="sync" 
                  onClick={handleSyncToNetwork} 
                  disabled={isCommitting} 
                  tooltip={isCommitting ? (t("btn_syncing") || "Syncing...") : (isVerifiedMason ? (t("sandbox_btn_sync") || "Sync to Network") : (t("sandbox_btn_submit_scout") || "Submit to Scout Queue"))} 
                  variant="accent"
                />
              </PanelHeaderGroup>
            }
          >
            <div className="flex flex-col h-full gap-8">
              <SidePanelTitleInput
                value={activeMod.name || ""}
                onChange={(val) => setActiveMod({ ...activeMod, name: val })}
                placeholder={t("label_modname") || "Artifact Name"}
              />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("category") || "Category"}</label>
                  <CustomClassificationDropdown value={activeMod.category_override || "Script"} onChange={(val: string) => setActiveMod({ ...activeMod, category_override: val })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_file_ext") || "File Extension"}</label>
                  <input value={activeMod.file_extension || ""} onChange={e => setActiveMod({ ...activeMod, file_extension: e.target.value })} placeholder={t("placeholder_file_ext") || ".package"} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_subclass") || "Subcategory"}</label>
                  <input value={activeMod.sub_type || ""} onChange={e => setActiveMod({ ...activeMod, sub_type: e.target.value })} placeholder={t("placeholder_subclass") || "Subcategory"} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("registry_label_url") || "URL"}</label>
                  <input value={activeMod.url || ""} onChange={e => setActiveMod({ ...activeMod, url: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("upload_desc") || "Description"}</label>
                  <textarea value={activeMod.description || ""} onChange={e => setActiveMod({ ...activeMod, description: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold min-h-[120px] custom-scrollbar resize-none focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2 xl:col-span-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("cc_cover_url") || "Cover URL"}</label>
                  <input value={activeMod.image_url || ""} onChange={e => setActiveMod({ ...activeMod, image_url: e.target.value })} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("label_condition") || "Status"}</label>
                  <MasonStatusDropdown value={activeMod.status || "unverified"} onChange={(newStatus: string) => setActiveMod({ ...activeMod, status: newStatus })} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("uploaded_date") || "Uploaded Date"}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.created_at || null} onChange={date => setActiveMod({ ...activeMod, created_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("updated_date") || "Updated Date"}</label>
                  <div className="w-full">
                    <CustomDatePicker value={activeMod.updated_at || null} onChange={date => setActiveMod({ ...activeMod, updated_at: date })} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2 flex items-center gap-1">
                    {t("label_mason_version") || "Version"}
                  </label>
                  <input value={activeMod.latest_version || ""} onChange={e => setActiveMod({ ...activeMod, latest_version: e.target.value })} placeholder={t("ph_mod_version") || "1.0.0"} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 col-span-full">
                  <SidePanelPillToggle
                    checked={activeMod.is_paid || false}
                    onChange={(checked) => setActiveMod({ ...activeMod, is_paid: checked })}
                    label={t("label_is_paid") || "Paid"}
                    icon="monetization_on"
                    variant="warning"
                  />
                  <SidePanelPillToggle
                    checked={activeMod.is_early_access || false}
                    onChange={(checked) => setActiveMod({ ...activeMod, is_early_access: checked })}
                    label={t("label_is_early_access") || "Early Access"}
                    icon="science"
                    variant="accent"
                  />
                </div>

                <div className="flex flex-col gap-2 col-span-full">
                  <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("game_versions") || "Game Versions"}</label>
                  <GameVersionMultiSelect selectedVersions={activeMod.compatible_versions || []} onChange={(v) => setActiveMod({ ...activeMod, compatible_versions: v })} />
                </div>

                <div className="col-span-full pt-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-6">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("icon_cloud_sync") || "cloud_sync"}</span>
                    <h4 className="text-xs font-black capitalize tracking-widest text-[var(--text)]">
                      {t("edge_static_release_config") || "Static Edge Release & Atomic Logic"}
                    </h4>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                      {t("edge_manifest_url_label") || "Static Edge Manifest URL (manifest.json)"}
                    </label>
                    <input
                      value={activeMod.manifest_url || ""}
                      onChange={e => setActiveMod({ ...activeMod, manifest_url: e.target.value })}
                      placeholder={t("edge_manifest_url_ph") || "https://your-site.com/mods/manifest.json"}
                      className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold font-mono focus:outline-none focus:theme-border-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                      {t("edge_download_url_label") || "Release Archive Download URL (.zip)"}
                    </label>
                    <input
                      value={activeMod.download_url || ""}
                      onChange={e => setActiveMod({ ...activeMod, download_url: e.target.value })}
                      placeholder={t("edge_download_url_ph") || "https://your-site.com/mods/mod_v1.0.0.zip"}
                      className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold font-mono focus:outline-none focus:theme-border-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                      {t("edge_changelog_label") || "Release Changelog (One Entry Per Line)"}
                    </label>
                    <textarea
                      value={activeMod.changelog_cache || ""}
                      onChange={e => setActiveMod({ ...activeMod, changelog_cache: e.target.value })}
                      placeholder={t("edge_changelog_ph") || "Initial release\nAdded compatibility for latest patch"}
                      className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold min-h-[90px] custom-scrollbar resize-none focus:outline-none focus:theme-border-accent"
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t("edge_required_dlc_label") || "Required DLC (Comma-Separated)"}
                      </label>
                      <input
                        value={activeMod.required_dlc_str || ""}
                        onChange={e => setActiveMod({ ...activeMod, required_dlc_str: e.target.value })}
                        placeholder={t("edge_required_dlc_ph") || "EP01, GP04"}
                        className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold font-mono focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t("edge_dependencies_label") || "Dependencies (Hashes / Names)"}
                      </label>
                      <input
                        value={activeMod.dependencies_str || ""}
                        onChange={e => setActiveMod({ ...activeMod, dependencies_str: e.target.value })}
                        placeholder={t("edge_dependencies_ph") || "XML Injector, Core Library"}
                        className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold font-mono focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t("edge_conflicts_label") || "Conflicts (Hashes / Names)"}
                      </label>
                      <input
                        value={activeMod.conflicts_str || ""}
                        onChange={e => setActiveMod({ ...activeMod, conflicts_str: e.target.value })}
                        placeholder={t("edge_conflicts_ph") || "Conflicting Mod Name or Hash"}
                        className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold font-mono focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t("edge_twins_addons_label") || "Companion / Addon Hashes"}
                      </label>
                      <input
                        value={activeMod.twins_str || ""}
                        onChange={e => setActiveMod({ ...activeMod, twins_str: e.target.value })}
                        placeholder={t("edge_twins_addons_ph") || "Required companion hash or name"}
                        className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold font-mono focus:outline-none focus:theme-border-accent"
                      />
                    </div>

                    <div className="flex flex-col gap-2 xl:col-span-2">
                      <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">
                        {t("edge_previous_hashes_label") || "Previous Version SHA-256 Hashes (Comma-Separated Lineage)"}
                      </label>
                      <input
                        value={activeMod.previous_hashes_str || ""}
                        onChange={e => setActiveMod({ ...activeMod, previous_hashes_str: e.target.value })}
                        placeholder={t("edge_previous_hashes_ph") || "Older SHA-256 hashes to link to this manifest family"}
                        className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold font-mono focus:outline-none focus:theme-border-accent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto shrink-0 pt-8 pb-4 flex flex-col gap-4">
                {existingHashes.has(activeMod.hash) && (
                  <div className="glass-panel border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] px-6 py-4 rounded-2xl flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-black text-[var(--success)] capitalize tracking-widest flex items-center justify-center gap-2"><span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle") || "check_circle"}</span> {t("already_synced") || "Already Synced"}</span>
                    <p className="text-[10px] text-[var(--subtext)] mt-1 font-bold">{t("already_synced_desc") || "This artifact hash is already linked to the network."}</p>
                  </div>
                )}
                {isVerifiedMason && (
                  <div className="flex justify-end gap-4 mt-2">
                    <button onClick={() => setIsLinkModalOpen(true)} disabled={isCommitting} className="flex-1 py-4 font-black text-xs capitalize tracking-widest rounded-2xl transition-all duration-300 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] disabled:opacity-50 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_link") || "link"}</span> {t("btn_link_existing") || "Link Existing"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </SidePanel>
        </>
      )}

      <SidePanel
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={t("link_modal_title") || "Link to Existing Artifact"}
        icon="link"
        widthClass="w-[450px]"
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
      >
        <div className="flex flex-col gap-6 h-full">
          <div className="shrink-0 relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search") || "search"}</span>
            <input
              type="text"
              placeholder={t("link_search") || "Search..."}
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              className="w-full glass-surface rounded-xl pl-10 pr-5 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
            {existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 ? (
              <EmptyState icon={t("icon_search_off") || "search_off"} title={t("link_no_results") || "No Results Found"} className="py-8" />
            ) : (
              existingMods.filter(m => m.name.toLowerCase().includes(linkSearch.toLowerCase())).map(m => (
                <button
                  key={m.id}
                  onClick={() => handleLinkToExisting(m.id)}
                  className="w-full text-left p-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] transition-all duration-300 group flex items-center justify-start"
                >
                  <span className="font-black text-xs text-[var(--text)] capitalize tracking-tight truncate mr-4 group-hover:text-[var(--accent)] transition-colors">{m.name}</span>
                  <span className="text-[9px] font-black capitalize tracking-widest text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_link") || "link"}</span> {t("btn_link_existing") || "Link"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </SidePanel>
    </ElevatedHubLayout>
  );
}



