import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../supabase";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { tauriBridge } from "../lib/tauri-bridge";

export function useGlobalListeners(
  fetchBackups: () => void,
  askCustom: any,
  t: (k: string) => string,
  triggerPrePatchSnapshot: () => void,
  triggerFullEngineBackup: () => void
) {
  const { setScanProgress, setBackupProgress, setDefconLevel, setIsPatchDetected } = useStore();
  const { setDnaMatches, setIsDnaModalOpen, dnaMatches, setShowDefconAlert } = useModalStore();

  useEffect(() => {
    let unlisten: any = null;
    let vaultTimeout: any = null;
    let accumulatedPaths: Set<string> = new Set();

    tauriBridge.listenToVaultChanges((path?: string) => {
      if (path) {
        accumulatedPaths.add(path.replace(/\\/g, '/'));
      }

      if (vaultTimeout) {
        clearTimeout(vaultTimeout);
      }
      vaultTimeout = setTimeout(() => {
        if (accumulatedPaths.size > 0) {
          const pathsToUpdate = new Set(accumulatedPaths);
          accumulatedPaths.clear();
          
          useStore.setState(state => ({
            modList: state.modList.map(m => {
              const normalizedModPath = (m.physical_path || m.name)?.replace(/\\/g, '/');
              if (normalizedModPath && pathsToUpdate.has(normalizedModPath)) {
                return { ...m, hasUpdate: undefined, newVersion: undefined, newGameVersion: undefined, download_url: undefined };
              }
              return m;
            })
          }));
        }

        fetchBackups();
        window.dispatchEvent(new Event('force-radar-sweep'));
      }, 200);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
      if (vaultTimeout) clearTimeout(vaultTimeout);
    };
  }, []);

  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToScanProgress((payload: any) => {
      setScanProgress(payload);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, [setScanProgress]);

  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToBackupProgress((payload: any) => {
      setBackupProgress(payload);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, [setBackupProgress]);

  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToDnaMatch((payload: any) => {
      setDnaMatches([...dnaMatches, payload]);
      setIsDnaModalOpen(true);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, [dnaMatches, setDnaMatches, setIsDnaModalOpen]);

  // Defcon listener logic was moved to useDefconRadar.ts to prevent websocket channel conflicts.

}
