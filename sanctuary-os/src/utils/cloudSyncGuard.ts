import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "./envUtils";
import { fnv1aHashHex } from "../lib/cryptoUtils";

export interface CloudSyncInspectInput {
  master_vault_path?: string | null;
  vault_path?: string | null;
  mods_path?: string | null;
  docs_path?: string | null;
  live_path?: string | null;
}

export type CloudSyncRole =
  | "master_vault"
  | "workspace_vault"
  | "mods_target"
  | "install_route"
  | "user_data"
  | "game_root"
  | string;

export interface CloudSyncPathFinding {
  role: CloudSyncRole;
  configured_path: string;
  resolved_path: string;
  cloud_root_path?: string | null;
  provider: string;
  severity: "critical" | "warning" | "info" | string;
  symlink_risk: boolean;
  has_dehydrated_files: boolean;
  is_pinned_locally: boolean;
  is_unpinned: boolean;
  active_symlink_count: number;
  can_pin_hydration: boolean;
  is_windows_kfm_redirect: boolean;
  suggested_local_vault_path?: string | null;
  is_parent_folder_synced?: boolean;
  supports_folder_exclusion?: boolean;
  is_excluded_from_sync?: boolean;
  schema_saves_path?: string | null;
}

export interface CloudSyncSystemReport {
  has_interference: boolean;
  findings: CloudSyncPathFinding[];
  recommended_safe_vault_root: string;
  scanned_at_ms: number;
}

export interface CloudHydrationPinResult {
  pinned_count: number;
  skipped_symlinks: number;
}

export interface VaultRelocationResult {
  new_master_vault_path: string;
  new_active_vault_path: string;
  copied_files_count: number;
  copied_bytes: number;
}

export interface CloudSyncConsentRecord {
  key: string;
  role: string;
  provider: string;
  resolved_path: string;
  path_hash?: string;
  consented_at: number;
  workspace_id?: string | null;
}

const CONSENT_STORAGE_KEY = "sanctuary_cloud_sync_consents_v1";
const CONSENT_CHANGED_EVENT = "sanctuary-cloud-sync-consent-changed";
export const CLOUD_SYNC_REPORT_CHANGED_EVENT = "sanctuary-cloud-sync-report-changed";
const SESSION_CLEAN_MODS_PREFIX = "sanctuary_cloud_session_clean_mods_";
const REPORT_CACHE_TTL_MS = 15_000;

function resolveSessionCleanStorageKey(workspaceId?: string | null): string {
  const wsId =
    String(workspaceId || useStore.getState().activeWorkspaceId || "default").trim() || "default";
  return `${SESSION_CLEAN_MODS_PREFIX}${wsId}`;
}

export function getCloudSessionCleanMods(workspaceId?: string | null): boolean {
  try {
    return localStorage.getItem(resolveSessionCleanStorageKey(workspaceId)) === "true";
  } catch {
    return false;
  }
}

export function setCloudSessionCleanMods(enabled: boolean, workspaceId?: string | null): void {
  try {
    const key = resolveSessionCleanStorageKey(workspaceId);
    if (enabled) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  } catch {
    // Ignore storage errors
  }
}

let cachedDefaultReport: { report: CloudSyncSystemReport; timestamp: number } | null = null;
let inflightDefaultCheck: {
  promise: Promise<CloudSyncSystemReport | null>;
  forced: boolean;
} | null = null;
let lastAutoRevalidateAt = 0;

function triggerAutoCloudSyncRevalidation(minIntervalMs = 2000): void {
  if (!isDesktop()) return;
  const now = Date.now();
  if (now - lastAutoRevalidateAt < minIntervalMs) return;
  lastAutoRevalidateAt = now;
  void inspectWorkspaceCloudSync(undefined, true);
}

export function normalizeCloudPathKey(rawPath?: string | null): string {
  const s = String(rawPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return s.toLowerCase();
}

export function buildCloudConsentKey(finding: Pick<CloudSyncPathFinding, "role" | "provider" | "resolved_path" | "configured_path">): string {
  const role = String(finding.role || "").trim().toLowerCase();
  const provider = String(finding.provider || "").trim().toLowerCase();
  const normPath = normalizeCloudPathKey(finding.resolved_path || finding.configured_path);
  return `${role}::${provider}::${fnv1aHashHex(normPath)}`;
}

export function getCloudSyncConsents(): Record<string, CloudSyncConsentRecord> {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveCloudSyncConsents(map: Record<string, CloudSyncConsentRecord>) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  } catch {
    // Ignore storage errors
  }
}

export function isCloudSyncFindingConsented(
  finding: Pick<CloudSyncPathFinding, "role" | "provider" | "resolved_path" | "configured_path">,
  consentsMap?: Record<string, CloudSyncConsentRecord>
): boolean {
  const map = consentsMap || getCloudSyncConsents();
  const key = buildCloudConsentKey(finding);
  if (key in map) return true;
  // Also match resolved path even if a path was inspected under a secondary role on the same folder
  const normResolved = normalizeCloudPathKey(finding.resolved_path || finding.configured_path);
  const resolvedHash = fnv1aHashHex(normResolved);
  const provLower = String(finding.provider || "").trim().toLowerCase();
  const roleLower = String(finding.role || "").trim().toLowerCase();
  return Object.values(map).some(
    (entry) =>
      (entry.path_hash ? entry.path_hash === resolvedHash : normalizeCloudPathKey(entry.resolved_path) === normResolved) &&
      String(entry.provider || "").trim().toLowerCase() === provLower &&
      String(entry.role || "").trim().toLowerCase() === roleLower
  );
}

export function grantCloudSyncConsent(
  findings: CloudSyncPathFinding | CloudSyncPathFinding[],
  workspaceId?: string | null
) {
  const list = Array.isArray(findings) ? findings : [findings];
  if (list.length === 0) return;
  const map = getCloudSyncConsents();
  const now = Date.now();
  for (const finding of list) {
    const key = buildCloudConsentKey(finding);
    const rawResolved = finding.resolved_path || finding.configured_path;
    const normResolved = normalizeCloudPathKey(rawResolved);
    map[key] = {
      key,
      role: finding.role,
      provider: finding.provider,
      resolved_path: obfuscateCloudPath(rawResolved),
      path_hash: fnv1aHashHex(normResolved),
      consented_at: now,
      workspace_id: workspaceId || useStore.getState().activeWorkspaceId || null,
    };
  }
  saveCloudSyncConsents(map);
}

export function revokeCloudSyncConsent(
  finding: Pick<CloudSyncPathFinding, "role" | "provider" | "resolved_path" | "configured_path">
) {
  const map = getCloudSyncConsents();
  const key = buildCloudConsentKey(finding);
  const role = String(finding.role || "").trim().toLowerCase();
  const provider = String(finding.provider || "").trim().toLowerCase();
  const normResolved = normalizeCloudPathKey(finding.resolved_path || finding.configured_path);
  const legacyKey = `${role}::${provider}::${normResolved}`;
  let changed = false;
  if (key in map) {
    delete map[key];
    changed = true;
  }
  if (legacyKey in map) {
    delete map[legacyKey];
    changed = true;
  }
  if (changed) {
    saveCloudSyncConsents(map);
  }
}

export function invalidateCloudSyncCache() {
  cachedDefaultReport = null;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
}

export function obfuscateCloudPath(rawPath?: string | null, unsetLabel = ""): string {
  const p = String(rawPath || "").trim();
  if (!p || p.toLowerCase() === "web") return unsetLabel;
  if (/^[A-Za-z]:[\\/]/.test(p)) {
    const winNormalized = p.replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
    return winNormalized.replace(/^([A-Za-z]:\\[Uu]sers\\)[^\\]+/, "$1***");
  }
  return p.replace(/^(\/(?:home|Users)\/)[^/]+/, "$1***");
}

export async function inspectWorkspaceCloudSync(
  override?: CloudSyncInspectInput,
  force = false
): Promise<CloudSyncSystemReport | null> {
  if (!isDesktop()) return null;

  const hasOverride = Boolean(
    override &&
      Object.values(override).some((v) => typeof v === "string" && v.trim().length > 0)
  );

  if (force && !hasOverride) {
    cachedDefaultReport = null;
  }

  if (!hasOverride && !force && cachedDefaultReport) {
    if (Date.now() - cachedDefaultReport.timestamp < REPORT_CACHE_TTL_MS) {
      return cachedDefaultReport.report;
    }
  }

  if (!hasOverride && inflightDefaultCheck && (!force || inflightDefaultCheck.forced)) {
    return inflightDefaultCheck.promise;
  }

  const runCheck = async (): Promise<CloudSyncSystemReport | null> => {
    try {
      const report = await invoke<CloudSyncSystemReport>("inspect_cloud_sync_status", {
        pathsOverride: hasOverride ? override : null,
        forceRefresh: force,
      });
      if (!hasOverride && report) {
        cachedDefaultReport = { report, timestamp: Date.now() };
        lastAutoRevalidateAt = Date.now();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(CLOUD_SYNC_REPORT_CHANGED_EVENT, { detail: report })
          );
        }
      }
      return report || null;
    } catch {
      return null;
    }
  };

  if (!hasOverride) {
    let trackedPromise: Promise<CloudSyncSystemReport | null> | null = null;
    trackedPromise = runCheck().finally(() => {
      if (inflightDefaultCheck?.promise === trackedPromise) {
        inflightDefaultCheck = null;
      }
    });
    inflightDefaultCheck = { promise: trackedPromise, forced: force };
    return trackedPromise;
  }

  return runCheck();
}

export interface UseCloudSyncGuardResult {
  report: CloudSyncSystemReport | null;
  findings: CloudSyncPathFinding[];
  excludedFindings: CloudSyncPathFinding[];
  unconsentedFindings: CloudSyncPathFinding[];
  consentedFindings: CloudSyncPathFinding[];
  hasInterference: boolean;
  hasUnconsentedInterference: boolean;
  isLoading: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

export function useCloudSyncGuard(workspaceId?: string | null): UseCloudSyncGuardResult {
  const storeVault = useStore((s) => s.vaultPath);
  const storeMods = useStore((s) => s.modsPath);
  const storeDocs = useStore((s) => s.docsPath);
  const storeLive = useStore((s) => s.livePath);
  const storeWsId = useStore((s) => s.activeWorkspaceId);
  const schemaId = useStore((s) => s.activeGameSchema?.id);

  const [report, setReport] = useState<CloudSyncSystemReport | null>(() =>
    cachedDefaultReport ? cachedDefaultReport.report : null
  );
  const [consents, setConsents] = useState<Record<string, CloudSyncConsentRecord>>(() =>
    getCloudSyncConsents()
  );
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (!isDesktop()) {
      setReport(null);
      setIsLoading(false);
      return;
    }
    if (force) cachedDefaultReport = null;
    setIsLoading(true);
    try {
      const next = await inspectWorkspaceCloudSync(undefined, force);
      setReport(next);
      setConsents(getCloudSyncConsents());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    void refresh(true);
  }, [workspaceId, storeWsId, storeVault, storeMods, storeDocs, storeLive, schemaId, refresh]);

  useEffect(() => {
    if (!isDesktop()) return;
    const handleReportChanged = (event: Event) => {
      const detail = (event as CustomEvent<CloudSyncSystemReport | null | undefined>).detail;
      setReport(detail ?? (cachedDefaultReport ? cachedDefaultReport.report : null));
      setConsents(getCloudSyncConsents());
    };
    const handleConsentOrStorageChange = () => {
      setConsents(getCloudSyncConsents());
      if (cachedDefaultReport) {
        setReport(cachedDefaultReport.report);
      } else {
        void refresh(true);
      }
    };
    const handleFocusRevalidate = () => {
      triggerAutoCloudSyncRevalidation(2000);
    };
    const handleVisibilityRevalidate = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        triggerAutoCloudSyncRevalidation(2000);
      }
    };
    const handleSessionModsCleaned = () => {
      triggerAutoCloudSyncRevalidation(500);
    };

    window.addEventListener(CLOUD_SYNC_REPORT_CHANGED_EVENT, handleReportChanged);
    window.addEventListener(CONSENT_CHANGED_EVENT, handleConsentOrStorageChange);
    window.addEventListener("storage", handleConsentOrStorageChange);
    window.addEventListener("focus", handleFocusRevalidate);
    window.addEventListener("sanctuary-cloud-session-mods-cleaned", handleSessionModsCleaned);
    document.addEventListener("visibilitychange", handleVisibilityRevalidate);
    return () => {
      window.removeEventListener(CLOUD_SYNC_REPORT_CHANGED_EVENT, handleReportChanged);
      window.removeEventListener(CONSENT_CHANGED_EVENT, handleConsentOrStorageChange);
      window.removeEventListener("storage", handleConsentOrStorageChange);
      window.removeEventListener("focus", handleFocusRevalidate);
      window.removeEventListener("sanctuary-cloud-session-mods-cleaned", handleSessionModsCleaned);
      document.removeEventListener("visibilitychange", handleVisibilityRevalidate);
    };
  }, [refresh]);

  const allFindings = report?.findings || [];
  const excludedFindings = allFindings.filter((f) => Boolean(f.is_excluded_from_sync));
  const findings = allFindings.filter((f) => !f.is_excluded_from_sync);
  const unconsentedFindings = findings.filter((f) => !isCloudSyncFindingConsented(f, consents));
  const consentedFindings = findings.filter((f) => isCloudSyncFindingConsented(f, consents));
  const hasActiveFindings = findings.length > 0;

  useEffect(() => {
    if (!isDesktop() || !hasActiveFindings) return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      triggerAutoCloudSyncRevalidation(3500);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveFindings]);

  return {
    report,
    findings,
    excludedFindings,
    unconsentedFindings,
    consentedFindings,
    hasInterference: findings.length > 0,
    hasUnconsentedInterference: unconsentedFindings.length > 0,
    isLoading,
    refresh,
  };
}

/**
 * Checks whether symlink deployment / projection targets intersect an unconsented cloud-sync folder.
 * Returns `true` when safe to proceed (or already explicitly consented by the user).
 * Returns `false` and opens CloudSyncGuardSidePanel when explicit user consent is required first.
 */
export async function checkAndPromptSymlinkCloudSyncConsent(opts: {
  modsPath?: string | null;
  vaultPath?: string | null;
  docsPath?: string | null;
  livePath?: string | null;
  actionLabel?: string;
  onAuthorizedProceed: () => void;
}): Promise<boolean> {
  if (!isDesktop()) return true;

  const report = await inspectWorkspaceCloudSync(
    {
      vault_path: opts.vaultPath || undefined,
      mods_path: opts.modsPath || undefined,
      docs_path: opts.docsPath || undefined,
      live_path: opts.livePath || undefined,
    },
    true
  );

  if (!report || !report.has_interference || report.findings.length === 0) {
    return true;
  }

  const consents = getCloudSyncConsents();
  const unconsentedSymlinkRisk = report.findings.filter(
    (f) =>
      !f.is_excluded_from_sync &&
      f.symlink_risk &&
      !isCloudSyncFindingConsented(f, consents)
  );

  if (unconsentedSymlinkRisk.length === 0) {
    return true;
  }

  useModalStore.getState().openCloudSyncGuard({
    pendingActionLabel: opts.actionLabel,
    onConsentProceed: opts.onAuthorizedProceed,
  });

  return false;
}

