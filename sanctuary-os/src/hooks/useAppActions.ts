import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";

export function useAppActions(runRadarSweep: (isInteractive?: boolean) => void, activeMasonProfileId: string | null, tier2Hashes: string[], fetchBackups: () => void) {
  const { t } = useLexicon();
  const { playSets, setPlaySets, activePlaySetIndex, setActivePlaySetIndex, setStatus, modList } = useStore();
  const { 
    localFolderName, localFolderType, setLocalFolderModal, setLocalFolderName, setIsBulkMode, setSelectedMods, selectedMods,
    bulkName, setBulkModal, setBulkName,
    snapshotName, setSnapshotModal, setSnapshotName,
    setPendingImportSet, setMissingImportMods, setSyncCode,
    renameModal, setRenameModal,
    renameTarget, setRenameTarget, nameInput, setNameInput
  } = useModalStore();

  function createLocalFolder() {
    const folderName = localFolderName.trim();
    if (!folderName || selectedMods.length === 0) return;
    const localSts = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
    const newId = "local_" + Date.now();
    const hashes = selectedMods.map(name => modList.find(m => m.name === name)?.hash).filter(Boolean);
    localSts.push({ id: newId, name: folderName, items: hashes, isCCSet: localFolderType === "CC_SET" });
    localStorage.setItem("sanctuary_local_sets", JSON.stringify(localSts));
    setStatus(`${t("status_virtual_folder_created")}${folderName}`);
    setLocalFolderModal(false); setLocalFolderName(""); setIsBulkMode(false); setSelectedMods([]);
    runRadarSweep(true);
  }

  function executeBulkDraft() {
    const setName = bulkName.trim();
    if (!setName) { setBulkModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists")); return; }
    const updatedSets =[...playSets, { name: setName, mods: selectedMods }];
    setPlaySets(updatedSets); localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    setActivePlaySetIndex(updatedSets.length - 1); 
    setStatus(`${t("status_blueprint_created_prefix")}${setName}${t("status_blueprint_created_mid")}${selectedMods.length}${t("status_blueprint_created_suffix")}`);
    setIsBulkMode(false); setSelectedMods([]); setBulkModal(false); setBulkName("");
  }

  function executeSnapshot() {
    const setName = snapshotName.trim();
    if (!setName) { setSnapshotModal(false); return; }
    if (playSets.some((s) => s.name.toLowerCase() === setName.toLowerCase())) { setStatus(t("status_blueprint_exists")); return; }
    const activeSet = playSets[activePlaySetIndex];
    const currentMods = activeSet && activeSet.mods ?[...activeSet.mods] :[];
    const newSet = { name: setName, mods: currentMods };
    const updatedSets =[...playSets, newSet];
    setPlaySets(updatedSets); 
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets)); 
    setSnapshotModal(false); setSnapshotName("");
    setStatus(`${t("ui_icon_success")} ${t("status_profile_cloned")}`);
  }

  async function exportPlaySet(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    const exportData = {
      sanctuary_profile: true,
      name: targetSet.name,
      mods: targetSet.mods.map((modName: string) => {
        const mod = modList.find(m => m.name === modName);
        return { name: modName, hash: mod?.hash || "", url: mod?.url || "", author: mod?.author || "Unknown", isVirtual: mod?.isVirtual };
      }).filter((m: any) => !m.isVirtual && !m.name.startsWith("FOLDER_") && !m.name.startsWith("SET_") && !m.name.startsWith("LOCAL_SET_")).map((m: any) => ({ name: m.name, hash: m.hash, url: m.url, author: m.author }))
    };
    try {
      const config: any = await invoke("get_saved_coordinates");
      const defaultPath = config.vault_path ? `${config.vault_path}\\Data\\Blueprints\\${setName}.json` : `${setName}.json`;
      const path = await save({ defaultPath, filters:[{ name: 'Sanctuary Profile', extensions: ['json'] }] });
      if (path) {
        await invoke("save_blueprint", { path: path, content: JSON.stringify(exportData, null, 2) });
        setStatus(`${t("ui_icon_success")} ${t("status_profile_exported")}${setName}`);
      }
    } catch (err) { setStatus(`${t("log_icon_fatal")} ${t("status_export_failed")}${err}`); }
  }

  async function executeRename() {
    if (!renameModal) return; const { oldName, newName, cleanName, prefix } = renameModal;
    if (!newName || newName === cleanName) { setRenameModal(null); return; }
    const finalName = newName.toUpperCase().startsWith(prefix) ? newName : `${prefix}${newName.replace(/\s+/g, "_")}`;
    setStatus(t("status_relabeling"));
    try { const msg = await invoke<string>("rename_backup", { oldName, newName: finalName }); setStatus(`${t("ui_icon_success")} ${msg}`); fetchBackups(); } 
    catch (err) { setStatus(`${t("status_relabel_failed")}${err}`); } setRenameModal(null);
  }

  async function confirmRename() {
    if (!renameTarget) return;
    try {
      await invoke("rename_backup", { oldName: renameTarget, newName: nameInput });
      setRenameTarget(null);
      fetchBackups();
    } catch (err) { alert(`${t("alert_rename_failed")}${err}`); }
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
