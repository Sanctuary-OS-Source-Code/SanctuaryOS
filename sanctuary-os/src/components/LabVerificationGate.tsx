import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase } from "../supabase";
import { isDesktop } from "../utils/envUtils";
import { ActionButton } from "../shared";
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
  vault_mirror_saves?: LabSaveFileInfo[];
  airgap_active: boolean;
  fresh_sandbox_armed?: boolean;
  game_running?: boolean;
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

function resolveSpokeLabKey(): string {
  const st = useStore.getState();
  const raw =
    st.activeWorkspaceId ||
    st.activeGameSchema?.id ||
    st.activeGameSchema?.game_id ||
    "default_workspace";
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean || clean === "default_schema") {
    return "default_workspace";
  }
  return clean;
}

export function saveLabSessionMemory(status: LabVerificationStatus | null) {
  try {
    const spokeKey = resolveSpokeLabKey();
    const scopedKey = `${LOCAL_SESSION_MEMORY_KEY}_${spokeKey}`;
    if (!status) {
      localStorage.removeItem(scopedKey);
    } else {
      localStorage.setItem(scopedKey, JSON.stringify(status));
    }
  } catch (e) {}
}

export function loadLabSessionMemory(): LabVerificationStatus | null {
  try {
    const spokeKey = resolveSpokeLabKey();
    const scopedKey = `${LOCAL_SESSION_MEMORY_KEY}_${spokeKey}`;
    const raw = localStorage.getItem(scopedKey);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

export function getCachedCertificatesMap(): Record<string, LabVerificationCertificate> {
  try {
    const spokeKey = resolveSpokeLabKey();
    const scopedKey = `${LOCAL_CERT_STORAGE_KEY}_${spokeKey}`;
    const raw = localStorage.getItem(scopedKey);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

export function getCachedFailedMap(): Record<string, string> {
  try {
    const spokeKey = resolveSpokeLabKey();
    const scopedKey = `${LOCAL_FAIL_STORAGE_KEY}_${spokeKey}`;
    const raw = localStorage.getItem(scopedKey);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

let lastMilestoneChimeKey = "";
let lastMilestoneChimeAt = 0;

export function playLabMilestoneChime(
  kind: "timer_complete" | "verified" | "failed" | string,
  dnaHash = ""
) {
  try {
    const now = Date.now();
    const dedupKey = `${kind}:${dnaHash}`;
    if (dedupKey === lastMilestoneChimeKey && now - lastMilestoneChimeAt < 2500) {
      return;
    }
    lastMilestoneChimeKey = dedupKey;
    lastMilestoneChimeAt = now;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const playNote = (freq: number, startOffset: number, duration: number, gainPeak = 0.16) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "failed" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + startOffset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration + 0.02);
    };

    if (kind === "timer_complete") {
      // Double ascending chime so fullscreen players unmistakably know the timer is up & they can Save & End
      playNote(587.33, 0.0, 0.14, 0.18);
      playNote(880.0, 0.13, 0.14, 0.18);
      playNote(1174.66, 0.26, 0.24, 0.2);
      playNote(880.0, 0.62, 0.14, 0.16);
      playNote(1174.66, 0.76, 0.3, 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 1400);
    } else if (kind === "verified") {
      playNote(523.25, 0.0, 0.12, 0.16);
      playNote(659.25, 0.11, 0.12, 0.16);
      playNote(783.99, 0.22, 0.14, 0.18);
      playNote(1046.5, 0.35, 0.32, 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 1100);
    } else {
      playNote(440.0, 0.0, 0.18, 0.14);
      playNote(311.13, 0.18, 0.28, 0.14);
      setTimeout(() => ctx.close().catch(() => {}), 800);
    }
  } catch (e) {}
}

export function useLabMilestoneNotifications() {
  const { t } = useLexicon();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isDesktop()) return;
    let unlistenFn: (() => void) | null = null;
    listen<{
      kind: string;
      title: string;
      body: string;
      dna_hash: string;
      mod_name: string;
      is_error: boolean;
    }>("sanctuary-lab-milestone", (event) => {
      const p = event.payload;
      if (!p) return;
      if (!isDesktop()) {
        playLabMilestoneChime(p.kind, p.dna_hash);
      }
      const tr = tRef.current;
      const title =
        p.kind === "stage3_started"
          ? tr("lab_overlay_stage3_started_title", "WORLD LOADED — ACTIVE TEST TIMER STARTED")
          : p.title;
      const body =
        p.kind === "stage3_started"
          ? tr(
              "lab_overlay_stage3_started_desc",
              "Play actively in-game until you hear the completion chime, then save your game."
            )
          : p.body;
      useStore
        .getState()
        .pushStatus(
          `${title} — ${body}`,
          p.is_error ? "error" : p.kind === "verified" ? "success" : "info"
        );
    })
      .then((fn) => {
        unlistenFn = fn;
      })
      .catch(() => {});

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);
}

export function isLocalModKnownTier0(mod: any): boolean {
  if (!mod) return false;
  if (Number(mod.compliance_tier || 0) !== 0) return false;
  if (mod.is_unknown) return false;
  const statusLower = String(mod.status || "").trim().toLowerCase();
  if (statusLower === "unverified" || statusLower === "rejected") return false;
  const hash = String(mod.dna_hash || mod.hash || "").trim();
  if (!hash || hash === "calculating") return false;
  const cloudModId = String(mod.mod_id || mod.cloud_id || mod.id || "").trim();
  const hasKnownCloudRecord =
    mod.is_verified === true ||
    (Boolean(cloudModId) &&
      !cloudModId.startsWith("local_") &&
      !cloudModId.includes("/") &&
      !cloudModId.includes("\\"));
  return hasKnownCloudRecord;
}

export async function verifyKnownTier0CloudHashes(dnaHashes: string[]): Promise<{
  allowed: boolean;
  verifiedMap: Record<string, { versionId: string; modId: string }>;
  blockedHashes: string[];
}> {
  const uniqueHashes = Array.from(
    new Set(
      (dnaHashes || [])
        .map((h) => String(h || "").trim())
        .filter((h) => h.length > 0 && h !== "calculating")
    )
  );
  if (uniqueHashes.length === 0) {
    return { allowed: false, verifiedMap: {}, blockedHashes: [] };
  }

  const verifiedMap: Record<string, { versionId: string; modId: string }> = {};
  const { data: rows, error } = await supabase
    .from("mod_versions")
    .select("id, mod_id, dna_hash, mods(id, compliance_tier, status)")
    .in("dna_hash", uniqueHashes);

  if (error || !rows) {
    return { allowed: false, verifiedMap: {}, blockedHashes: uniqueHashes };
  }

  for (const row of rows as any[]) {
    const hash = String(row?.dna_hash || "").trim();
    const parentMod = Array.isArray(row?.mods) ? row.mods[0] : row?.mods;
    if (!hash || !row?.id || !row?.mod_id || !parentMod) continue;
    const tier = Number(parentMod.compliance_tier || 0);
    const statusLower = String(parentMod.status || "").trim().toLowerCase();
    // Known Tier 0 means cataloged Tier 0 and NOT an unreviewed/rejected upload
    if (tier === 0 && statusLower !== "unverified" && statusLower !== "rejected") {
      verifiedMap[hash] = { versionId: String(row.id), modId: String(row.mod_id) };
    }
  }

  const blockedHashes = uniqueHashes.filter((h) => !verifiedMap[h]);
  return {
    allowed: blockedHashes.length === 0,
    verifiedMap,
    blockedHashes,
  };
}

export async function recordVerifiedCertificate(cert: LabVerificationCertificate) {
  try {
    const spokeKey = resolveSpokeLabKey();
    const map = getCachedCertificatesMap();
    map[cert.dna_hash] = cert;
    localStorage.setItem(`${LOCAL_CERT_STORAGE_KEY}_${spokeKey}`, JSON.stringify(map));

    const failMap = getCachedFailedMap();
    if (failMap[cert.dna_hash]) {
      delete failMap[cert.dna_hash];
      localStorage.setItem(`${LOCAL_FAIL_STORAGE_KEY}_${spokeKey}`, JSON.stringify(failMap));
    }

    if (isDesktop()) {
      try {
        const config: any = await invoke("get_saved_coordinates");
        if (config?.vault_path) {
          await invoke("record_lab_certificate", {
            vaultPath: config.vault_path,
            certificate: cert,
          });
        }
      } catch {
        // Certificate was already persisted to Vault SQLite by Rust when Stage 4 completed
      }
    }

    // Record PASS_VERIFIED_4STAGE receipt in Supabase homestead_lab_logs ONLY for:
    // 1. Tier 0 mod_versions (including newly submitted Mason Queue items awaiting Architect review), OR
    // 2. Tier 0 pending scout_suggestions uploads (so Architects can verify the passing test).
    // Never write Tier 1-5 or unsubmitted local unknown hashes to cloud logs!
    const { data: verData } = await supabase
      .from("mod_versions")
      .select("id, mod_id, mods(compliance_tier, status)")
      .eq("dna_hash", cert.dna_hash)
      .maybeSingle();

    const verMod = Array.isArray((verData as any)?.mods)
      ? (verData as any).mods[0]
      : (verData as any)?.mods;
    const receiptNote = JSON.stringify({
      type: "PASS_VERIFIED_4STAGE",
      dna_hash: cert.dna_hash,
      active_seconds: cert.active_seconds,
      peak_ram_mb: cert.peak_ram_mb,
      disk_read_mb: cert.disk_read_mb,
      save_file_verified: cert.save_file_verified,
      verified_at: cert.verified_at,
    });

    if (
      verData &&
      verMod &&
      Number(verMod.compliance_tier || 0) === 0 &&
      String(verMod.status || "").toLowerCase() !== "rejected"
    ) {
      const { data: existingReceipt } = await supabase
        .from("homestead_lab_logs")
        .select("id")
        .eq("version_id", verData.id)
        .ilike("tester_note", "%PASS_VERIFIED_4STAGE%")
        .limit(1);

      if (!existingReceipt || existingReceipt.length === 0) {
        await supabase.from("homestead_lab_logs").insert([
          {
            mod_id: verData.mod_id,
            version_id: verData.id,
            log_snippet: "Clean",
            tester_note: receiptNote,
            _lab_cert_proof: cert,
          } as any,
        ]);
      }
    } else if (!verData) {
      const { data: scoutRow } = await supabase
        .from("scout_suggestions")
        .select("id, status, suggested_metadata")
        .eq("dna_hash", cert.dna_hash)
        .neq("status", "rejected")
        .limit(1)
        .maybeSingle();

      const scoutTier = Number((scoutRow as any)?.suggested_metadata?.compliance_tier || 0);
      if (scoutRow && scoutTier === 0) {
        const { data: existingScoutReceipt } = await supabase
          .from("homestead_lab_logs")
          .select("id")
          .ilike("tester_note", `%${cert.dna_hash}%`)
          .limit(1);

        if (!existingScoutReceipt || existingScoutReceipt.length === 0) {
          await supabase.from("homestead_lab_logs").insert([
            {
              mod_id: null,
              version_id: null,
              log_snippet: "Clean",
              tester_note: receiptNote,
              _lab_cert_proof: cert,
            } as any,
          ]);
        }
      }
    }

    window.dispatchEvent(new CustomEvent("sanctuary-lab-cert-updated", { detail: { dna_hash: cert.dna_hash } }));
  } catch (e) {
    console.error("Failed to record lab certificate:", e);
  }
}

export function recordFailedVerification(dnaHash: string, errorLog: string) {
  try {
    const spokeKey = resolveSpokeLabKey();
    const failMap = getCachedFailedMap();
    failMap[dnaHash] = scrubLogUserData(errorLog);
    localStorage.setItem(`${LOCAL_FAIL_STORAGE_KEY}_${spokeKey}`, JSON.stringify(failMap));
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
          localStorage.setItem(`${LOCAL_CERT_STORAGE_KEY}_${resolveSpokeLabKey()}`, JSON.stringify(localMap));
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

    let logs: any[] | null = null;
    if (verData?.id) {
      const { data } = await supabase
        .from("homestead_lab_logs")
        .select("log_snippet, tester_note, created_at")
        .eq("version_id", verData.id)
        .order("created_at", { ascending: false })
        .limit(5);
      logs = data;
    } else {
      const { data } = await supabase
        .from("homestead_lab_logs")
        .select("log_snippet, tester_note, created_at")
        .ilike("tester_note", `%${dnaHash}%`)
        .order("created_at", { ascending: false })
        .limit(5);
      logs = data;
    }

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
          localStorage.setItem(`${LOCAL_CERT_STORAGE_KEY}_${resolveSpokeLabKey()}`, JSON.stringify(localMap));
          return { verified: true, failed: false, cert };
        }
      }
      // If latest log had an exception and no clean log exists
      const latest = logs[0];
      if (latest.log_snippet && latest.log_snippet !== "Clean") {
        return { verified: false, failed: true, errorLog: scrubLogUserData(latest.log_snippet) };
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
    ? "px-2 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[8px] font-black tracking-wider uppercase text-[var(--text)] flex items-center gap-1.5 shrink-0"
    : "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black tracking-wider uppercase text-[var(--text)] flex items-center gap-1.5 shrink-0";

  if (state.verified) {
    return (
      <span className={baseSizeClass}>
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
      <span className={baseSizeClass}>
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
    <span className={baseSizeClass}>
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
  const [isStopping, setIsStopping] = useState(false);
  const [showAllLinkedFiles, setShowAllLinkedFiles] = useState(false);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const focused = Boolean(isRunning && activeSession?.is_focused);
    document.documentElement.dataset.saGameFocused = focused ? "true" : "false";
    return () => {
      document.documentElement.dataset.saGameFocused = "false";
    };
  }, [isRunning, activeSession?.is_focused]);

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

  const cleanupSandboxAfterInlineRun = useCallback(
    async (closeGame = true): Promise<boolean> => {
      if (!isDesktop()) return true;
      try {
        const config: any = await invoke("get_saved_coordinates");
        const dPath = String(
          config?.docs_path || config?.user_data_path || config?.mods_path || ""
        ).trim();
        await invoke("teardown_lab_sandbox_session", {
          docsPath: dPath,
          closeGame,
        });
        await invoke("repopulate_from_shelter");
        return true;
      } catch (e: any) {
        const rawErr = typeof e === "string" ? e : e?.message || String(e);
        if (rawErr.includes("lab_err_game_running_saves_locked")) {
          useStore
            .getState()
            .pushStatus(
              t(
                "lab_err_game_running_saves_locked",
                "Close the running game first so your live saves can be unlocked and restored safely."
              ),
              "error"
            );
        } else {
          useStore.getState().pushStatus(rawErr, "error");
        }
        return false;
      }
    },
    [t]
  );

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
              const errText = st.error_log?.includes("lab_err_payload_tampered")
                ? t(
                    "lab_err_payload_tampered",
                    "Sandbox {mod} files were modified or removed mid-test — verification invalidated."
                  )
                : st.error_log ||
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
      const dPath = String(
        config?.docs_path || config?.user_data_path || config?.mods_path || ""
      ).trim();

      // Sync latest exception_rules to Rust so Unrelated (Normal Game Bug) rules are ignored during live polling
      try {
        const currentSchema = useStore.getState().activeGameSchema || {};
        const currentRules = getExceptionRules(currentSchema);
        await invoke("update_active_game_schema", {
          schema: { ...currentSchema, exception_rules: currentRules },
        });
      } catch {}

      // 1. Evacuate active loadout folder to shelter
      await invoke("evacuate_to_shelter");

      // 2. Symlink target mod (and any companion files in its folder) into isolated live directory
      const linkedFiles = await invoke<string[]>("deploy_mod_for_lab_test", {
        modPathOrName: physicalPath || modName,
        dnaHash: effectiveHash,
        isSandbox: !!isSandboxMod,
        modsPath: config.mods_path,
        vaultPath: config.vault_path || "",
      });

      // 3. Engage physical Dual-Vault save airgap + isolated sandbox seeding
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      // 4. Start 4-stage Rust verification watcher
      const initialStatus = await invoke<LabVerificationStatus>("start_lab_verification_session", {
        dnaHash: effectiveHash,
        modName,
        docsPath: dPath,
        vaultPath: config.vault_path || "",
        linkedFiles,
        notificationLabels: {
          failed_title: t("lab_stage_failed", "Simulation Failed"),
          timer_complete_title: t(
            "lab_overlay_timer_up_title",
            "TIMED TEST COMPLETE (0:00) — SAVE GAME NOW!"
          ),
          timer_complete_body: t(
            "lab_overlay_timer_up_desc",
            "Open the in-game menu and click Save to verify save serialization and unlock publishing."
          ),
          verified_title: t("lab_overlay_verified_title", "VERIFICATION PASSED & SIGNED!"),
          verified_body: t(
            "lab_overlay_verified_desc",
            "Save checkpoint verified. You may now safely exit the game."
          ),
        },
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
    if (isStopping) return;
    setIsStopping(true);
    try {
      const cleaned = await cleanupSandboxAfterInlineRun(true);
      if (!cleaned) return;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setLiveStatus(null);
      saveLabSessionMemory(null);
      if (onStatusChange) {
        onStatusChange({
          verified: !!verifiedCert,
          failed: !!failedError,
          running: false,
          cert: verifiedCert,
          errorLog: failedError,
        });
      }
    } finally {
      setIsStopping(false);
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
    if (reason === "LOADING_WORLD") {
      return t("lab_pause_loading_world", "PAUSED: Loading World or Zone Assets...");
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
    <div className="w-full shrink-0 rounded-2xl p-4 glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all flex flex-col gap-3.5">
      {/* Top Header Row — Title on Left, Status Badge Pinned Right */}
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--accent)] shrink-0">
            <span className="material-symbols-outlined !text-[18px]">
              {verifiedCert
                ? t("icon_verified", "verified")
                : failedError
                ? t("icon_gpp_bad", "gpp_bad")
                : t("icon_science", "science")}
            </span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-black text-[var(--text)] tracking-wider uppercase leading-snug">
              {t("lab_gate_title", "Live Simulation Verification Gate")}
            </span>
            <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-80 leading-snug">
              {!isRunning && (!verifiedCert || failedError)
                ? getLockedNotice()
                : t("lab_gate_subtitle", "4-Stage Hardware & Save-Cycle Telemetry Contract")}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end ml-auto shrink-0 pt-0.5">
          <LabVerificationBadge dnaHash={dnaHash} required={isGateRequired} compact />
        </div>
      </div>

      {!isRunning && isDesktop() && (
        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto w-full pt-0.5">
          <ActionButton
            variant="accent"
            icon={t("icon_play_circle", "play_circle")}
            label={t("lab_btn_start_timed_test", "Run Timed Lab Verification")}
            disabled={isStarting}
            onClick={handleStartInlineTimedTest}
          />

          {onOpenInFullLab && (
            <ActionButton
              variant="glass"
              icon={t("icon_science", "science")}
              label={t("lab_btn_open_full_lab", "Open in {Lab}")}
              onClick={onOpenInFullLab}
            />
          )}
        </div>
      )}

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
            <div className="px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] font-black tracking-wide flex items-center gap-2">
              <span className="material-symbols-outlined !text-[15px] shrink-0 text-[var(--accent)]">
                {t("icon_save", "save")}
              </span>
              <span className="leading-snug">
                {activeSession.seeded_save_present
                  ? t("lab_test_save_active_badge", "ISOLATED TEST SAVE READY")
                  : t("lab_test_save_none_badge", "CLEAN SANDBOX (CREATE SAVE IN-GAME)")}
              </span>
            </div>

            {activeSession.linked_files && activeSession.linked_files.length > 0 && (() => {
              const cleanBasenames = activeSession.linked_files.map(
                (f) => String(f || "").split(/[\\/]/).pop() || String(f || "")
              );
              const firstFile = cleanBasenames[0] || "";
              const extraCount = cleanBasenames.length - 1;
              return (
                <div className="px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] font-black tracking-wide flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined !text-[15px] shrink-0 text-[var(--success)]">
                        {t("icon_link", "link")}
                      </span>
                      <span className="leading-snug truncate">
                        {t("lab_linked_files_badge", "Symlinked to Live {Mods} Folder")}:{" "}
                        <span className="font-mono">{firstFile}</span>
                      </span>
                    </div>
                    {extraCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllLinkedFiles((prev) => !prev)}
                        className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[9px] font-mono font-bold text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer shrink-0 bg-transparent"
                      >
                        {showAllLinkedFiles ? t("close", "Close") : `+${extraCount}`}
                      </button>
                    )}
                  </div>
                  {showAllLinkedFiles && extraCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                      {cleanBasenames.map((fname, idx) => (
                        <span
                          key={`${fname}_${idx}`}
                          className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-mono font-semibold text-[var(--subtext)] bg-transparent truncate max-w-full"
                        >
                          {fname}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 4-Stage Stepper in a 2x2 Grid — Subtle Frosted Liquid Glass */}
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
                  className={`px-3.5 py-2.5 rounded-xl glass-surface border text-[10px] font-black tracking-wide flex items-center gap-2 transition-all ${
                    isCurr
                      ? "border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] text-[var(--text)]"
                      : isDone
                      ? "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-90"
                      : "border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)] opacity-60"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[15px] shrink-0 ${
                      isDone
                        ? "text-[var(--success)]"
                        : isCurr
                        ? "text-[var(--accent)]"
                        : "text-[var(--subtext)]"
                    }`}
                  >
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

          {/* Unmistakable Stage 4 Timer-Up Callout Banner — Liquid Glass */}
          {activeSession.stage === "AWAITING_SAVE" && (
            <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] flex items-start gap-3">
              <span className="material-symbols-outlined !text-[20px] shrink-0 mt-0.5 text-[var(--success)]">
                {t("icon_notifications_active", "notifications_active")}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-black uppercase tracking-wider leading-snug text-[var(--text)]">
                  {t(
                    "lab_banner_timer_up_save_now",
                    "Timer Complete — Save Your Game Now to Finish"
                  )}
                </span>
                <span className="text-[11px] font-bold text-[var(--subtext)] leading-relaxed">
                  {t(
                    "lab_banner_timer_up_save_now_desc",
                    "Active gameplay timer is up! Save inside your game now so {Lab} can verify save integrity, then close the game and end the test."
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Current Stage Description & Countdown */}
          <div className="p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-4 flex-wrap">
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
                <div className="mt-1.5 px-3 py-1.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[14px] shrink-0 text-[var(--warning)]">
                    {t("icon_pause_circle", "pause_circle")}
                  </span>
                  <span className="leading-snug">{getPauseReasonLabel(activeSession.pause_reason)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end px-4 py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
              <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-wider">
                {t("lab_cert_active_time", "Active Sim Time")}
              </span>
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  activeSession.pause_reason
                    ? "text-[var(--warning)]"
                    : activeSession.stage === "AWAITING_SAVE"
                    ? "text-[var(--success)]"
                    : "text-[var(--text)]"
                }`}
              >
                {formatTime(activeSession.remaining_active_seconds)}
              </span>
            </div>
          </div>

          {/* 4 Hardware & OS Telemetry Metrics in a 2x2 Grid with Frosted Glass */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
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

            <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
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

            <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
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

            <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
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
                  : t("lab_metric_save_pending", "Awaiting Save")}
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
        <div className="flex items-center justify-end pt-1 ml-auto w-full">
          <ActionButton
            variant="danger"
            icon={
              isStopping
                ? t("icon_sync", "sync")
                : t("icon_stop_circle", "stop_circle")
            }
            label={
              isStopping
                ? t("lab_btn_ending_test", "Closing Game & Restoring...")
                : t("lab_btn_stop_timed_test", "Abort Timed Test")
            }
            disabled={isStopping}
            onClick={handleStopInlineTimedTest}
          />
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
                  ? (status.pause_reason === "LOADING_WORLD"
                      ? t("lab_pause_loading_world", "PAUSED: Loading World or Zone Assets...")
                      : status.pause_reason === "GAME_PAUSED"
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

