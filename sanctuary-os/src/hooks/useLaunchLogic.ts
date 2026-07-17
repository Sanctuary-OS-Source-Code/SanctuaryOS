import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";

export function useLaunchLogic(
  askCustom: (title: string, showInput: boolean, okText: string, cancelText: string, isDanger: boolean, headerText: string) => Promise<any>,
  triggerPrePatchSnapshot: () => Promise<void>
) {
  const { setStatus, isPatchDetected, defconLevel } = useStore();
  const { t } = useLexicon();

  const handleQuickLaunch = async () => {
    const config: any = await invoke("get_saved_coordinates");
    const currentDefcon = useStore.getState().defconLevel;
    const currentPatch = useStore.getState().isPatchDetected;
    
    if (currentPatch || currentDefcon < 5) {
      const pref = Number(config.engine_agency_level ?? 2);
      const hasBackedUp = localStorage.getItem("sanctuary_defcon_backup_done");
      const interceptShown = localStorage.getItem("sanctuary_defcon_intercept_shown");

      if (!hasBackedUp && !interceptShown) {
        if (pref === 2) {
          const confirmLoneWolf = await askCustom(
            t("defcon_lonewolf_warning"),
            false,
            t("defcon_btn_launch_danger"),
            t("nav_cancel"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          if (!confirmLoneWolf) return;
          localStorage.setItem("sanctuary_defcon_intercept_shown", "true");
        } else if (pref === 1) {
          const confirmAlert = await askCustom(
            t("defcon_prompt_intercept_launch"),
            false,
            t("defcon_btn_backup_launch"),
            t("defcon_btn_launch_danger"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          localStorage.setItem("sanctuary_defcon_intercept_shown", "true");
          if (confirmAlert) {
            setStatus(
              `${t("icon_block")} Intercept: Forcing emergency backup before ignition...`,
            );
            await triggerPrePatchSnapshot();
            localStorage.setItem("sanctuary_defcon_backup_done", "true");
          } else {
            const proceedAnyway = await askCustom(
              t("defcon_prompt_confirm_danger"),
              false,
              t("defcon_btn_launch_danger"),
              t("nav_cancel"),
              true,
              "CONFIRM DANGER",
            );
            if (!proceedAnyway) return;
          }
        } else {
          const confirm = await askCustom(
            t("defcon_launch_intercept"),
            false,
            t("defcon_btn_launch_danger"),
            t("nav_cancel"),
            true,
            "DEFCON 1 INTERCEPT!",
          );
          localStorage.setItem("sanctuary_defcon_intercept_shown", "true");
          if (!confirm) return;
        }
      }
    }
    try {
      const config: any = await invoke("get_saved_coordinates");
      const msg = await invoke("launch_game", {
        livePath: config.live_path,
        modsPath: config.mods_path,
      });
      setStatus(t(msg as string) || (msg as string));
    } catch (err) {
      setStatus(`${t("status_launch_failed")}: ${t(err as string) || err}`);
    }
  };

  return { handleQuickLaunch };
}
