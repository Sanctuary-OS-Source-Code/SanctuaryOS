import { useState, useEffect } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { tauriBridge } from "../lib/tauri-bridge";

export function useDefconRadar(t: (key: string) => string, askCustom: any, triggerPrePatchSnapshot: any, triggerFullEngineBackup: any) {
  const [isPatchDetected, setIsPatchDetected] = useState(false);
  const [defconLevel, setDefconLevel] = useState<number>(5);
  const [showDefconAlert, setShowDefconAlert] = useState(false);

  useEffect(() => {
    const checkGameUpdates = async () => {
      // Mock logic or actual API check for game updates
      // This is a placeholder for the actual hourly check
    };

    const interval = setInterval(checkGameUpdates, 3600000);
    checkGameUpdates();

    const defconSub = supabaseServices.subscribeToDefcon((payload: any) => {
      console.log(" DEFCON REALTIME PAYLOAD:", payload);
      const newLevel = payload.new?.defcon_level;
      if (newLevel === 1) {
        setIsPatchDetected(true);
        setDefconLevel(1);
        const ack = localStorage.getItem('sanctuary_defcon_ack');
        if (!ack) {
          tauriBridge.getSavedCoordinates().then((config: any) => {
            const pref = Number(config.backup_preference || 0);
            if (pref === 2) {
              localStorage.setItem('sanctuary_defcon_ack', 'true');
            } else if (pref === 1) {
              askCustom(t("defcon_prompt_patch_detected"), false, t("defcon_btn_backup"), t("defcon_btn_skip"), true, t("defcon_alert_title")).then((proceed: boolean) => {
                if (proceed) {
                  setShowDefconAlert(true);
                  triggerPrePatchSnapshot();
                  triggerFullEngineBackup();
                  localStorage.setItem('sanctuary_defcon_backup_done', 'true');
                }
                localStorage.setItem('sanctuary_defcon_ack', 'true');
              });
            } else {
              setShowDefconAlert(true);
              triggerPrePatchSnapshot();
              triggerFullEngineBackup();
              localStorage.setItem('sanctuary_defcon_ack', 'true');
              localStorage.setItem('sanctuary_defcon_backup_done', 'true');
            }
          }).catch(console.error);
        }
      } else {
        setIsPatchDetected(false);
        setDefconLevel(newLevel || 5);
        localStorage.removeItem('sanctuary_defcon_ack');
        localStorage.removeItem('sanctuary_defcon_backup_done');
      }
    });

    return () => {
      clearInterval(interval);
      defconSub.unsubscribe();
    };
  }, [t, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup]);

  return { isPatchDetected, defconLevel, showDefconAlert, setShowDefconAlert, setDefconLevel };
}
