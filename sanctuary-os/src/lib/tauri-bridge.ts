import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";

export const tauriBridge = {
  autoDetectPaths: () => invoke("auto_detect_paths"),
  wipeSymlinks: () => invoke("wipe_symlinks"),
  getSavedCoordinates: () => invoke("get_saved_coordinates"),
  loadMasterCache: (vaultPath: string) => invoke<string>("load_master_cache", { vaultPath }),
  saveMasterCache: (vaultPath: string, content: string) => invoke("save_master_cache", { vaultPath, content }),
  initializeVaultWatch: () => invoke("initialize_vault_watch"),
  initializeAirgapWatch: (docsPath: string, vaultPath: string) => invoke("initialize_airgap_watch", { docsPath, vaultPath }),
  ingestDroppedFile: (path: string, forceReplace: boolean) => invoke("ingest_dropped_file", { path, forceReplace }),
  scanBunker: (vaultPath: string, shelterActive: boolean) => invoke<any[]>("scan_bunker", { vaultPath, shelterActive }),
  getBackups: (vaultPath: string) => invoke<string[]>("get_backups", { vaultPath }),
  restoreGameData: (docsPath: string, livePath: string, backupName: string) => invoke("restore_game_data", { docsPath, livePath, backupName }),
  getQuarantineList: () => invoke<string[]>("get_quarantine_list"),
  getShelterList: () => invoke<string[]>("get_shelter_list"),
  deployPlaysetBulk: (mods: any[], modsPath: string, vaultPath: string) => invoke("deploy_playset_bulk", { mods, modsPath, vaultPath }),
  renameBackup: (oldName: string, newName: string) => invoke("rename_backup", { oldName, newName }),
  scanInstalledDlc: (livePath: string) => invoke<string[]>("scan_installed_dlc", { livePath }),
  ripGameVersion: (modsPath: string) => invoke<string>("rip_game_version", { modsPath }),
  saveBlueprint: (path: string, content: string) => invoke("save_blueprint", { path, content }),
  syncSecurityDefinitions: (malware: string[], tier2: string[]) => invoke('sync_security_definitions', { malware, tier2 }),
  listenToVaultChanges: (callback: () => void) => listen("vault_changed", callback),
  listenToScanProgress: (callback: (payload: any) => void) => listen('scan-progress', (event: any) => callback(event.payload)),
  listenToBackupProgress: (callback: (payload: any) => void) => listen('backup-progress', (event: any) => callback(event.payload)),
  listenToDnaMatch: (callback: (payload: any) => void) => listen('dna_match_detected', (event: any) => callback(event.payload)),
  setupDragDrop: (onEnter: () => void, onLeave: () => void, onDrop: (paths: string[]) => void): Promise<() => void> => {
    return getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        onEnter();
      } else if (event.payload.type === 'leave') {
        onLeave();
      } else if (event.payload.type === 'drop') {
        onDrop(event.payload.paths);
      }
    });
  },
  openDialog: open,
  saveDialog: save
};
