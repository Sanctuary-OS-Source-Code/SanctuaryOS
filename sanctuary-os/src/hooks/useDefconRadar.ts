import { useState, useEffect } from "react";
import { supabaseServices } from "../lib/supabase-services";
import { tauriBridge } from "../lib/tauri-bridge";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { supabase } from "../supabase";

export function useDefconRadar(t: (key: string) => string, askCustom: any, triggerPrePatchSnapshot: any, triggerFullEngineBackup: any) {
  const { isPatchDetected, setIsPatchDetected, defconLevel, setDefconLevel, activeWorkspaceId } = useStore();
  const { showDefconAlert, setShowDefconAlert } = useModalStore();

  useEffect(() => {
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
            } else {
              setIsPatchDetected(false);
              setShowDefconAlert(false);
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
          const ack = localStorage.getItem('sanctuary_defcon_ack');
          if (!ack) {
            localStorage.setItem('sanctuary_defcon_ack', 'true'); 
            tauriBridge.getSavedCoordinates().then((config: any) => {
              const agency = Number(config.engine_agency_level ?? 2); 
              if (agency === 0) { 
                localStorage.setItem('sanctuary_defcon_ack', 'true');
              } else if (agency === 1) {
                askCustom(t("defcon_prompt_patch_detected"), false, t("defcon_btn_backup"), t("defcon_btn_skip"), true, t("defcon_alert_title")).then(async (proceed: boolean) => {
                  if (proceed) {
                    setShowDefconAlert(true);
                    await triggerPrePatchSnapshot();
                    await triggerFullEngineBackup();
                    localStorage.setItem('sanctuary_defcon_backup_done', 'true');
                  }
                });
              } else { 
                setShowDefconAlert(true);
                (async () => {
                  await triggerPrePatchSnapshot();
                  await triggerFullEngineBackup();
                  localStorage.setItem('sanctuary_defcon_backup_done', 'true');
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
