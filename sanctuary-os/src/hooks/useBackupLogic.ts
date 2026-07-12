import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";

export function useBackupLogic(detectGameVersion: () => void) {
  const { setStatus, setBackupList, selectedVersion } = useStore();
  const { setIsRestoring, setIsBackingUp } = useModalStore();
  const { t } = useLexicon();

  async function fetchBackups() {
    try {
      const config: any = await invoke("get_saved_coordinates");
      const list = await invoke<string[]>("get_backups", {
        vaultPath: config.vault_path,
      });
      setBackupList(list);
    } catch (err) {
      console.error("Failed to load backups", err);
    }
  }

  async function restoreGameBackup(filename: string) {
    setStatus(`${t("status_restoring_prefix")}${filename}...`);
    setIsRestoring(true);
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      const msg = await invoke("restore_game_data", {
        docsPath: dPath,
        livePath: config.live_path,
        backupName: filename,
      });
      setStatus(msg as string);
    } catch (err) {
      setStatus(`${t("status_restore_failure")}${err}`);
    } finally {
      setIsRestoring(false);
      detectGameVersion();
    }
  }

  const deleteBackup = async (fileName: string) => {
    try {
      await invoke("delete_backup", { fileName });
      fetchBackups();
    } catch (err) {
      alert(`${t("alert_deletion_failed")}${err}`);
    }
  };

  const triggerFullEngineBackup = async () => {
    const config: any = await invoke("get_saved_coordinates");
    useModalStore.getState().setBackupType('engine');
    setIsBackingUp(true);
    try {
      await invoke("backup_engine_full", {
        livePath: config.live_path,
        version: selectedVersion,
      });
      fetchBackups();
    } catch (err) {
      alert(`${t("alert_backup_failed")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const triggerPrePatchSnapshot = async () => {
    const config: any = await invoke("get_saved_coordinates");
    const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    setStatus(`${t("icon_inventory_2")} ${t("status_executing_prepatch_snapshot")}`);
    useModalStore.getState().setBackupType('world');
    setIsBackingUp(true);
    try {
      await invoke("backup_universe", {
        docsPath: docsBase,
        version: selectedVersion,
      });
      fetchBackups();
      setStatus(`${t("icon_check_circle")} ${t("status_prepatch_snapshot_secured")}`);
    } catch (err) {
      console.error(err);
      alert(`${t("alert_backup_failed")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  return { fetchBackups, restoreGameBackup, deleteBackup, triggerFullEngineBackup, triggerPrePatchSnapshot };
}
