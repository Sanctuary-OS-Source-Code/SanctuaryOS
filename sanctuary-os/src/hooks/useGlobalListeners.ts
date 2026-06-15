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
  const { setScanProgress, setBackupProgress, setDefconLevel, setIsPatchDetected, setShowDefconAlert } = useStore();
  const { setDnaMatches, setIsDnaModalOpen, dnaMatches } = useModalStore();

  // 1. Vault File Changes
  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToVaultChanges(() => {
      fetchBackups();
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Scan Progress (Lab)
  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToScanProgress((payload: any) => {
      setScanProgress(payload);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, [setScanProgress]);

  // 3. Backup Progress
  useEffect(() => {
    let unlisten: any = null;
    tauriBridge.listenToBackupProgress((payload: any) => {
      setBackupProgress(payload);
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, [setBackupProgress]);

  // 4. DNA Matches (Quarantine / Airgap)
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

  // 5. DEFCON Global Channel
  useEffect(() => {
    const processDefconUpdate = (newLevel: number) => {
      if (newLevel === 1) {
        setIsPatchDetected(true);
        setDefconLevel(1);
        setShowDefconAlert(true);
        
        const ack = localStorage.getItem("sanctuary_defcon_ack");
        if (!ack) {
          tauriBridge.getSavedCoordinates().then((config: any) => {
            const pref = Number(config.backup_preference || 0);
            if (pref === 2) {
              localStorage.setItem("sanctuary_defcon_ack", "true");
            } else if (pref === 1) {
              askCustom(t("defcon_prompt_patch_detected"), false, t("defcon_btn_backup"), t("defcon_btn_skip"), true, t("defcon_alert_title")).then((proceed: boolean) => {
                if (proceed) {
                  triggerPrePatchSnapshot();
                  triggerFullEngineBackup();
                  localStorage.setItem("sanctuary_defcon_backup_done", "true");
                }
                localStorage.setItem("sanctuary_defcon_ack", "true");
              });
            } else {
              triggerPrePatchSnapshot();
              triggerFullEngineBackup();
              localStorage.setItem("sanctuary_defcon_ack", "true");
              localStorage.setItem("sanctuary_defcon_backup_done", "true");
            }
          }).catch(console.error);
        }
      } else if (newLevel !== undefined) {
        setIsPatchDetected(false);
        setDefconLevel(newLevel || 5);
        setShowDefconAlert(false);
        localStorage.removeItem("sanctuary_defcon_ack");
        localStorage.removeItem("sanctuary_defcon_backup_done");
      }
    };

    const checkGameUpdates = async () => {
      try {
        const { data: netStatus } = await supabase.from('global_network_status').select('*').single();
        if (netStatus) {
          processDefconUpdate(netStatus.defcon_level);
        }
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    };

    const interval = setInterval(checkGameUpdates, 3600000);
    checkGameUpdates();

    const defconSub = supabase
      .channel("global-defcon-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "global_network_status" }, (payload: any) => {
        processDefconUpdate(payload.new?.defcon_level);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(defconSub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

}
