import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";

export function useBackupLogic(detectGameVersion: () => void) {
  const { setStatus, setBackupList, selectedVersion } = useStore();
  const { setIsRestoring, setIsBackingUp } = useModalStore();
  const { t } = useLexicon();

  async function fetchBackups() {
    if (!isDesktop()) return;
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
    setStatus(`${t("status_restoring_prefix", "Restoring: ")}${filename}...`);
    useStore.getState().setBackupProgress(null);
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
      setStatus(`${t("status_restore_failure", "Restore failed: ")}${err}`);
    } finally {
      setIsRestoring(false);
      detectGameVersion();
    }
  }

  const deleteBackup = async (fileName: string) => {
    try {
      const currentList = useStore.getState().backupList || [];
      useStore.getState().setBackupList(currentList.filter((b) => b.name !== fileName));
      await invoke("delete_backup", { fileName });
      setTimeout(() => fetchBackups(), 500);
    } catch (err) {
      fetchBackups();
      alert(`${t("alert_deletion_failed", "Deletion failed: ")}${err}`);
    }
  };

  const triggerFullEngineBackup = async (keepPreviousCompleted = false) => {
    const config: any = await invoke("get_saved_coordinates");
    if (!keepPreviousCompleted) {
      useModalStore.getState().setCompletedBackups([]);
      useModalStore.getState().setIsDefconBackupSession(false);
    }
    useModalStore.getState().setBackupType("engine");
    useStore.getState().setBackupProgress(null);
    setIsBackingUp(true);
    try {
      const createdName = await invoke<string>("backup_engine_full", {
        livePath: config.live_path,
        version: selectedVersion,
      });
      if (createdName && typeof createdName === "string") {
        const cleanName = createdName.replace(/^Secured:\s*/i, "").trim();
        useModalStore
          .getState()
          .setCompletedBackups((prev) =>
            prev.includes(cleanName) ? prev : [...prev, cleanName]
          );
      }
      fetchBackups();
    } catch (err) {
      alert(`${t("alert_backup_failed", "Backup failed: ")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const triggerPrePatchSnapshot = async (keepPreviousCompleted = false) => {
    const config: any = await invoke("get_saved_coordinates");
    const docsBase = config.mods_path.replace(/[\\/]Mods[\\/]?$/i, "");
    if (!keepPreviousCompleted) {
      useModalStore.getState().setCompletedBackups([]);
      useModalStore.getState().setIsDefconBackupSession(false);
    }
    setStatus(
      `${t("icon_inventory_2", "inventory_2")} ${t(
        "status_executing_prepatch_snapshot",
        "Creating save snapshot..."
      )}`
    );
    useModalStore.getState().setBackupType("world");
    useStore.getState().setBackupProgress(null);
    setIsBackingUp(true);
    try {
      const createdName = await invoke<string>("backup_universe", {
        docsPath: docsBase,
        version: selectedVersion,
      });
      if (createdName && typeof createdName === "string") {
        useModalStore
          .getState()
          .setCompletedBackups((prev) =>
            prev.includes(createdName) ? prev : [...prev, createdName]
          );
      }
      fetchBackups();
      setStatus(
        `${t("icon_check_circle", "check_circle")} ${t(
          "status_prepatch_snapshot_secured",
          "Snapshot secured."
        )}`
      );
    } catch (err) {
      console.error(err);
      alert(`${t("alert_backup_failed", "Backup failed: ")}${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  return {
    fetchBackups,
    restoreGameBackup,
    deleteBackup,
    triggerFullEngineBackup,
    triggerPrePatchSnapshot,
  };
}
