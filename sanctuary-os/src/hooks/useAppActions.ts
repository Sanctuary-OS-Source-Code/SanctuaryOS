import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { packageBlueprintLoadOrder } from "./usePlaySetLogic";

export function useAppActions(runRadarSweep: (isInteractive?: boolean) => void, activeMasonProfileId: string | null, tier2Hashes: string[], fetchBackups: () => void) {
  const { t } = useLexicon();
  const { playSets, setPlaySets, activePlaySetIndex, setActivePlaySetIndex, setStatus, modList } = useStore();
  const { localFolderName, localFolderType, setLocalFolderModal, setLocalFolderName, setIsBulkMode, setSelectedMods, selectedMods, bulkName, setBulkModal, setBulkName, snapshotName, setSnapshotModal, setSnapshotName, renameModal, setRenameModal, renameTarget, setRenameTarget, nameInput } = useModalStore();

  function createLocalFolder() {
    const folderName = localFolderName.trim();
    if (!folderName || selectedMods.length === 0) return;
    const localSts = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
    const hashes = selectedMods.map((name: string) => modList.find((m: any) => m.name === name)?.hash).filter(Boolean);
    
    const existingIndex = localSts.findIndex((s: any) => s.name.toLowerCase() === folderName.toLowerCase());
    
    if (existingIndex >= 0) {
      const existing = localSts[existingIndex];
      const newHashes = Array.from(new Set([...existing.items, ...hashes]));
      localSts[existingIndex] = { ...existing, items: newHashes };
      setStatus(`Added ${hashes.length} items to ${folderName}`);
    } else {
      const newId = "local_" + Date.now();
      localSts.push({ id: newId, name: folderName, items: hashes, isCollection: localFolderType === "CC_SET" });
      setStatus(`${t("status_virtual_folder_created", "Virtual Folder Created:")}${folderName}`);
    }
    
    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(localSts));
    setLocalFolderModal(false); setLocalFolderName(""); setIsBulkMode(false); setSelectedMods([]);
    runRadarSweep(true);
  }

  function executeBulkDraft() {
    const setName = bulkName.trim();
    if (!setName) { setBulkModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists", "A {Blueprint} with that name already exists!")); return; }
    const updatedSets =[...playSets, { name: setName, mods: selectedMods }];
    setPlaySets(updatedSets);
    setActivePlaySetIndex(updatedSets.length - 1); 
    setStatus(`${t("status_blueprint_created_prefix", "{Blueprint}[")}${setName}${t("status_blueprint_created_mid", "] created with")}${selectedMods.length}${t("backend_deployed_suffix", "{mods}.")}`);
    setIsBulkMode(false); setSelectedMods([]); setBulkModal(false); setBulkName("");
  }

  function executeSnapshot() {
    const setName = snapshotName.trim();
    if (!setName) { setSnapshotModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists", "A {Blueprint} with that name already exists!")); return; }
    const activeSet = playSets[activePlaySetIndex];
    const currentMods = activeSet && activeSet.mods ? [...activeSet.mods] : [];
    const newSet = {
      name: setName,
      mods: currentMods,
      modHashes: activeSet?.modHashes ? { ...activeSet.modHashes } : undefined,
      modMeta: activeSet?.modMeta ? { ...activeSet.modMeta } : undefined,
      loadRules: Array.isArray(activeSet?.loadRules) ? activeSet.loadRules.map((r: any) => ({ ...r })) : undefined,
      modTiers: activeSet?.modTiers ? { ...activeSet.modTiers } : undefined,
      loadOrder: Array.isArray(activeSet?.loadOrder) ? [...activeSet.loadOrder] : undefined,
    };
    const updatedSets = [...playSets, newSet];
    setPlaySets(updatedSets); 
 
    setSnapshotModal(false); setSnapshotName("");
    setStatus(`${t("icon_check_circle", "check_circle")} ${t("status_profile_cloned", "Profile Cloned Successfully!")}`);
  }

  async function exportPlaySet(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    let localOverrides: any = {};
    try {
      localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
    } catch(e) {}

    const activeGameSchema = useStore.getState().activeGameSchema;
    const packagedLO = packageBlueprintLoadOrder(targetSet, activeGameSchema, modList);

    const rawModObjects = targetSet.mods.map((rawMod: any) => {
      const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const cleanName = modName.split(/[\\/]/).pop() || modName;
      const mod = modList.find((m) => m.name === modName || (m.name.split(/[\\/]/).pop() || m.name).toLowerCase() === cleanName.toLowerCase());
      const hash = mod?.hash || targetSet.modHashes?.[modName] || targetSet.modHashes?.[cleanName] || "";
      const override = hash ? localOverrides[hash] : undefined;
      const meta = targetSet.modMeta?.[modName] || targetSet.modMeta?.[cleanName];

      return { 
        name: modName,
        displayName: override?.displayName || meta?.displayName || mod?.displayName || cleanName,
        hash: hash, 
        url: override?.url || meta?.url || mod?.url || "", 
        manifest_url: override?.manifest_url || meta?.manifest_url || mod?.manifest_url || undefined,
        author: override?.author || meta?.author || mod?.author || "Unknown", 
        version: override?.version || meta?.version || mod?.version || "v.Local",
        description: override?.description ?? meta?.description ?? mod?.description ?? undefined,
        image_url: override?.image_url ?? meta?.image_url ?? mod?.image_url ?? undefined,
        category_override: override?.category_override || meta?.category_override || mod?.category_override || undefined,
        sub_type: override?.sub_type || meta?.sub_type || mod?.sub_type || undefined,
        file_extension: override?.file_extension || meta?.file_extension || mod?.file_extension || undefined,
        requiredDLC: override?.requiredDLC || meta?.requiredDLC || mod?.requiredDLC || [],
        compatible_versions: override?.compatible_versions || meta?.compatible_versions || mod?.compatible_versions || [],
        compliance_tier: Number(mod?.compliance_tier ?? meta?.compliance_tier ?? 0),
        allow_write: Boolean(override?.allow_write ?? meta?.allow_write ?? mod?.allow_write ?? false),
        is_paid: Boolean(override?.is_paid ?? meta?.is_paid ?? mod?.is_paid ?? false),
        is_early_access: Boolean(override?.is_early_access ?? meta?.is_early_access ?? mod?.is_early_access ?? false),
        created_at: override?.created_at || meta?.created_at || mod?.created_at || undefined,
        updated_at: override?.updated_at || meta?.updated_at || mod?.updated_at || undefined,
        requirements: mod?.requirements || meta?.requirements || undefined,
        twins: mod?.twins || meta?.twins || undefined,
        conflicts: mod?.conflicts || meta?.conflicts || undefined,
        isLocalOverride: Boolean(override || mod?.isLocalOverride),
        isVirtual: mod?.isVirtual 
      };
    }).filter((m: any) => !m.isVirtual && !m.name.startsWith("FOLDER_") && !m.name.startsWith("SET_") && !m.name.startsWith("LOCAL_SET_")).map(({ isVirtual, ...rest }: any) => rest);

    const exportData = {
      sanctuary_profile: true,
      name: targetSet.name,
      game_id: activeGameSchema?.id || "",
      game_name: activeGameSchema?.display_name || "",
      load_order_strategy: packagedLO.load_order_strategy,
      load_rules: packagedLO.load_rules,
      mod_tiers: packagedLO.mod_tiers,
      load_order: packagedLO.load_order,
      mods: packagedLO.enrichAndSortArtifacts(rawModObjects),
    };
    try {
      const config: any = await invoke("get_saved_coordinates");
      const defaultPath = config.vault_path ? `${config.vault_path}\\Data\\Blueprints\\${setName}.json` : `${setName}.json`;
      const path = await save({ defaultPath, filters:[{ name: 'Sanctuary Profile', extensions: ['json'] }] });
      if (path) {
        await invoke("save_blueprint", { path: path, content: JSON.stringify(exportData, null, 2) });
        setStatus(`${t("icon_check_circle", "check_circle")} ${t("status_profile_exported", "Profile Exported")}${setName}`);
      }
    } catch (err) { setStatus(`${t("icon_block", "block")} ${t("alert_export_failed", "Export Failed:")}${err}`); }
  }

  async function executeRename() {
    if (!renameModal) return; const { oldName, newName, cleanName, prefix } = renameModal;
    if (!newName || newName === cleanName) { setRenameModal(null); return; }
    const finalName = newName.toUpperCase().startsWith(prefix) ? newName : `${prefix}${newName.replace(/\s+/g, "_")}`;
    setStatus(t("status_relabeling", "RENAMING: Updating archive designation..."));
    try { const msg = await invoke<string>("rename_backup", { oldName, newName: finalName }); setStatus(`${t("icon_check_circle", "check_circle")} ${msg}`); fetchBackups(); } 
    catch (err) { setStatus(`${t("alert_rename_failed", "Rename Failed:")}${err}`); } setRenameModal(null);
  }

  async function confirmRename() {
    if (!renameTarget) return;
    try {
      await invoke("rename_backup", { oldName: renameTarget, newName: nameInput });
      setRenameTarget(null);
      fetchBackups();
    } catch (err) { useStore.getState().pushStatus(`${t("alert_rename_failed", "Rename Failed:")}${err}`); }
  }

  return {
    createLocalFolder,
    executeBulkDraft,
    executeSnapshot,
    exportPlaySet,
    executeRename,
    confirmRename
  };
}
