import { useEffect } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { tauriBridge } from "../lib/tauri-bridge";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { supabase } from "../supabase";
import {
  dispatchSanctuaryNotification,
  getNotificationMode,
  clearDeliveredNotification,
} from "../utils/notificationHelper";

export function useDefconRadar(t: (key: string, fallback?: string) => string, askCustom: any, triggerPrePatchSnapshot: any, triggerFullEngineBackup: any) {
  const { isPatchDetected, setIsPatchDetected, defconLevel, setDefconLevel, activeWorkspaceId } = useStore();
  const { showDefconAlert, setShowDefconAlert } = useModalStore();

  useEffect(() => {
    const defconUniqueId = `defcon:${activeWorkspaceId || 'global'}:level_1`;

    const triggerDefconNotificationOnce = () => {
      const mode = getNotificationMode('defcon');
      if (mode === 'NONE') return;
      dispatchSanctuaryNotification({
        uniqueId: defconUniqueId,
        category: 'defcon',
        title: t("notif_defcon_os_title", "Game Patch Detected — Safety Lockdown"),
        body: t("notif_defcon_os_body", "A new game update was detected. Sanctuary OS has engaged safety protocols to protect your {mods} and saves."),
        data: { type: 'defcon', workspaceId: activeWorkspaceId },
      });
    };

    const fetchInitialDefcon = async () => {
      setIsPatchDetected(false);
      setShowDefconAlert(false);

      if (navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
        try {
          const { data } = await supabase.from('global_network_status').select('defcon_level').single();
          if (data) {
            setDefconLevel(data.defcon_level);
            if (data.defcon_level === 1) {
              setIsPatchDetected(true);
              triggerDefconNotificationOnce();
            } else {
              setIsPatchDetected(false);
              setShowDefconAlert(false);
              clearDeliveredNotification(defconUniqueId);
            }
          }
        } catch (err) {
          console.error("Failed to fetch initial defcon", err);
        }
      }
    };
    fetchInitialDefcon();

    const checkGameUpdates = async () => {
    };

    const interval = setInterval(checkGameUpdates, 3600000);
    checkGameUpdates();

    let defconSub: any = null;
    if (navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
      defconSub = supabaseServices.subscribeToDefcon((payload: any) => {
        console.log(" DEFCON REALTIME PAYLOAD:", payload);
        const newLevel = payload.new?.defcon_level;
        if (newLevel === 1) {
          setIsPatchDetected(true);
          setDefconLevel(1);
          triggerDefconNotificationOnce();
          const defconMode = getNotificationMode('defcon');
          const ack = localStorage.getItem('sanctuary_defcon_ack');
          if (!ack) {
            localStorage.setItem('sanctuary_defcon_ack', 'true'); 
            tauriBridge.getSavedCoordinates().then((config: any) => {
              const agency = Number(config.engine_agency_level ?? 2);
              const backupTarget = Number(config.defcon_backup_target ?? 0);
              const runDefconBackups = async () => {
                useModalStore.getState().setCompletedBackups([]);
                useModalStore.getState().setIsDefconBackupSession(true);
                setShowDefconAlert(true);
                if (backupTarget === 1) {
                  await triggerPrePatchSnapshot(true);
                } else if (backupTarget === 2) {
                  await triggerFullEngineBackup(true);
                } else {
                  await triggerPrePatchSnapshot(true);
                  await triggerFullEngineBackup(true);
                }
                localStorage.setItem('sanctuary_defcon_backup_done', 'true');
              };
              if (agency === 0) { 
                localStorage.setItem('sanctuary_defcon_ack', 'true');
              } else if (agency === 1) {
                if (defconMode !== 'NONE') {
                  askCustom(t("defcon_prompt_patch_detected", "A game patch has been detected.\n\nWould you like to run an emergency backup now?"), false, t("defcon_btn_backup", "Backup"), t("defcon_btn_skip", "SKIP"), true, t("tile_global_alert", "Global Alert")).then(async (proceed: boolean) => {
                    if (proceed) {
                      await runDefconBackups();
                    }
                  });
                }
              } else { 
                (async () => {
                  await runDefconBackups();
                })();
              }
            }).catch(console.error);
          }
        } else {
          setIsPatchDetected(false);
          setDefconLevel(newLevel || 5);
          setShowDefconAlert(false);
          localStorage.removeItem('sanctuary_defcon_ack');
          localStorage.removeItem('sanctuary_defcon_backup_done');
          clearDeliveredNotification(defconUniqueId);
        }
      });
    }

    return () => {
      clearInterval(interval);
      if (defconSub) defconSub.unsubscribe();
    };
  }, [activeWorkspaceId]);

  return { isPatchDetected, defconLevel, showDefconAlert, setShowDefconAlert, setDefconLevel };
}
