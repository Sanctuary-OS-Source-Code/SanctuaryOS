import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import {
  KnownErrorDiagnosisBanner,
  getExceptionRules,
  isUnrelatedGameBugLog,
} from "./KnownExceptionRules";
import { scrubLogUserData, formatHumanReadableLogText } from "../utils/logScrubber";

export interface LabSaveFileInfo {
  file_name: string;
  modified_epoch: number;
  size_kb: number;
}

export interface LabTestSaveStatus {
  has_test_save: boolean;
  active_test_save?: LabSaveFileInfo | null;
  sandbox_saves: LabSaveFileInfo[];
  available_live_saves: LabSaveFileInfo[];
  airgap_active: boolean;
}

export interface LabVerificationCertificate {
  dna_hash: string;
  mod_name: string;
  verified_at: number;
  active_seconds: number;
  baseline_ram_mb: number;
  peak_ram_mb: number;
  disk_read_mb: number;
  save_file_verified: string;
}

export interface LabVerificationStatus {
  active: boolean;
  dna_hash: string;
  mod_name: string;
  stage: "BOOTING" | "MENU_WAITING" | "ACTIVE_TESTING" | "AWAITING_SAVE" | "VERIFIED" | "FAILED" | string;
  pause_reason?: "UNFOCUSED" | "IDLE" | string | null;
  tracked_pid?: number | null;
  baseline_ram_mb: number;
  current_ram_mb: number;
  peak_ram_mb: number;
  ram_step_percent: number;
  disk_read_mb: number;
  min_disk_read_mb: number;
  min_ram_step_percent: number;
  required_active_seconds: number;
  elapsed_active_seconds: number;
  remaining_active_seconds: number;
  max_idle_seconds: number;
  current_idle_seconds: number;
  is_focused: boolean;
  require_focus: boolean;
  require_save_checkpoint: boolean;
  seeded_save_present: boolean;
  verified_save_name?: string | null;
  linked_files?: string[];
  error_log?: string | null;
  certificate?: LabVerificationCertificate | null;
}

const LOCAL_CERT_STORAGE_KEY = "sanctuary_lab_certificates";
const LOCAL_FAIL_STORAGE_KEY = "sanctuary_lab_failed_hashes";
const LOCAL_SESSION_MEMORY_KEY = "sanctuary_lab_active_session_memory";

export function saveLabSessionMemory(status: LabVerificationStatus | null) {
  try {
    if (!status) {
      localStorage.removeItem(LOCAL_SESSION_MEMORY_KEY);
    } else {
      localStorage.setItem(LOCAL_SESSION_MEMORY_KEY, JSON.stringify(status));
    }
  } catch (e) {}
}

export function loadLabSessionMemory(): LabVerificationStatus | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_MEMORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

export function getCachedCertificatesMap(): Record<string, LabVerificationCertificate> {
  try {
    const raw = localStorage.getItem(LOCAL_CERT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

export function getCachedFailedMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_FAIL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

export async function recordVerifiedCertificate(cert: LabVerificationCertificate) {
  try {
    const map = getCachedCertificatesMap();
    map[cert.dna_hash] = cert;
    localStorage.setItem(LOCAL_CERT_STORAGE_KEY, JSON.stringify(map));

    const failMap = getCachedFailedMap();
    if (failMap[cert.dna_hash]) {
      delete failMap[cert.dna_hash];
      localStorage.setItem(LOCAL_FAIL_STORAGE_KEY, JSON.stringify(failMap));
    }

    if (isDesktop()) {
      const config: any = await invoke("get_saved_coordinates");
      if (config?.vault_path) {
        await invoke("record_lab_certificate", {
          vaultPath: config.vault_path,
          certificate: cert,
        });
      }
    }

    // Also record in Supabase homestead_lab_logs ONLY if version exists and mod is verified Tier 0
    const { data: verData } = await supabase
      .from("mod_versions")
      .select("id, mod_id, mods(compliance_tier, status)")
      .eq("dna_hash", cert.dna_hash)
      .maybeSingle();

    const verMod = Array.isArray((verData as any)?.mods)
      ? (verData as any).mods[0]
      : (verData as any)?.mods;
    if (
      verData &&
      verMod &&
      Number(verMod.compliance_tier || 0) === 0 &&
      String(verMod.status || "").toLowerCase() !== "unverified"
    ) {
      await supabase.from("homestead_lab_logs").insert([
        {
          mod_id: verData.mod_id,
          version_id: verData.id,
          log_snippet: "Clean",
          tester_note: JSON.stringify({
            type: "PASS_VERIFIED_4STAGE",
            dna_hash: cert.dna_hash,
            active_seconds: cert.active_seconds,
            peak_ram_mb: cert.peak_ram_mb,
            disk_read_mb: cert.disk_read_mb,
            save_file_verified: cert.save_file_verified,
            verified_at: cert.verified_at,
          }),
        },
      ]);
    }

    window.dispatchEvent(new CustomEvent("sanctuary-lab-cert-updated", { detail: { dna_hash: cert.dna_hash } }));
  } catch (e) {
    console.error("Failed to record lab certificate:", e);
  }
}

export function recordFailedVerification(dnaHash: string, errorLog: string) {
  try {
    const failMap = getCachedFailedMap();
    failMap[dnaHash] = scrubLogUserData(errorLog);
    localStorage.setItem(LOCAL_FAIL_STORAGE_KEY, JSON.stringify(failMap));
    window.dispatchEvent(new CustomEvent("sanctuary-lab-cert-updated", { detail: { dna_hash: dnaHash } }));
  } catch (e) {}
}

export async function checkDnaHashVerification(dnaHash?: string | null): Promise<{
  verified: boolean;
  failed: boolean;
  cert?: LabVerificationCertificate;
  errorLog?: string;
}> {
  if (!dnaHash) return { verified: false, failed: false };

  // 1. Check local storage cache
  const localMap = getCachedCertificatesMap();
  if (localMap[dnaHash]) {
    return { verified: true, failed: false, cert: localMap[dnaHash] };
  }

  // 2. Check Tauri vault file on desktop
  if (isDesktop()) {
    try {
      const config: any = await invoke("get_saved_coordinates");
      if (config?.vault_path) {
        const certs = await invoke<LabVerificationCertificate[]>("get_lab_certificates", {
          vaultPath: config.vault_path,
        });
        const match = (certs || []).find((c) => c.dna_hash === dnaHash);
        if (match) {
          localMap[dnaHash] = match;
          localStorage.setItem(LOCAL_CERT_STORAGE_KEY, JSON.stringify(localMap));
          return { verified: true, failed: false, cert: match };
        }
      }
    } catch (e) {}
  }

  // 3. Check Supabase homestead_lab_logs for this version's dna_hash
  try {
    const { data: verData } = await supabase
      .from("mod_versions")
      .select("id, mod_id")
      .eq("dna_hash", dnaHash)
      .maybeSingle();

    if (verData?.id) {
      const { data: logs } = await supabase
        .from("homestead_lab_logs")
        .select("log_snippet, tester_note, created_at")
        .eq("version_id", verData.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (logs && logs.length > 0) {
        for (const l of logs) {
          if (l.log_snippet === "Clean" || (l.tester_note && l.tester_note.includes("PASS_VERIFIED"))) {
            let parsed: any = {};
            try {
              parsed = JSON.parse(l.tester_note || "{}");
            } catch (e) {}
            const cert: LabVerificationCertificate = {
              dna_hash: dnaHash,
              mod_name: parsed.mod_name || dnaHash,
              verified_at: parsed.verified_at || Math.floor(new Date(l.created_at || Date.now()).getTime() / 1000),
              active_seconds: parsed.active_seconds || 120,
              baseline_ram_mb: parsed.baseline_ram_mb || 0,
              peak_ram_mb: parsed.peak_ram_mb || 0,
              disk_read_mb: parsed.disk_read_mb || 0,
              save_file_verified: parsed.save_file_verified || "Cloud_Verified.save",
            };
            localMap[dnaHash] = cert;
            localStorage.setItem(LOCAL_CERT_STORAGE_KEY, JSON.stringify(localMap));
            return { verified: true, failed: false, cert };
          }
        }
        // If latest log had an exception and no clean log exists
        const latest = logs[0];
        if (latest.log_snippet && latest.log_snippet !== "Clean") {
          return { verified: false, failed: true, errorLog: scrubLogUserData(latest.log_snippet) };
        }
      }
    }
  } catch (e) {}

  // 4. Check local failed map
  const failMap = getCachedFailedMap();
  if (failMap[dnaHash]) {
    return { verified: false, failed: true, errorLog: scrubLogUserData(failMap[dnaHash]) };
  }

  return { verified: false, failed: false };
}

export function LabVerificationBadge({
  dnaHash,
  required = true,
  compact = false,
}: {
  dnaHash?: string | null;
  required?: boolean;
  compact?: boolean;
}) {
  const { t } = useLexicon();
  const [state, setState] = useState<{ verified: boolean; failed: boolean }>({
    verified: false,
    failed: false,
  });

  const refresh = useCallback(async () => {
    if (!dnaHash) return;
    const res = await checkDnaHashVerification(dnaHash);
    setState({ verified: res.verified, failed: res.failed });
  }, [dnaHash]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("sanctuary-lab-cert-updated", handler);
    return () => window.removeEventListener("sanctuary-lab-cert-updated", handler);
  }, [refresh]);

  if (!dnaHash) return null;

  const baseSizeClass = compact
    ? "px-2 py-0.5 rounded-md text-[8px] font-black tracking-wider uppercase flex items-center gap-1.5 shrink-0 bg-transparent border"
    : "px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider uppercase flex items-center gap-1.5 shrink-0 bg-transparent border";

  if (state.verified) {
    return (
      <span className={`${baseSizeClass} border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]`}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--success)] shrink-0">
          {t("icon_verified", "verified")}
        </span>
        {compact
          ? t("lab_badge_short_verified", "Lab Verified")
          : t("lab_gate_badge_verified", "VERIFIED FOR PUBLISH")}
      </span>
    );
  }

  if (state.failed) {
    return (
      <span className={`${baseSizeClass} border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]`}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)] shrink-0">
          {t("icon_error", "error")}
        </span>
        {compact
          ? t("lab_badge_short_failed", "Lab Failed")
          : t("lab_gate_badge_failed", "VERIFICATION FAILED — REJECT ONLY")}
      </span>
    );
  }

  if (!required) return null;

  return (
    <span className={`${baseSizeClass} border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]`}>
      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)] shrink-0">
        {t("icon_science", "science")}
      </span>
      {compact
        ? t("lab_badge_short_required", "Lab Test Required")
        : t("lab_gate_badge_required", "TIMED LAB TEST REQUIRED")}
    </span>
  );
}

interface LabVerificationGateProps {
  dnaHash?: string | null;
  modName: string;
  physicalPath?: string | null;
  isSandboxMod?: boolean;
  roleContext: "mason" | "scout" | "architect" | "lab";
  isGateRequired: boolean;
  externalStatus?: LabVerificationStatus | null;
  hideErrorLog?: boolean;
  onStatusChange?: (status: {
    verified: boolean;
    failed: boolean;
    running: boolean;
    cert?: LabVerificationCertificate;
    errorLog?: string;
  }) => void;
  onOpenInFullLab?: () => void;
}

export function LabVerificationGate({
  dnaHash,
  modName,
  physicalPath,
  isSandboxMod = false,
  roleContext,
  isGateRequired,
  externalStatus,
  hideErrorLog = false,
  onStatusChange,
  onOpenInFullLab,
}: LabVerificationGateProps) {
  const { t } = useLexicon();
  const [verifiedCert, setVerifiedCert] = useState<LabVerificationCertificate | undefined>(undefined);
  const [failedError, setFailedError] = useState<string | undefined>(undefined);
  const [liveStatus, setLiveStatus] = useState<LabVerificationStatus | null>(() => {
    const mem = loadLabSessionMemory();
    const effectiveHash = dnaHash || modName;
    if (mem && (mem.dna_hash === effectiveHash || mem.mod_name === modName || roleContext === "lab")) {
      return mem;
    }
    return null;
  });
  const [isStarting, setIsStarting] = useState(false);
  const pollRef = useRef<any>(null);

  const activeSession = externalStatus || liveStatus;
  const isRunning =
    !!activeSession &&
    activeSession.stage !== "VERIFIED" &&
    activeSession.stage !== "FAILED";

  useEffect(() => {
    if (activeSession) {
      saveLabSessionMemory(activeSession);
    }
  }, [activeSession]);

  const syncVerificationState = useCallback(async () => {
    const effectiveHash = dnaHash || modName;
    if (!effectiveHash) return;
    const res = await checkDnaHashVerification(effectiveHash);
    setVerifiedCert(res.cert);
    setFailedError(res.errorLog);
    if (onStatusChange) {
      onStatusChange({
        verified: res.verified,
        failed: res.failed,
        running: false,
        cert: res.cert,
        errorLog: res.errorLog,
      });
    }
  }, [dnaHash, modName, onStatusChange]);

  const cleanupSandboxAfterInlineRun = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = (config?.mods_path || "").split(/[\\/]Mods/i)[0];
      if (dPath) {
        await invoke("airgap_saves", { docsPath: dPath, enable: false });
      }
      await invoke("stop_lab_verification_session");
      await invoke("repopulate_from_shelter");
    } catch (e) {}
  }, []);

  const attachPollingLoop = useCallback(
    (effectiveHash: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const st = await invoke<LabVerificationStatus | null>("poll_lab_verification_session");
          if (!st) return;
          setLiveStatus(st);
          saveLabSessionMemory(st);

          if (st.stage === "VERIFIED" && st.certificate) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            await recordVerifiedCertificate(st.certificate);
            setVerifiedCert(st.certificate);
            if (roleContext !== "lab") {
              await cleanupSandboxAfterInlineRun();
            }
            if (onStatusChange) {
              onStatusChange({
                verified: true,
                failed: false,
                running: false,
                cert: st.certificate,
              });
            }
            useStore.getState().pushStatus(
              t("lab_stage_verified", "Simulation Verified & Signed"),
              "success"
            );
          } else if (st.stage === "FAILED") {
            if (st.error_log && isUnrelatedGameBugLog(st.error_log)) {
              return;
            }
            clearInterval(pollRef.current);
            pollRef.current = null;
            const errText =
              st.error_log ||
              t(
                "lab_stage_failed_desc",
                "Fatal exception or process crash detected during sandbox simulation."
              );
            recordFailedVerification(effectiveHash, errText);
            setFailedError(errText);
            if (roleContext !== "lab") {
              await cleanupSandboxAfterInlineRun();
            }
            if (onStatusChange) {
              onStatusChange({
                verified: false,
                failed: true,
                running: false,
                errorLog: errText,
              });
            }
            useStore.getState().pushStatus(errText, "error");
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 1000);
    },
    [cleanupSandboxAfterInlineRun, onStatusChange, roleContext, t]
  );

  // Auto-reconnect on mount if a verification session is active in Rust (in case panel was accidentally closed)
  useEffect(() => {
    if (!isDesktop() || externalStatus) return;
    let mounted = true;
    const effectiveHash = dnaHash || modName;
    invoke<LabVerificationStatus | null>("poll_lab_verification_session")
      .then((st) => {
        if (!mounted || !st) return;
        if (st.dna_hash === effectiveHash || st.mod_name === modName || roleContext === "lab") {
          setLiveStatus(st);
          saveLabSessionMemory(st);
          if (st.stage !== "VERIFIED" && st.stage !== "FAILED") {
            attachPollingLoop(st.dna_hash || effectiveHash);
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [dnaHash, modName, roleContext, externalStatus, attachPollingLoop]);

  useEffect(() => {
    syncVerificationState();
    const handler = () => syncVerificationState();
    window.addEventListener("sanctuary-lab-cert-updated", handler);
    return () => {
      window.removeEventListener("sanctuary-lab-cert-updated", handler);
    };
  }, [syncVerificationState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleStartInlineTimedTest = async () => {
    const effectiveHash = dnaHash || modName;
    if (!isDesktop() || !effectiveHash) return;
    setIsStarting(true);
    setFailedError(undefined);
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = (config?.mods_path || "").split(/[\\/]Mods/i)[0];

      // Sync latest exception_rules to Rust so Unrelated (Normal Game Bug) rules are ignored during live polling
      try {
        const currentSchema = useStore.getState().activeGameSchema || {};
        const currentRules = getExceptionRules(currentSchema);
        await invoke("update_active_game_schema", {
          schema: { ...currentSchema, exception_rules: currentRules },
        });
      } catch {}

      // 1. Evacuate active Mods folder to shelter
      await invoke("evacuate_to_shelter");

      // 2. Symlink target mod (and any companion files in its folder) into isolated Mods directory
      const linkedFiles = await invoke<string[]>("deploy_mod_for_lab_test", {
        modPathOrName: physicalPath || modName,
        dnaHash: effectiveHash,
        isSandbox: !!isSandboxMod,
        modsPath: config.mods_path,
        vaultPath: config.vault_path || "",
      });

      // 3. Engage physical save airgap + automatic latest save seeding
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      // 4. Start 4-stage Rust verification watcher
      const initialStatus = await invoke<LabVerificationStatus>("start_lab_verification_session", {
        dnaHash: effectiveHash,
        modName,
        docsPath: dPath,
        vaultPath: config.vault_path || "",
        linkedFiles,
      });
      setLiveStatus(initialStatus);
      saveLabSessionMemory(initialStatus);

      if (onStatusChange) {
        onStatusChange({
          verified: false,
          failed: false,
          running: true,
        });
      }

      // 5. Launch game engine
      await invoke("launch_game", {
        livePath: config.live_path,
        modsPath: config.mods_path,
      });

      // 6. Poll every 1s
      attachPollingLoop(effectiveHash);
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
      await cleanupSandboxAfterInlineRun();
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopInlineTimedTest = async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setLiveStatus(null);
    saveLabSessionMemory(null);
    await cleanupSandboxAfterInlineRun();
    if (onStatusChange) {
      onStatusChange({
        verified: !!verifiedCert,
        failed: !!failedError,
        running: false,
        cert: verifiedCert,
        errorLog: failedError,
      });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const stageOrder = ["BOOTING", "MENU_WAITING", "ACTIVE_TESTING", "AWAITING_SAVE"];
  const currentStageIdx = activeSession ? stageOrder.indexOf(activeSession.stage) : -1;

  const getPauseReasonLabel = (reason?: string | null) => {
    if (!reason) return null;
    if (reason === "UNFOCUSED") {
      return t("lab_pause_unfocused", "PAUSED: Game Window Unfocused (Alt-Tabbed)");
    }
    if (reason === "GAME_PAUSED") {
      return t("lab_pause_game_paused", "PAUSED: In-Game Pause or Menu Screen Detected (Resume Live Gameplay)");
    }
    if (reason === "MAIN_MENU") {
      return t("lab_pause_main_menu", "PAUSED: Returned to Main Menu (Load a World to Resume)");
    }
    return t("lab_pause_idle", "PAUSED: No Active Gameplay Input Detected");
  };

  const getLockedNotice = () => {
    if (failedError || activeSession?.stage === "FAILED") {
      return t(
        "lab_gate_failed_reject_only_msg",
        "Fatal error detected or no clean test produced. Only Rejection is permitted for this submission."
      );
    }
    if (roleContext === "mason") {
      return t(
        "lab_gate_locked_mason_msg",
        "Publish Locked: This spoke requires a clean timed test inside the Homestead Lab before unlocking uploads."
      );
    }
    if (roleContext === "scout") {
      return t(
        "lab_gate_locked_scout_msg",
        "Submission Locked: This spoke requires a clean timed test before unlocking Scout Queue submissions."
      );
    }
    return t(
      "lab_gate_locked_architect_msg",
      "Approval Locked: No clean timed Lab test exists for this SHA-256 hash. Run a clean test below to unlock Approve, or Reject this submission."
    );
  };

  return (
    <div className="w-full shrink-0 rounded-2xl p-4 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-all flex flex-col gap-3">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] shrink-0">
            <span className="material-symbols-outlined !text-[18px]">
              {verifiedCert
                ? t("icon_verified", "verified")
                : failedError
                ? t("icon_gpp_bad", "gpp_bad")
                : t("icon_science", "science")}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-[var(--text)] tracking-wider uppercase leading-snug">
                {t("lab_gate_title", "Live Simulation Verification Gate")}
              </span>
              <LabVerificationBadge dnaHash={dnaHash} required={isGateRequired} compact />
            </div>
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-80 leading-snug">
              {!isRunning && (!verifiedCert || failedError)
                ? getLockedNotice()
                : t("lab_gate_subtitle", "4-Stage Hardware & Save-Cycle Telemetry Contract")}
            </span>
          </div>
        </div>

        {!isRunning && isDesktop() && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleStartInlineTimedTest}
              disabled={isStarting}
              className="h-9 px-3.5 rounded-xl text-[10px] font-bold tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[var(--text)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_play_circle", "play_circle")}
              </span>
              {t("lab_btn_start_timed_test", "Run Timed Lab Verification")}
            </button>

            {onOpenInFullLab && (
              <button
                type="button"
                onClick={onOpenInFullLab}
                className="h-9 px-3.5 rounded-xl text-[10px] font-bold tracking-wider uppercase glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[var(--text)] transition-all flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_science", "science")}
                </span>
                {t("lab_btn_open_full_lab", "Open in Homestead Lab")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Verified Receipt Display */}
      {verifiedCert && !isRunning && (
        <div className="rounded-xl p-3.5 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[var(--success)] text-xs font-black tracking-wider uppercase">
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_task_alt", "task_alt")}
              </span>
              {t("lab_stage_verified", "Simulation Verified & Signed")}
            </div>
            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-80">
              {t("lab_cert_verified_by", "Verified Hash Receipt")}: {verifiedCert.dna_hash.slice(0, 12)}...
            </span>
          </div>
          <p className="text-[11px] font-bold text-[var(--subtext)] leading-relaxed">
            {t("lab_stage_verified_desc", "Clean timed run + save checkpoint verified for this SHA-256 hash.")}
          </p>
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="px-3 py-2.5 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("lab_cert_active_time", "Active Sim Time")}
              </span>
              <span className="text-xs font-black text-[var(--success)]">
                {formatTime(verifiedCert.active_seconds)}
              </span>
            </div>
            <div className="px-3 py-2.5 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("lab_metric_ram_delta", "RAM Step-Up")}
              </span>
              <span className="text-xs font-black text-[var(--text)]">
                {verifiedCert.peak_ram_mb} MB
              </span>
            </div>
            <div className="px-3 py-2.5 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-0.5">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("lab_metric_save_cycle", "Save Checkpoint")}
              </span>
              <span className="text-xs font-black text-[var(--success)] break-all">
                {verifiedCert.save_file_verified}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active 4-Stage Telemetry HUD */}
      {isRunning && activeSession && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-2">
            <div className="px-3.5 py-2 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[10px] font-black tracking-wide flex items-center gap-2">
              <span className="material-symbols-outlined !text-[15px] shrink-0">
                {t("icon_save", "save")}
              </span>
              <span className="leading-snug">
                {activeSession.seeded_save_present
                  ? t("lab_test_save_active_badge", "ISOLATED TEST SAVE READY")
                  : t("lab_test_save_none_badge", "CLEAN SANDBOX (CREATE SAVE IN-GAME)")}
              </span>
            </div>

            {activeSession.linked_files && activeSession.linked_files.length > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] text-[10px] font-black tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined !text-[15px] shrink-0">
                  {t("icon_link", "link")}
                </span>
                <span className="leading-snug break-words">
                  {t("lab_linked_files_badge", "Symlinked to Live {Mods} Folder")}:{" "}
                  {activeSession.linked_files.join(", ")}
                </span>
              </div>
            )}
          </div>

          {/* 4-Stage Stepper in a 2x2 Grid so labels never get cut off */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: "BOOTING", label: t("lab_stage_booting", "1. Booting Engine") },
              { id: "MENU_WAITING", label: t("lab_stage_menu_waiting", "2. Waiting for Live Simulation...") },
              { id: "ACTIVE_TESTING", label: t("lab_stage_active_testing", "3. Active Simulation Testing") },
              { id: "AWAITING_SAVE", label: t("lab_stage_awaiting_save", "4. Awaiting Save Checkpoint") },
            ].map((st, idx) => {
              const isDone = currentStageIdx > idx;
              const isCurr = currentStageIdx === idx;
              return (
                <div
                  key={st.id}
                  className={`px-3.5 py-2.5 rounded-xl border text-[10px] font-black tracking-wide flex items-center gap-2 transition-all bg-transparent ${
                    isCurr
                      ? "border-[var(--accent)] text-[var(--accent)] shadow-sm"
                      : isDone
                      ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      : "border-[rgba(var(--text-rgb),0.14)] text-[var(--subtext)] opacity-75"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[15px] shrink-0">
                    {isDone
                      ? t("icon_done", "done")
                      : isCurr
                      ? t("icon_timer", "timer")
                      : t("icon_lock", "lock")}
                  </span>
                  <span className="leading-tight break-words">{st.label}</span>
                </div>
              );
            })}
          </div>

          {/* Current Stage Description & Countdown */}
          <div className="p-4 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.14)] flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                {activeSession.stage === "BOOTING" && t("lab_stage_booting", "1. Booting Engine")}
                {activeSession.stage === "MENU_WAITING" && t("lab_stage_menu_waiting", "2. Waiting for Live Simulation...")}
                {activeSession.stage === "ACTIVE_TESTING" && t("lab_stage_active_testing", "3. Active Simulation Testing")}
                {activeSession.stage === "AWAITING_SAVE" && t("lab_stage_awaiting_save", "4. Awaiting Save Checkpoint")}
              </span>
              <span className="text-[11px] font-bold text-[var(--subtext)] leading-relaxed">
                {activeSession.stage === "BOOTING" && t("lab_stage_booting_desc", "Process spawned; sampling initial RAM baseline...")}
                {activeSession.stage === "MENU_WAITING" && t("lab_stage_menu_waiting_desc", "Timer paused on Main Menu. Load into a playable world to trigger Disk I/O & RAM step-up.")}
                {activeSession.stage === "ACTIVE_TESTING" && t("lab_stage_active_testing_desc", "Countdown active while game window is focused and receiving input.")}
                {activeSession.stage === "AWAITING_SAVE" && t("lab_stage_awaiting_save_desc", "Timer complete! Trigger an in-game Save now to verify serialization integrity.")}
              </span>

              {activeSession.pause_reason && (
                <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[14px] shrink-0">
                    {t("icon_pause_circle", "pause_circle")}
                  </span>
                  <span className="leading-snug">{getPauseReasonLabel(activeSession.pause_reason)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end px-4 py-2.5 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.14)] shrink-0">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("lab_cert_active_time", "Active Sim Time")}
              </span>
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  activeSession.pause_reason
                    ? "text-[var(--warning)]"
                    : activeSession.stage === "AWAITING_SAVE"
                    ? "text-[var(--success)]"
                    : "text-[var(--accent)]"
                }`}
              >
                {formatTime(activeSession.remaining_active_seconds)}
              </span>
            </div>
          </div>

          {/* 4 Hardware & OS Telemetry Metrics in a 2x2 Grid with Frosted Glass */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-1">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_memory", "memory")}
                </span>
                {t("lab_metric_ram_delta", "RAM Step-Up")}
              </span>
              <span className="text-xs font-black text-[var(--text)]">
                {activeSession.current_ram_mb} MB (+{activeSession.ram_step_percent}%)
              </span>
            </div>

            <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-1">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_hard_drive", "hard_drive")}
                </span>
                {t("lab_metric_disk_read", "Disk Read Burst")}
              </span>
              <span className="text-xs font-black text-[var(--text)]">
                {activeSession.disk_read_mb} / {activeSession.min_disk_read_mb} MB
              </span>
            </div>

            <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-1">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_center_focus_strong", "center_focus_strong")}
                </span>
                {t("lab_metric_focus", "Window Focus")}
              </span>
              <span
                className={`text-xs font-black ${
                  activeSession.is_focused && !activeSession.pause_reason
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }`}
              >
                {activeSession.is_focused
                  ? t("lab_metric_focus_active", "Focused")
                  : t("lab_metric_focus_away", "Unfocused")}{" "}
                ({activeSession.current_idle_seconds}s)
              </span>
            </div>

            <div className="p-3 rounded-xl glass-surface border border-[rgba(var(--text-rgb),0.12)] flex flex-col gap-1">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                  {t("icon_save", "save")}
                </span>
                {t("lab_metric_save_cycle", "Save Checkpoint")}
              </span>
              <span
                className={`text-xs font-black break-words ${
                  activeSession.verified_save_name ? "text-[var(--success)]" : "text-[var(--text)]"
                }`}
              >
                {activeSession.verified_save_name
                  ? t("lab_metric_save_confirmed", "Save Verified")
                  : t("lab_metric_save_pending", "Awaiting .save")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Log when failed and not running */}
      {!hideErrorLog && !isRunning && (failedError || activeSession?.error_log) && (
        <div className="flex flex-col gap-3">
          <KnownErrorDiagnosisBanner logText={scrubLogUserData(failedError || activeSession?.error_log)} />
          <pre className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[10px] font-mono text-[var(--danger)] whitespace-pre-wrap max-h-28 overflow-y-auto custom-scrollbar">
            {formatHumanReadableLogText(failedError || activeSession?.error_log)}
          </pre>
        </div>
      )}

      {/* Abort Button when running inline */}
      {isRunning && !externalStatus && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleStopInlineTimedTest}
            className="px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-transparent text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] transition-all flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[15px]">
              {t("icon_stop_circle", "stop_circle")}
            </span>
            {t("lab_btn_stop_timed_test", "Abort Timed Test")}
          </button>
        </div>
      )}
    </div>
  );
}

export function LabInGameOverlay() {
  const { t } = useLexicon();
  const [status, setStatus] = useState<LabVerificationStatus | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const timer = setInterval(async () => {
      try {
        const st = await invoke<LabVerificationStatus | null>("poll_lab_verification_session");
        setStatus(st);
        if (st?.stage === "VERIFIED") {
          setTimeout(() => {
            invoke("stop_lab_verification_session").catch(() => {});
          }, 5000);
        }
      } catch (e) {}
    }, 900);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!status) return null;

  const isTimerUp = status.stage === "AWAITING_SAVE";
  const isVerified = status.stage === "VERIFIED";
  const isFailed = status.stage === "FAILED";
  const isPaused = !!status.pause_reason && status.stage === "ACTIVE_TESTING";

  return (
    <div className="w-screen h-screen p-2 select-none pointer-events-none flex items-start justify-start">
      <div
        className={`w-full rounded-2xl px-4 py-3 backdrop-blur-xl border shadow-2xl flex items-center justify-between gap-3 transition-all ${
          isVerified
            ? "bg-[#062419]/92 border-[#10b981] text-[#ecfdf5]"
            : isTimerUp
            ? "bg-[#082233]/95 border-[#38bdf8] text-white animate-pulse"
            : isFailed
            ? "bg-[#2c0b0e]/95 border-[#ef4444] text-white"
            : isPaused
            ? "bg-[#261a05]/90 border-[#f59e0b] text-[#fef3c7]"
            : "bg-[#0a0f18]/88 border-white/20 text-white"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isVerified
                ? "border-[#10b981]/50 bg-[#10b981]/20 text-[#10b981]"
                : isTimerUp
                ? "border-[#38bdf8]/60 bg-[#38bdf8]/25 text-[#38bdf8]"
                : isPaused
                ? "border-[#f59e0b]/50 bg-[#f59e0b]/20 text-[#f59e0b]"
                : "border-white/20 bg-white/10 text-[#38bdf8]"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isVerified
                ? t("icon_verified", "verified")
                : isTimerUp
                ? t("icon_save", "save")
                : isPaused
                ? t("icon_pause_circle", "pause_circle")
                : t("icon_timer", "timer")}
            </span>
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[10px] font-black tracking-widest uppercase opacity-75 truncate">
              {t("lab_overlay_title", "SANCTUARY LAB LIVE MONITOR")}
            </span>
            <span className="text-xs font-black leading-tight break-words">
              {isVerified && t("lab_overlay_verified_title", "VERIFICATION PASSED & SIGNED!")}
              {isTimerUp && t("lab_overlay_timer_up_title", "TIMED TEST COMPLETE (0:00) — SAVE GAME NOW!")}
              {!isVerified && !isTimerUp && status.stage === "BOOTING" && t("lab_stage_booting", "1. Booting Engine")}
              {!isVerified && !isTimerUp && status.stage === "MENU_WAITING" && t("lab_stage_menu_waiting", "2. Waiting for Live Simulation...")}
              {!isVerified && !isTimerUp && status.stage === "ACTIVE_TESTING" && (
                isPaused
                  ? (status.pause_reason === "GAME_PAUSED"
                      ? t("lab_pause_game_paused", "PAUSED: In-Game Pause or Menu Screen Detected")
                      : status.pause_reason === "MAIN_MENU"
                      ? t("lab_pause_main_menu", "PAUSED: Returned to Main Menu")
                      : status.pause_reason === "UNFOCUSED"
                      ? t("lab_pause_unfocused", "PAUSED: Game Window Unfocused")
                      : t("lab_pause_idle", "PAUSED: No Active Gameplay Input"))
                  : t("lab_stage_active_testing", "3. Active Simulation Testing")
              )}
              {isFailed && t("lab_stage_failed", "Simulation Failed")}
            </span>
            {(isTimerUp || isVerified) && (
              <span className="text-[10px] font-bold opacity-90 leading-snug mt-0.5">
                {isTimerUp
                  ? t("lab_overlay_timer_up_desc", "Open the in-game menu and click Save to verify save serialization and unlock publishing.")
                  : t("lab_overlay_verified_desc", "Save checkpoint verified. You may now safely exit the game.")}
              </span>
            )}
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 flex flex-col items-end shrink-0">
          <span className="text-[8px] font-black uppercase tracking-wider opacity-75">
            {t("lab_cert_active_time", "Active Sim Time")}
          </span>
          <span className="text-xl font-black font-mono leading-none">
            {formatTime(status.remaining_active_seconds)}
          </span>
        </div>
      </div>
    </div>
  );
}

