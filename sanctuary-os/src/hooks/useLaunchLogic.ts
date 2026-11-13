import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";

export function useLaunchLogic(
  askCustom: (
    title: string,
    showInput: boolean,
    okText: string,
    cancelText: string,
    isDanger: boolean,
    headerText: string
  ) => Promise<any>,
  triggerPrePatchSnapshot: (keepPreviousCompleted?: boolean) => Promise<void>,
  equipPlaySet?: (setName: string) => Promise<void>,
  triggerFullEngineBackup?: (keepPreviousCompleted?: boolean) => Promise<void>
) {
  const setStatus = useStore((s) => s.setStatus);
  const { t } = useLexicon();

  const runEmergencyBackupByPreference = async (config: any) => {
    const backupTarget = Number(config?.defcon_backup_target ?? 0);
    const state = useStore.getState();
    const hasWorldPath = Boolean(
      (state.docsPath || config?.docs_path || config?.user_data_path) &&
        config?.vault_path
    );
    const hasEnginePath = Boolean(config?.live_path && config?.vault_path);

    useModalStore.getState().setCompletedBackups([]);
    useModalStore.getState().setIsDefconBackupSession(true);

    if (backupTarget === 1) {
      if (hasWorldPath) await triggerPrePatchSnapshot(true);
    } else if (backupTarget === 2) {
      if (hasEnginePath && triggerFullEngineBackup) {
        await triggerFullEngineBackup(true);
      } else if (hasWorldPath) {
        await triggerPrePatchSnapshot(true);
      }
    } else {
      if (hasWorldPath) await triggerPrePatchSnapshot(true);
      if (hasEnginePath && triggerFullEngineBackup) {
        await triggerFullEngineBackup(true);
      }
    }
  };

  const handleQuickLaunch = async () => {
    const config: any = await invoke("get_saved_coordinates");
    const storeState = useStore.getState();
    const dPath = String(
      storeState.docsPath || config?.docs_path || config?.user_data_path || config?.mods_path || ""
    ).trim();
    if (dPath) {
      await invoke("recover_interrupted_lab_airgap", {
        docsPath: dPath,
        vaultPath: config?.vault_path || "",
      }).catch(() => {});
    }
    const currentDefcon = storeState.defconLevel;
    const currentPatch = storeState.isPatchDetected;
    const wsScope = String(storeState.activeWorkspaceId || "default")
      .trim()
      .toLowerCase();

    if (currentPatch || currentDefcon < 5) {
      // 0 = Lone Wolf (No Alert), 1 = Alert, 2 = Auto Backup
      const agency = Number(config?.engine_agency_level ?? 2);
      const hasBackedUp =
        localStorage.getItem(`sanctuary_defcon_backup_done_${wsScope}`) ||
        localStorage.getItem("sanctuary_defcon_backup_done");
      const interceptShown =
        localStorage.getItem(`sanctuary_defcon_intercept_shown_${wsScope}`) ||
        localStorage.getItem("sanctuary_defcon_intercept_shown");

      if (agency === 0) {
        // Lone Wolf: no alert on launch either
      } else if (agency === 1) {
        if (!hasBackedUp && !interceptShown) {
          const confirmAlert = await askCustom(
            t(
              "defcon_prompt_intercept_launch",
              "A Game Patch is Active.\n\nWould you like to run an emergency backup before launching?"
            ),
            false,
            t("defcon_btn_backup_launch", "Backup & Launch"),
            t("defcon_btn_launch_danger", "Launch (Danger)"),
            true,
            t("tile_global_alert", "Global Alert")
          );
          try {
            localStorage.setItem(
              `sanctuary_defcon_intercept_shown_${wsScope}`,
              "true"
            );
            localStorage.setItem("sanctuary_defcon_intercept_shown", "true");
          } catch {}

          if (confirmAlert) {
            setStatus(
              t(
                "status_executing_prepatch_snapshot",
                "Creating save snapshot..."
              )
            );
            await runEmergencyBackupByPreference(config);
            try {
              localStorage.setItem(
                `sanctuary_defcon_backup_done_${wsScope}`,
                "true"
              );
              localStorage.setItem("sanctuary_defcon_backup_done", "true");
            } catch {}
          } else {
            const proceedAnyway = await askCustom(
              t(
                "defcon_prompt_confirm_danger",
                "Are you sure you want to proceed WITHOUT a backup?"
              ),
              false,
              t("defcon_btn_launch_danger", "Launch (Danger)"),
              t("cancel", "Cancel"),
              true,
              t("urgent_alert", "Urgent Alert")
            );
            if (!proceedAnyway) return;
          }
        }
      } else {
        // Auto Backup (agency === 2): ensure emergency backup ran before launching
        if (!hasBackedUp) {
          await runEmergencyBackupByPreference(config);
          try {
            localStorage.setItem(
              `sanctuary_defcon_backup_done_${wsScope}`,
              "true"
            );
            localStorage.setItem("sanctuary_defcon_backup_done", "true");
          } catch {}
        }
      }
    }

    try {
      if (equipPlaySet) {
        const activeWorkspaceId =
          useStore.getState().activeWorkspaceId || "default";
        const activeSetName = localStorage.getItem(
          `sanctuary_${activeWorkspaceId}_active_set`
        );
        if (activeSetName) {
          await equipPlaySet(activeSetName);
        }
      }
      const latestConfig: any = await invoke("get_saved_coordinates");
      const msg = await invoke("launch_game", {
        livePath: latestConfig.live_path,
        modsPath: latestConfig.mods_path,
        gameSchema: useStore.getState().activeGameSchema,
      });
      setStatus(t(msg as string, msg as string));
    } catch (err) {
      setStatus(
        `${t("status_launch_failed", "error LAUNCH FAILED")}: ${t(
          err as string,
          String(err)
        )}`
      );
    }
  };

  return { handleQuickLaunch };
}
