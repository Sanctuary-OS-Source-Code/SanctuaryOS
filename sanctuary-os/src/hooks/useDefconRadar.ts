import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { supabaseServices } from "../lib/supabase-services";
import { tauriBridge } from "../lib/tauri-bridge";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { supabase, hasActiveGameDatabase } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import {
  dispatchSanctuaryNotification,
  getNotificationMode,
  clearDeliveredNotification,
  syncCrossDeviceNotificationState,
} from "../utils/notificationHelper";

const MAX_HANDLED_INCIDENTS = 30;
const RECENT_PREPATCH_BACKUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const AUDIT_NET_DEDUP_WINDOW_MS = 2 * 60 * 1000;

function normalizeWorkspaceDefconScope(rawWorkspaceId?: string | null): string {
  const cleaned = String(rawWorkspaceId || "").trim().toLowerCase();
  if (!cleaned || cleaned === "default_workspace" || cleaned === "default_schema") {
    return "";
  }
  return cleaned;
}

function readHandledIncidents(wsScope: string): string[] {
  try {
    const raw = localStorage.getItem(`sanctuary_defcon_handled_incidents_${wsScope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function recordHandledIncidents(wsScope: string, ids: string[]) {
  if (!ids.length) return;
  try {
    const existing = readHandledIncidents(wsScope);
    const merged = Array.from(new Set([...existing, ...ids])).slice(-MAX_HANDLED_INCIDENTS);
    localStorage.setItem(
      `sanctuary_defcon_handled_incidents_${wsScope}`,
      JSON.stringify(merged)
    );
  } catch {
    // Ignore storage quota errors
  }
}

function parseIncidentEpochMs(incidentId: string): number {
  const sep = incidentId.indexOf(":");
  if (sep < 0) return 0;
  const tail = incidentId.slice(sep + 1);
  const parsed = Date.parse(tail);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanVersionString(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/^v(?=\d)/i, "")
    .replace(/[^0-9A-Za-z.+-]/g, "");
}

export function useDefconRadar(
  t: (key: string, fallback?: string) => string,
  askCustom: any,
  triggerPrePatchSnapshot: any,
  triggerFullEngineBackup: any
) {
  const {
    isPatchDetected,
    setIsPatchDetected,
    defconLevel,
    setDefconLevel,
    activeWorkspaceId,
    isGameDatabasesSynced,
    activeGameSchema,
  } = useStore(
    useShallow((s) => ({
      isPatchDetected: s.isPatchDetected,
      setIsPatchDetected: s.setIsPatchDetected,
      defconLevel: s.defconLevel,
      setDefconLevel: s.setDefconLevel,
      activeWorkspaceId: s.activeWorkspaceId,
      isGameDatabasesSynced: s.isGameDatabasesSynced,
      activeGameSchema: s.activeGameSchema,
    }))
  );
  const { showDefconAlert, setShowDefconAlert } = useModalStore(
    useShallow((s) => ({
      showDefconAlert: s.showDefconAlert,
      setShowDefconAlert: s.setShowDefconAlert,
    }))
  );

  const evaluatingRef = useRef(false);
  const promptOpenForScopeRef = useRef<string | null>(null);
  const tRef = useRef(t);
  const askCustomRef = useRef(askCustom);
  const prePatchSnapshotRef = useRef(triggerPrePatchSnapshot);
  const fullEngineBackupRef = useRef(triggerFullEngineBackup);

  tRef.current = t;
  askCustomRef.current = askCustom;
  prePatchSnapshotRef.current = triggerPrePatchSnapshot;
  fullEngineBackupRef.current = triggerFullEngineBackup;

  useEffect(() => {
    const wsScope = normalizeWorkspaceDefconScope(activeWorkspaceId);
    if (!wsScope) {
      setIsPatchDetected(false);
      setShowDefconAlert(false);
      return;
    }

    let cancelled = false;
    const baseNotifId = `defcon:${wsScope}:level_1`;

    const dispatchOsOrAppNotification = async (incidentId: string) => {
      const mode = getNotificationMode("defcon", wsScope);
      if (mode === "NONE") return;
      const activeSession = useStore.getState().session;
      if (activeSession?.user?.id) {
        await syncCrossDeviceNotificationState(activeSession);
      }
      if (cancelled) return;
      dispatchSanctuaryNotification({
        uniqueId: `${baseNotifId}:${incidentId}`,
        category: "defcon",
        spokeId: wsScope,
        title: tRef.current(
          "notif_defcon_os_title",
          "Game Patch Detected — Safety Lockdown"
        ),
        body: tRef.current(
          "notif_defcon_os_body",
          "A new game update was detected. Sanctuary OS has engaged safety protocols to protect your {mods} and saves."
        ),
        data: { type: "defcon", workspaceId: activeWorkspaceId },
      });
    };

    const runConfiguredDefconBackups = async (config: any) => {
      const backupTarget = Number(config?.defcon_backup_target ?? 0);
      const state = useStore.getState();
      const hasWorldPath = Boolean(
        (state.docsPath || config?.docs_path || config?.user_data_path) &&
          config?.vault_path
      );
      const hasEnginePath = Boolean(config?.live_path && config?.vault_path);
      if (!hasWorldPath && !hasEnginePath) return;

      useModalStore.getState().setCompletedBackups([]);
      useModalStore.getState().setIsDefconBackupSession(true);
      setShowDefconAlert(true);

      if (backupTarget === 1) {
        if (hasWorldPath) {
          await prePatchSnapshotRef.current(true);
        } else if (hasEnginePath) {
          await fullEngineBackupRef.current(true);
        }
      } else if (backupTarget === 2) {
        if (hasEnginePath) {
          await fullEngineBackupRef.current(true);
        } else if (hasWorldPath) {
          await prePatchSnapshotRef.current(true);
        }
      } else {
        if (hasWorldPath) {
          await prePatchSnapshotRef.current(true);
        }
        if (hasEnginePath) {
          await fullEngineBackupRef.current(true);
        }
      }

      if (useModalStore.getState().completedBackups.length === 0) {
        setShowDefconAlert(false);
        useModalStore.getState().setIsDefconBackupSession(false);
        return;
      }

      const nowStr = String(Date.now());
      try {
        localStorage.setItem(`sanctuary_defcon_backup_done_${wsScope}`, "true");
        localStorage.setItem(`sanctuary_defcon_last_backup_at_${wsScope}`, nowStr);
        localStorage.setItem("sanctuary_defcon_backup_done", "true");
      } catch {
        // Ignore storage errors
      }
    };

    const executeDesktopDefconProtocol = async (opts: {
      incidentIds: string[];
      source: "active_defcon" | "missed_defcon" | "local_patch";
      currentDiskVer?: string;
      latestAuditCreatedAt?: string;
    }) => {
      const { incidentIds, source, currentDiskVer, latestAuditCreatedAt } = opts;
      if (!incidentIds.length || cancelled) return;

      if (!isDesktop()) {
        // Web/PWA: surface status & notification without consuming Desktop open action
        dispatchOsOrAppNotification(incidentIds[0]);
        return;
      }

      const config: any = await tauriBridge.getSavedCoordinates().catch(() => null);
      if (cancelled || !config) return;

      const state = useStore.getState();
      const hasConfiguredPaths = Boolean(
        config.vault_path &&
          (config.live_path ||
            state.docsPath ||
            config.docs_path ||
            config.user_data_path)
      );
      if (!hasConfiguredPaths) {
        // Defer handling until workspace directories are configured
        return;
      }

      // 0 = Lone Wolf (No Alert), 1 = Alert on Open, 2 = Auto Backup on Open
      const agency = Number(config.engine_agency_level ?? 2);

      const finalizeIncidentState = () => {
        recordHandledIncidents(wsScope, incidentIds);
        try {
          if (currentDiskVer) {
            localStorage.setItem(
              `sanctuary_defcon_known_version_${wsScope}`,
              currentDiskVer
            );
          }
          const stamp =
            latestAuditCreatedAt || new Date(Date.now() + 15_000).toISOString();
          localStorage.setItem(`sanctuary_defcon_last_checked_at_${wsScope}`, stamp);
        } catch {
          // Ignore storage errors
        }
      };

      if (agency === 0) {
        // LONE WOLF: Zero alerts, zero toasts, zero modals
        finalizeIncidentState();
        return;
      }

      dispatchOsOrAppNotification(incidentIds[0]);

      if (agency === 1) {
        // ALERT ON DESKTOP OPEN (or live DEFCON)
        if (promptOpenForScopeRef.current === wsScope) return;
        promptOpenForScopeRef.current = wsScope;

        const promptMessage =
          source === "missed_defcon"
            ? tRef.current(
                "defcon_prompt_missed_alert",
                "A DEFCON 1 patch alert was issued while Sanctuary OS was closed.\n\nWould you like to run an emergency backup now?"
              )
            : tRef.current(
                "defcon_prompt_patch_detected",
                "A game patch has been detected.\n\nWould you like to run an emergency backup now?"
              );

        try {
          const proceed = await askCustomRef.current(
            promptMessage,
            false,
            tRef.current("defcon_btn_backup", "Backup"),
            tRef.current("defcon_btn_skip", "Skip"),
            true,
            tRef.current("tile_global_alert", "Global Alert")
          );
          finalizeIncidentState();
          try {
            localStorage.setItem(
              `sanctuary_defcon_intercept_shown_${wsScope}`,
              "true"
            );
            localStorage.setItem("sanctuary_defcon_intercept_shown", "true");
          } catch {}

          if (proceed && !cancelled) {
            await runConfiguredDefconBackups(config);
          }
        } finally {
          if (promptOpenForScopeRef.current === wsScope) {
            promptOpenForScopeRef.current = null;
          }
        }
        return;
      }

      // AUTO BACKUP ON DESKTOP OPEN (agency === 2)
      finalizeIncidentState();
      await runConfiguredDefconBackups(config);
    };

    const evaluateDefconState = async () => {
      if (evaluatingRef.current || cancelled) return;
      evaluatingRef.current = true;

      try {
        const handledSet = new Set(readHandledIncidents(wsScope));
        const pendingIncidentIds: string[] = [];
        let primarySource: "active_defcon" | "missed_defcon" | "local_patch" =
          "active_defcon";
        let currentDiskVer = "";
        let latestAuditCreatedAt = "";
        let networkActiveLockdown = false;

        // 1. Offline-capable local disk engine version check (Desktop)
        if (isDesktop()) {
          const config: any = await tauriBridge
            .getSavedCoordinates()
            .catch(() => null);
          if (config?.live_path) {
            const rawVer = await tauriBridge
              .ripGameVersion(
                config.live_path,
                useStore.getState().activeGameSchema
              )
              .catch(() => useStore.getState().selectedVersion || "");
            currentDiskVer = cleanVersionString(rawVer);
            const prevKnownVer =
              localStorage.getItem(`sanctuary_defcon_known_version_${wsScope}`) ||
              "";

            if (!prevKnownVer && currentDiskVer) {
              try {
                localStorage.setItem(
                  `sanctuary_defcon_known_version_${wsScope}`,
                  currentDiskVer
                );
              } catch {}
            } else if (
              prevKnownVer &&
              currentDiskVer &&
              prevKnownVer !== currentDiskVer
            ) {
              const lastBackupMs = Number(
                localStorage.getItem(
                  `sanctuary_defcon_last_backup_at_${wsScope}`
                ) || 0
              );
              const alreadyProtectedPrePatch =
                lastBackupMs > 0 &&
                Date.now() - lastBackupMs < RECENT_PREPATCH_BACKUP_WINDOW_MS;

              if (alreadyProtectedPrePatch) {
                try {
                  localStorage.setItem(
                    `sanctuary_defcon_known_version_${wsScope}`,
                    currentDiskVer
                  );
                } catch {}
              } else {
                const verIncident = `local_ver:${prevKnownVer}->${currentDiskVer}`;
                if (!handledSet.has(verIncident)) {
                  pendingIncidentIds.push(verIncident);
                  primarySource = "local_patch";
                }
              }
            }
          }
        }

        // 2. Cloud Spoke DEFCON check (Active DEFCON 1 + Missed DEFCON 1 while closed)
        const canQueryCloud =
          typeof navigator !== "undefined" &&
          navigator.onLine &&
          localStorage.getItem("sanctuary_local_only") !== "true" &&
          hasActiveGameDatabase();

        if (canQueryCloud) {
          try {
            const { data: netStatus } = await supabase
              .from("global_network_status")
              .select("id, defcon_level, updated_at")
              .maybeSingle();

            if (netStatus && !cancelled) {
              const lvl = Number(netStatus.defcon_level ?? 5);
              setDefconLevel(lvl);

              if (lvl < 5) {
                networkActiveLockdown = true;
                const activeIncidentId = `net_active:${
                  netStatus.updated_at || `lvl_${lvl}`
                }`;
                if (!handledSet.has(activeIncidentId)) {
                  pendingIncidentIds.unshift(activeIncidentId);
                  primarySource = "active_defcon";
                }
              } else {
                clearDeliveredNotification(baseNotifId);
                try {
                  localStorage.removeItem(
                    `sanctuary_defcon_backup_done_${wsScope}`
                  );
                  localStorage.removeItem(
                    `sanctuary_defcon_intercept_shown_${wsScope}`
                  );
                  localStorage.removeItem("sanctuary_defcon_backup_done");
                  localStorage.removeItem("sanctuary_defcon_intercept_shown");
                } catch {}
              }
            }

            // Check if DEFCON 1 was triggered & stood down while Desktop was closed
            if (isDesktop() && !cancelled) {
              const lastCheckedKey = `sanctuary_defcon_last_checked_at_${wsScope}`;
              const lastCheckedIso = localStorage.getItem(lastCheckedKey);

              if (!lastCheckedIso) {
                // Seed baseline on first-ever boot of this workspace so historical logs aren't replayed
                try {
                  localStorage.setItem(lastCheckedKey, new Date().toISOString());
                } catch {}
              } else {
                const { data: missedRows } = await supabase
                  .from("audit_logs")
                  .select("id, created_at, action")
                  .eq("target_table", "global_network_status")
                  .ilike("action", "%Triggered%DEFCON%")
                  .gt("created_at", lastCheckedIso)
                  .order("created_at", { ascending: false })
                  .limit(1);

                if (Array.isArray(missedRows) && missedRows.length > 0) {
                  const row = missedRows[0];
                  latestAuditCreatedAt = String(row.created_at || "");
                  const auditMs = Date.parse(latestAuditCreatedAt) || 0;
                  const missedIncidentId = `net_missed:${
                    row.id || latestAuditCreatedAt
                  }`;

                  // Deduplicate if this audit row corresponds to an already-handled live net_active event
                  const matchesHandledNetEvent = Array.from(handledSet).some(
                    (id) => {
                      if (!id.startsWith("net_active:")) return false;
                      const netMs = parseIncidentEpochMs(id);
                      return (
                        netMs > 0 &&
                        auditMs > 0 &&
                        Math.abs(auditMs - netMs) < AUDIT_NET_DEDUP_WINDOW_MS
                      );
                    }
                  );

                  if (matchesHandledNetEvent) {
                    recordHandledIncidents(wsScope, [missedIncidentId]);
                    try {
                      localStorage.setItem(
                        lastCheckedKey,
                        latestAuditCreatedAt || new Date().toISOString()
                      );
                    } catch {}
                  } else if (!handledSet.has(missedIncidentId)) {
                    pendingIncidentIds.push(missedIncidentId);
                    if (!networkActiveLockdown) {
                      primarySource = "missed_defcon";
                    }
                  }
                } else {
                  try {
                    localStorage.setItem(
                      lastCheckedKey,
                      new Date().toISOString()
                    );
                  } catch {}
                }
              }
            }
          } catch (err) {
            console.error("Failed to evaluate cloud DEFCON status", err);
          }
        }

        if (cancelled) return;

        if (networkActiveLockdown || pendingIncidentIds.length > 0) {
          setIsPatchDetected(true);
        } else {
          setIsPatchDetected(false);
        }

        if (pendingIncidentIds.length > 0) {
          await executeDesktopDefconProtocol({
            incidentIds: pendingIncidentIds,
            source: primarySource,
            currentDiskVer,
            latestAuditCreatedAt,
          });
        }
      } finally {
        evaluatingRef.current = false;
      }
    };

    evaluateDefconState();

    const interval = setInterval(evaluateDefconState, 3600000);
    const handleOnline = () => {
      evaluateDefconState();
    };
    window.addEventListener("online", handleOnline);

    let defconSub: any = null;
    if (
      typeof navigator !== "undefined" &&
      navigator.onLine &&
      localStorage.getItem("sanctuary_local_only") !== "true" &&
      hasActiveGameDatabase()
    ) {
      defconSub = supabaseServices.subscribeToDefcon((payload: any) => {
        if (cancelled) return;
        const newLevel = Number(payload.new?.defcon_level ?? 5);
        if (newLevel < 5) {
          setIsPatchDetected(true);
          setDefconLevel(newLevel);
          const liveIncidentId = `net_active:${
            payload.new?.updated_at || new Date().toISOString()
          }`;
          const handled = new Set(readHandledIncidents(wsScope));
          if (!handled.has(liveIncidentId)) {
            executeDesktopDefconProtocol({
              incidentIds: [liveIncidentId],
              source: "active_defcon",
              latestAuditCreatedAt: new Date(Date.now() + 15_000).toISOString(),
            }).catch(console.error);
          }
        } else {
          setIsPatchDetected(false);
          setDefconLevel(newLevel || 5);
          setShowDefconAlert(false);
          clearDeliveredNotification(baseNotifId);
          try {
            localStorage.removeItem(`sanctuary_defcon_backup_done_${wsScope}`);
            localStorage.removeItem(
              `sanctuary_defcon_intercept_shown_${wsScope}`
            );
            localStorage.removeItem("sanctuary_defcon_backup_done");
            localStorage.removeItem("sanctuary_defcon_intercept_shown");
          } catch {}
        }
      });
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      if (defconSub) defconSub.unsubscribe();
    };
  }, [activeWorkspaceId, isGameDatabasesSynced, activeGameSchema?.id]);

  return {
    isPatchDetected,
    defconLevel,
    showDefconAlert,
    setShowDefconAlert,
    setDefconLevel,
  };
}
