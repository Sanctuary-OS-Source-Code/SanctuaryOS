import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { deduplicateBlueprintArtifacts } from "../shared";
import { packageBlueprintLoadOrder } from "./usePlaySetLogic";
import { buildExportableModMetadata } from "../utils/blueprintOverrideUtils";

export function useAppActions(runRadarSweep: (isInteractive?: boolean) => void, activeMasonProfileId: string | null, tier2Hashes: string[], fetchBackups: () => void) {
  const { t } = useLexicon();
  const { playSets, setPlaySets, activePlaySetIndex, setActivePlaySetIndex, setStatus, modList } = useStore(
    useShallow((s) => ({
      playSets: s.playSets,
      setPlaySets: s.setPlaySets,
      activePlaySetIndex: s.activePlaySetIndex,
      setActivePlaySetIndex: s.setActivePlaySetIndex,
      setStatus: s.setStatus,
      modList: s.modList,
    }))
  );
  const {
    localFolderName,
    localFolderType,
    setLocalFolderModal,
    setLocalFolderName,
    setIsBulkMode,
    setSelectedMods,
    selectedMods,
    bulkName,
    setBulkModal,
    setBulkName,
    snapshotName,
    setSnapshotModal,
    setSnapshotName,
    renameModal,
    setRenameModal,
    renameTarget,
    setRenameTarget,
    nameInput,
  } = useModalStore(
    useShallow((s) => ({
      localFolderName: s.localFolderName,
      localFolderType: s.localFolderType,
      setLocalFolderModal: s.setLocalFolderModal,
      setLocalFolderName: s.setLocalFolderName,
      setIsBulkMode: s.setIsBulkMode,
      setSelectedMods: s.setSelectedMods,
      selectedMods: s.selectedMods,
      bulkName: s.bulkName,
      setBulkModal: s.setBulkModal,
      setBulkName: s.setBulkName,
      snapshotName: s.snapshotName,
      setSnapshotModal: s.setSnapshotModal,
      setSnapshotName: s.setSnapshotName,
      renameModal: s.renameModal,
      setRenameModal: s.setRenameModal,
      renameTarget: s.renameTarget,
      setRenameTarget: s.setRenameTarget,
      nameInput: s.nameInput,
    }))
  );

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
      setStatus(`${t("status_local_folder_added_prefix", "Added")} ${hashes.length} ${t("term_mods", "items")} → ${folderName}`);
    } else {
      const newId = "local_" + Date.now();
      localSts.push({ id: newId, name: folderName, items: hashes, isCollection: localFolderType === "COLLECTION" });
      setStatus(`${t("status_virtual_folder_created", "Virtual Folder Created:")} ${folderName}`);
    }
    
    localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`, JSON.stringify(localSts));
    setLocalFolderModal(false); setLocalFolderName(""); setIsBulkMode(false); setSelectedMods([]);
    runRadarSweep(true);
  }

  function executeBulkDraft() {
    const setName = bulkName.trim();
    if (!setName) { setBulkModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists", "A {Blueprint} with that name already exists!")); return; }
    const dedupedMods = deduplicateBlueprintArtifacts(selectedMods, useStore.getState().activeGameSchema);
    const updatedSets = [...playSets, { name: setName, mods: dedupedMods }];
    setPlaySets(updatedSets);
    setActivePlaySetIndex(updatedSets.length - 1); 
    setStatus(`${t("status_blueprint_created_prefix", "{Blueprint}[")}${setName}${t("status_blueprint_created_mid", "] created with")}${dedupedMods.length}${t("backend_deployed_suffix", "{mods}.")}`);
    setIsBulkMode(false); setSelectedMods([]); setBulkModal(false); setBulkName("");
  }

  function executeSnapshot() {
    const setName = snapshotName.trim();
    if (!setName) { setSnapshotModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists", "A {Blueprint} with that name already exists!")); return; }
    const activeSet = playSets[activePlaySetIndex];
    const currentMods = activeSet && activeSet.mods ? deduplicateBlueprintArtifacts([...activeSet.mods], useStore.getState().activeGameSchema) : [];
    const newSet = {
      name: setName,
      mods: currentMods,
      modHashes: activeSet?.modHashes ? { ...activeSet.modHashes } : undefined,
      modMeta: activeSet?.modMeta ? { ...activeSet.modMeta } : undefined,
      loadRules: Array.isArray(activeSet?.loadRules) ? activeSet.loadRules.map((r: any) => ({ ...r })) : undefined,
      modTiers: activeSet?.modTiers ? { ...activeSet.modTiers } : undefined,
      loadOrder: Array.isArray(activeSet?.loadOrder) ? [...activeSet.loadOrder] : undefined,
      ignoredConflicts: Array.isArray(activeSet?.ignoredConflicts) ? [...activeSet.ignoredConflicts] : undefined,
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
    let edgeLogic: any = {};
    try {
      localOverrides = JSON.parse(localStorage.getItem('sanctuary_local_overrides') || '{}');
    } catch(e) {}
    try {
      edgeLogic = JSON.parse(localStorage.getItem('sanctuary_edge_logic') || '{}');
    } catch(e) {}

    const activeGameSchema = useStore.getState().activeGameSchema;
    const packagedLO = packageBlueprintLoadOrder(targetSet, activeGameSchema, modList);

    const rawModObjects = targetSet.mods.map((rawMod: any) => {
      const modName = typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
      const cleanName = modName.split(/[\\/]/).pop() || modName;
      const mod = modList.find((m) => m.name === modName || (m.name.split(/[\\/]/).pop() || m.name).toLowerCase() === cleanName.toLowerCase());
      const hash = mod?.hash || targetSet.modHashes?.[modName] || targetSet.modHashes?.[cleanName] || "";
      const override = hash ? localOverrides[hash] : undefined;
      const edgeEntry = hash ? edgeLogic[hash] : undefined;
      const meta = targetSet.modMeta?.[modName] || targetSet.modMeta?.[cleanName];
      const portableMeta = buildExportableModMetadata({
        mod,
        override,
        meta,
        edgeEntry,
        modName,
        cleanName,
      });

      return {
        name: modName,
        hash,
        ...portableMeta,
        isVirtual: mod?.isVirtual,
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
      ignored_conflicts: packagedLO.ignored_conflicts,
      mods: packagedLO.enrichAndSortArtifacts(rawModObjects),
    };
    try {
      const config: any = await invoke("get_saved_coordinates");
      const defaultPath = config.vault_path ? `${config.vault_path}\\Blueprints\\${setName}.json` : `${setName}.json`;
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
