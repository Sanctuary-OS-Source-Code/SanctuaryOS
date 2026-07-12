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
    tauriBridge.listenToVaultChanges(() => {
      fetchBackups();
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
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
