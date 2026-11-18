import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isDesktop } from "../utils/envUtils";
import {
  getCloudSessionCleanMods,
  checkAndPromptSymlinkCloudSyncConsent,
} from "../utils/cloudSyncGuard";

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
  equipPlaySet?: (
    setName: string,
    overrideSet?: any,
    skipCloudCheck?: boolean,
    onAfterAuthorizedDeploy?: () => void
  ) => Promise<boolean | void>,
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

  const runQuickLaunchFlow = async (skipCloudCheck: boolean) => {
    const config: any = await invoke("get_saved_coordinates");
    const storeState = useStore.getState();

    if (!skipCloudCheck) {
      const allowed = await checkAndPromptSymlinkCloudSyncConsent({
        modsPath: config?.mods_path || storeState.modsPath,
        vaultPath: config?.vault_path || storeState.vaultPath,
        docsPath:
          config?.docs_path || config?.user_data_path || storeState.docsPath,
        livePath: config?.live_path || storeState.livePath,
        actionLabel: t("btn_quick_launch", "Quick Launch"),
        onAuthorizedProceed: () => {
          void runQuickLaunchFlow(true);
        },
      });
      if (!allowed) {
        setStatus(
          t(
            "cloud_guard_pending_action_canceled",
            "Cloud-sync folder consent required before projecting symlinks."
          )
        );
        return;
      }
    }

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

    const resolveActiveBlueprintContext = () => {
      const latestState = useStore.getState();
      const wsId = latestState.activeWorkspaceId || "default";
      const bpName =
        latestState.activeSetName ||
        localStorage.getItem(`sanctuary_${wsId}_active_set`) ||
        "";
      const allSets = Array.isArray(latestState.playSets) ? latestState.playSets : [];
      const activeSet = bpName
        ? allSets.find((s: any) => s?.name === bpName)
        : null;
      const mods: string[] = Array.isArray(activeSet?.mods)
        ? activeSet.mods
            .map((m: any) =>
              typeof m === "string" ? m : String(m?.name || m?.path || "")
            )
            .filter(Boolean)
        : [];
      return { wsId, bpName, activeSet, mods };
    };

    const executeGameIgnition = async () => {
      const { wsId: activeWorkspaceId, bpName, mods: activeModsList } =
        resolveActiveBlueprintContext();
      const cleanupSymlinksOnExit = getCloudSessionCleanMods(activeWorkspaceId);
      const latestConfig: any = await invoke("get_saved_coordinates");
      const autoPurgeCaches =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("sanctuary_auto_purge_caches_on_launch") !== "false"
          : true;
      const msg = await invoke("launch_game", {
        livePath: latestConfig.live_path,
        modsPath: latestConfig.mods_path,
        disabledDlc: useStore.getState().maskedDLC,
        autoPurgeCaches,
        cleanupSymlinksOnExit,
        gameSchema: useStore.getState().activeGameSchema,
      });
      setStatus(t(msg as string, msg as string));

      if (isDesktop() && bpName && activeModsList.length > 0 && latestConfig?.vault_path) {
        const docsRoot = String(
          storeState.docsPath ||
            latestConfig?.docs_path ||
            latestConfig?.user_data_path ||
            ""
        ).trim();
        void invoke("record_save_doctor_manifest", {
          vaultPath: String(latestConfig.vault_path),
          docsPath: docsRoot || null,
          workspaceId: activeWorkspaceId,
          blueprintName: bpName,
          activeMods: activeModsList,
        }).catch(() => {});
      }

      if (isDesktop()) {
        const postLaunchAction =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("sanctuary_post_launch_action") || "keep_open"
            : "keep_open";
        // Keep Sanctuary OS alive (minimized) if post-exit symlink cleanup watcher needs to run when the game closes
        const effectiveAction =
          cleanupSymlinksOnExit && postLaunchAction === "close"
            ? "minimize"
            : postLaunchAction;
        if (effectiveAction === "minimize") {
          setTimeout(() => {
            getCurrentWebviewWindow().minimize().catch(() => {});
          }, 600);
        } else if (effectiveAction === "close") {
          setTimeout(() => {
            getCurrentWebviewWindow().close().catch(() => {});
          }, 800);
        }
      }
    };

    try {
      const agency = Number(config?.engine_agency_level ?? 2);
      const bpCtx = resolveActiveBlueprintContext();
      if (agency !== 0 && bpCtx.activeSet && isDesktop() && (config?.vault_path || storeState.vaultPath)) {
        try {
          const doctorReport = await invoke<{
            has_warning: boolean;
            previous_blueprint: string;
            missing_count: number;
            missing_sample: string[];
          }>("check_save_doctor_prelaunch", {
            vaultPath: String(config?.vault_path || storeState.vaultPath || ""),
            docsPath: dPath || null,
            workspaceId: bpCtx.wsId,
            blueprintName: bpCtx.bpName,
            nextMods: bpCtx.mods,
          });
          if (doctorReport?.has_warning && doctorReport.missing_count > 0) {
            const sampleList = (doctorReport.missing_sample || []).join(", ");
            const proceedDoctor = await askCustom(
              `${t(
                "save_doctor_prelaunch_warning_prefix",
                "Save Doctor Alert: Your active {Blueprint} is missing"
              )} ${doctorReport.missing_count} ${t("term_mods", "{Mods}")} ${t(
                "save_doctor_prelaunch_warning_from",
                "from your last saved session"
              )} (${doctorReport.previous_blueprint || bpCtx.bpName}): ${sampleList}`,
              false,
              t("save_doctor_btn_launch_anyway", "Launch Anyway"),
              t("cancel", "Cancel"),
              true,
              t("save_doctor_title", "Save Doctor Check")
            );
            if (!proceedDoctor) return;
          }
        } catch {
          // Non-fatal pre-launch check
        }
      }

      if (equipPlaySet) {
        const latestState = useStore.getState();
        const activeWorkspaceId = latestState.activeWorkspaceId || "default";
        const activeSetName =
          latestState.activeSetName ||
          localStorage.getItem(`sanctuary_${activeWorkspaceId}_active_set`);
        const allSets = latestState.playSets;
        const hasMatchingSet =
          Array.isArray(allSets) &&
          allSets.some((s: any) => s?.name === activeSetName);
        if (activeSetName && hasMatchingSet) {
          const equipped = await equipPlaySet(activeSetName, undefined, true);
          if (equipped === false) {
            return;
          }
        }
      }
      await executeGameIgnition();
    } catch (err) {
      setStatus(
        `${t("status_launch_failed", "error LAUNCH FAILED")}: ${t(
          err as string,
          String(err)
        )}`
      );
    }
  };

  const handleQuickLaunch = async () => {
    await runQuickLaunchFlow(false);
  };

  return { handleQuickLaunch };
}
