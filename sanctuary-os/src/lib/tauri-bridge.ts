import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isDesktop } from "../utils/envUtils";

export const tauriBridge = {
  getSavedCoordinates: () => invoke("get_saved_coordinates"),
  ripGameVersion: (livePath: string, gameSchema?: any, docsPath?: string) =>
    invoke<string>("rip_game_version", { livePath, gameSchema, docsPath }),
  moveModToPriorityFolder: (vaultPath: string, modName: string, targetFolder: string) =>
    invoke("move_mod_to_priority_folder", { vaultPath, modName, targetFolder }),
  listenToVaultChanges: (callback: (path?: string) => void) =>
    isDesktop() ? listen("vault_changed", (event: any) => callback(event.payload)) : Promise.resolve(() => {}),
  listenToScanProgress: (callback: (payload: any) => void) =>
    isDesktop() ? listen("scan-progress", (event: any) => callback(event.payload)) : Promise.resolve(() => {}),
  listenToBackupProgress: (callback: (payload: any) => void) =>
    isDesktop() ? listen("backup-progress", (event: any) => callback(event)) : Promise.resolve(() => {}),
  listenToDnaMatch: (callback: (payload: any) => void) =>
    isDesktop() ? listen("dna_match_detected", (event: any) => callback(event.payload)) : Promise.resolve(() => {}),
};
