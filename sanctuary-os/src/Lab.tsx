import React, { useState, useEffect, useRef } from "react";
import { useLexicon } from "./LexiconContext";
import {
  ViewHeader,
  ModSearchDropdown,
  SidePanel,
  getExtensionRegex,
  isModBinaryExtension,
  isScriptExtension,
  getModIcon,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  ActionButton,
  StatBox,
  HoverTooltip,
  EmptyState,
} from "./shared";
import {
  DashboardStatTile,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  StatTileCarousel
} from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./components/universal/UniversalCard";
import { SidePanelHeroCard, UniversalGroup } from "./components/layouts/ElevatedHubLayout";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "./ContextMenu";
import { VAULT_CHIP_CLASS } from "./shared-components/constants";
import { useStore } from "./store";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import {
  LabVerificationGate,
  LabVerificationStatus,
  LabTestSaveStatus,
  recordVerifiedCertificate,
  loadLabSessionMemory,
  saveLabSessionMemory,
} from "./components/LabVerificationGate";
import {
  KnownErrorDiagnosisBanner,
  KnownErrorFilterPopoverContent,
  KnownErrorRulesManager,
  KnownErrorSortField,
  getExceptionRules,
  matchExceptionRules,
  extractSuggestedPatternFromLog,
  isUnrelatedGameBugLog,
  NormalizedRuleSeverity,
} from "./components/KnownExceptionRules";
import {
  scrubLogUserData,
  formatHumanReadableLogText,
  extractCleanRealLogContent,
  inferRealLogFileName,
  resolveLabReportNumber,
  buildFormattedLabReportText,
  extractReportLoadoutFromLogAndContext,
  formatModWithExtAndVersion,
  getCleanModBaseName,
  getModExtensionLabel,
  getModVersionLabel,
  resolveRealReportMod,
  ScrubbedRealLogFile,
} from "./utils/logScrubber";

const LAB_PANEL_MEMORY_KEY = "sanctuary_lab_panel_memory";

function resolveSpokeLabScopeKey(activeWorkspaceId?: string | null, activeGameSchema?: any): string {
  const raw =
    (activeWorkspaceId && activeWorkspaceId !== "default_workspace" ? activeWorkspaceId : "") ||
    activeGameSchema?.id ||
    activeGameSchema?.game_id ||
    "";
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean || clean === "default_workspace" || clean === "default_schema") {
    return "default_workspace";
  }
  return clean;
}

function resolveDefaultRealLogName(activeGameSchema?: any): string {
  const logs = activeGameSchema?.exception_logs;
  if (Array.isArray(logs) && logs.length > 0) {
    for (const entry of logs) {
      const raw =
        typeof entry === "string"
          ? entry
          : entry?.file_name || entry?.exact_name || entry?.pattern || "";
      const cleaned = String(raw || "")
        .trim()
        .replace(/[*?]/g, "");
      if (cleaned && /\.[a-z0-9]+$/i.test(cleaned)) {
        return cleaned;
      }
    }
  }
  return "exception.log";
}

function isLabTestableArtifact(mod: any, activeGameSchema: any): boolean {
  if (!mod || mod.isVirtual) return false;
  const rawName = String(mod.name || mod.physical_path || "").trim();
  if (!rawName) return false;
  const baseName = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
  if (!baseName) return false;

  // Exclude Sanctuary OS internal metadata sidecars, templates, and lexicon JSONs
  if (
    baseName.includes(".sanctuary.") ||
    baseName === "manifest.json" ||
    baseName === "override.json" ||
    baseName.endsWith(".manifest.json") ||
    baseName.endsWith(".override.json") ||
    /^[a-z]{2}-[a-z0-9_-]+\.json$/i.test(baseName)
  ) {
    return false;
  }

  const categoryLower = String(mod.category || mod.type || "").trim().toLowerCase();
  if (categoryLower === "configuration" || categoryLower === "config") {
    return false;
  }

  const normalizeExt = (val: any): string => {
    const raw =
      typeof val === "string"
        ? val
        : val?.extension || val?.ext || val?.format || "";
    const trimmed = String(raw || "").trim().toLowerCase();
    if (!trimmed) return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  };

  const extBlock = activeGameSchema?.extensions || {};
  const scriptExts = new Set<string>(
    (Array.isArray(extBlock.script_extensions) ? extBlock.script_extensions : [])
      .map(normalizeExt)
      .filter(Boolean)
  );
  const matchesAnyExt = (extSet: Set<string>) => {
    for (const ext of extSet) {
      if (baseName.endsWith(ext)) return true;
    }
    return false;
  };

  if (matchesAnyExt(scriptExts)) {
    return true;
  }

  const nonModExts = new Set<string>(
    [
      ...(Array.isArray(extBlock.config_extensions) ? extBlock.config_extensions : []),
      ...(Array.isArray(extBlock.editable_config_formats) ? extBlock.editable_config_formats : []),
      ...(Array.isArray(extBlock.ignore_unidentified) ? extBlock.ignore_unidentified : []),
    ]
      .map(normalizeExt)
      .filter(Boolean)
  );
  if (matchesAnyExt(nonModExts)) {
    return false;
  }

  const exactExcludedFiles = new Set<string>(
    [
      activeGameSchema?.paths?.manifest_file,
      activeGameSchema?.load_order?.manifest_file,
      ...(Array.isArray(extBlock.cache_files) ? extBlock.cache_files : []),
    ]
      .map((f: any) => String(f || "").split(/[\\/]/).pop()?.trim().toLowerCase() || "")
      .filter(Boolean)
  );
  if (exactExcludedFiles.has(baseName)) {
    return false;
  }

  if (Array.isArray(extBlock.vault_visible) && extBlock.vault_visible.length > 0) {
    const visibleExts = new Set<string>(extBlock.vault_visible.map(normalizeExt).filter(Boolean));
    return matchesAnyExt(visibleExts);
  }

  if (Array.isArray(extBlock.supported) && extBlock.supported.length > 0) {
    return isModBinaryExtension(rawName, activeGameSchema) || isScriptExtension(rawName, activeGameSchema);
  }

  if (/\.(json|jsonc|ini|cfg|toml|yaml|yml|txt|md|log)$/i.test(baseName)) {
    return false;
  }
  return true;
}

function LabFilterSection({
  title,
  options,
  value,
  onChange,
  t,
}: {
  title: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
        <span>{title}</span>
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const active = String(value).toLowerCase() === String(opt.id).toLowerCase();
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t("icon_check", "check")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Lab({
  activeLabMod,
  setActiveLabMod,
  modList = [],
  onOpenDossier,
  concludeTest,
  executeHotSwap,
  shelterActive,
  conflictTarget,
  setConflictTarget,
  testErrorFound,
  testLogSnippet,
  isSubmittingReport,
  submitLabReport,
  labQueue = [],
  labVerificationQueue = [],
  labConflicts = [],
  associatedMods = [],
}: any) {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const selectedVersion = useStore((s) => s.selectedVersion);
  const modsPath = useStore((s) => s.modsPath);
  const storeDocsPath = useStore((s) => s.docsPath);
  const docsPath = storeDocsPath || "";
  const setStatus = useStore((s) => s.setStatus);

  const spokeLabKey = resolveSpokeLabScopeKey(activeWorkspaceId, activeGameSchema);
  const scopedPanelMemoryKey = `${LAB_PANEL_MEMORY_KEY}_${spokeLabKey}`;
  const scopedTestHistoryKey = `sanctuary_test_history_${spokeLabKey}`;
  const toolStorageKey = `sanctuary_lab_external_tool_${spokeLabKey}`;

  const [linkedTool, setLinkedTool] = useState<{ name: string; path: string } | null>(() => {
    try {
      const saved = localStorage.getItem(`sanctuary_lab_external_tool_${spokeLabKey}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [airgapStatus, setAirgapStatus] = useState<{
    active: boolean;
    targets: string[];
    airgap_path: string;
    protected_files_count: number;
  }>({
    active: false,
    targets: ["saves"],
    airgap_path: "",
    protected_files_count: 0,
  });

  const [testSaveStatus, setTestSaveStatus] = useState<LabTestSaveStatus | null>(null);
  const [showTestSaveModal, setShowTestSaveModal] = useState(false);
  const [isConfiguringSave, setIsConfiguringSave] = useState(false);
  const [pendingLaunchAfterSaveSetup, setPendingLaunchAfterSaveSetup] = useState<{
    customToolPath?: string;
  } | null>(null);
  const [copiedLogState, setCopiedLogState] = useState(false);
  const freshSaveArmedKey = `sanctuary_lab_fresh_save_armed_${spokeLabKey}`;
  const [freshSaveArmed, setFreshSaveArmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`sanctuary_lab_fresh_save_armed_${spokeLabKey}`) === "1";
    } catch {
      return false;
    }
  });

  const refreshAirgapStatus = async () => {
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
      if (!targetDocs) {
        setAirgapStatus({
          active: false,
          targets: ["saves"],
          airgap_path: "",
          protected_files_count: 0,
        });
        setTestSaveStatus(null);
        return;
      }
      const [res, saveRes]: any = await Promise.all([
        invoke("get_airgap_status", { docsPath: targetDocs, gameSchema: activeGameSchema }).catch(() => null),
        invoke("get_lab_test_save_status", { docsPath: targetDocs, gameSchema: activeGameSchema }).catch(() => null),
      ]);
      if (res) {
        setAirgapStatus(res);
      }
      if (saveRes) {
        setTestSaveStatus(saveRes);
        if (saveRes.has_test_save) {
          setFreshSaveArmed(false);
          try {
            localStorage.removeItem(freshSaveArmedKey);
          } catch { }
        }
      }
    } catch {
      // Ignore in web mode
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(toolStorageKey);
      setLinkedTool(saved ? JSON.parse(saved) : null);
    } catch {
      setLinkedTool(null);
    }
  }, [toolStorageKey]);

  useEffect(() => {
    refreshAirgapStatus();
  }, [shelterActive, docsPath, modsPath, activeGameSchema]);

  const memoryDismissedRef = useRef<boolean>(false);

  const [labSessionStatus, setLabSessionStatus] = useState<LabVerificationStatus | null>(() => {
    return loadLabSessionMemory();
  });

  const [stagedExtras, setStagedExtras] = useState<any[]>([]);
  const [conflictExtras, setConflictExtras] = useState<any[]>([]);
  const [missingDeps, setMissingDeps] = useState<any[]>([]);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("DASHBOARD");
  const [, setLastTestResult] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [secureCardState, setSecureCardState] = useState<"idle" | "working" | "done">("idle");
  const [submitCardState, setSubmitCardState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [downloadCardState, setDownloadCardState] = useState<"idle" | "done">("idle");
  const [reportLogViewTab, setReportLogViewTab] = useState<"LAB_REPORT" | "REAL_LOG">("LAB_REPORT");
  const [liveRealLogs, setLiveRealLogs] = useState<ScrubbedRealLogFile[]>([]);
  const exceptionRules = getExceptionRules(activeGameSchema);

  useEffect(() => {
    setSecureCardState("idle");
    setSubmitCardState("idle");
    setDownloadCardState("idle");
    setReportLogViewTab("LAB_REPORT");
    if (selectedReport && (docsPath || modsPath)) {
      invoke<ScrubbedRealLogFile[]>("get_scrubbed_game_logs", {
        docsPath: docsPath || modsPath || "",
        gameSchema: activeGameSchema,
      })
        .then((files) => {
          if (Array.isArray(files) && files.length > 0) {
            const fallbackLogName = resolveDefaultRealLogName(activeGameSchema);
            setLiveRealLogs(
              files.map((f) => ({
                ...f,
                fileName: f.fileName || f.file_name || fallbackLogName,
                content: scrubLogUserData(f.content),
              }))
            );
          }
        })
        .catch(() => { });
    }
  }, [selectedReport?.id, selectedReport?.sessionKey, docsPath, modsPath, activeGameSchema]);

  const loadScopedTestHistory = (scopeKey: string): any[] => {
    try {
      const key = `sanctuary_test_history_${scopeKey}`;
      const rawStr = localStorage.getItem(key) || "[]";
      const raw = JSON.parse(rawStr);
      if (!Array.isArray(raw)) return [];
      const cleaned = raw
        .filter(
          (entry: any) =>
            Boolean(entry?.mod) &&
            (Boolean(entry.errorFound) ||
              Boolean(entry.logSnippet && String(entry.logSnippet).trim().length > 0) ||
              Boolean(entry.verified))
        )
        .map((entry: any) => ({
          ...entry,
          logSnippet: scrubLogUserData(entry.logSnippet),
        }));
      localStorage.setItem(key, JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return [];
    }
  };

  const [lastConcludingReport, setLastConcludingReport] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(scopedPanelMemoryKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lastConcludingReport) {
          return {
            ...parsed.lastConcludingReport,
            logSnippet: scrubLogUserData(parsed.lastConcludingReport.logSnippet),
          };
        }
      }
    } catch { }
    return null;
  });

  const [testHistory, setTestHistory] = useState<any[]>(() => loadScopedTestHistory(spokeLabKey));

  useEffect(() => {
    setTestHistory(loadScopedTestHistory(spokeLabKey));
    try {
      const raw = localStorage.getItem(scopedPanelMemoryKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLastConcludingReport(
          parsed?.lastConcludingReport
            ? {
              ...parsed.lastConcludingReport,
              logSnippet: scrubLogUserData(parsed.lastConcludingReport.logSnippet),
            }
            : null
        );
      } else {
        setLastConcludingReport(null);
      }
    } catch {
      setLastConcludingReport(null);
    }
    setLabSessionStatus(loadLabSessionMemory());
  }, [spokeLabKey, scopedPanelMemoryKey]);

  const recordRealTestEntry = (entry: any) => {
    if (!entry?.mod) return;
    const scrubbedSnippet = scrubLogUserData(entry.logSnippet);
    setTestHistory((prev: any[]) => {
      const key =
        entry.sessionKey ||
        `${entry.mod?.hash || entry.mod?.name}_${entry.errorFound ? "fail" : "pass"}_${scrubbedSnippet.slice(0, 60)}`;
      const existingIdx = prev.findIndex(
        (r: any) =>
          r.id === entry.id ||
          (r.sessionKey && r.sessionKey === key) ||
          (r.mod?.hash &&
            r.mod.hash === entry.mod?.hash &&
            Boolean(r.errorFound) === Boolean(entry.errorFound) &&
            (r.logSnippet || "").slice(0, 80) === scrubbedSnippet.slice(0, 80))
      );
      let next: any[];
      const normalized = {
        ...entry,
        logSnippet: scrubbedSnippet,
        sessionKey: key,
      };
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...normalized };
      } else {
        next = [normalized, ...prev].slice(0, 50);
      }
      try {
        localStorage.setItem(scopedTestHistoryKey, JSON.stringify(next));
      } catch { }
      return next;
    });
  };

  // Hydrate previous real tests from Spoke DB homestead_lab_logs so user's past diagnostic reports show up
  useEffect(() => {
    let cancelled = false;
    const syncCloudLogs = async () => {
      try {
        const { data: logs } = await supabase
          .from("homestead_lab_logs")
          .select("id, mod_id, version_id, mod_version_id, status, severity, log_snippet, log_text, tester_note, created_at, mods(id, name, status, file_extension), mod_versions(dna_hash, version_label)")
          .order("created_at", { ascending: false })
          .limit(30);
        if (cancelled || !logs || logs.length === 0) return;

        const nonVirtualMods = (modList || []).filter(
          (m: any) => !m?.isVirtual && !String(m?.hash || "").startsWith("virtual_")
        );

        const matchPhysicalModByName = (rawName: string) => {
          const lower = String(rawName || "").toLowerCase();
          return (
            nonVirtualMods.find(
              (m: any) =>
                String(m.name || "").toLowerCase() === lower ||
                String(m.name || "").toLowerCase().endsWith("/" + lower) ||
                String(m.name || "").toLowerCase().endsWith("\\" + lower)
            ) ||
            nonVirtualMods.find(
              (m: any) => String(m.displayName || "").toLowerCase() === lower
            )
          );
        };

        logs.forEach((log: any) => {
          const snippet = scrubLogUserData(log.log_snippet || log.log_text || "");
          if (!snippet) return;
          const modRow = Array.isArray(log.mods) ? log.mods[0] : log.mods;
          const verRow = Array.isArray(log.mod_versions) ? log.mod_versions[0] : log.mod_versions;
          const dnaHash = verRow?.dna_hash;

          let parsedConflictTarget: any = null;
          let parsedStagedExtras: any[] = [];
          let parsedConflictExtras: any[] = [];
          if (log.tester_note) {
            try {
              const parsed = JSON.parse(log.tester_note);
              const extractEntryName = (val: any) =>
                typeof val === "string"
                  ? val
                  : String(val?.displayName || val?.name || val?.title || "");
              if (parsed.conflictTarget) {
                const ctName = extractEntryName(parsed.conflictTarget);
                parsedConflictTarget = matchPhysicalModByName(ctName) || {
                  ...(typeof parsed.conflictTarget === "object" && parsed.conflictTarget
                    ? parsed.conflictTarget
                    : {}),
                  name: ctName,
                  displayName: ctName,
                };
              }
              if (Array.isArray(parsed.dependencies)) {
                parsedStagedExtras = parsed.dependencies
                  .map((depItem: any) => {
                    const depName = extractEntryName(depItem);
                    if (!depName) return null;
                    return (
                      matchPhysicalModByName(depName) || {
                        ...(typeof depItem === "object" && depItem ? depItem : {}),
                        name: depName,
                        displayName: depName,
                      }
                    );
                  })
                  .filter(Boolean);
              }
              if (Array.isArray(parsed.conflictExtras)) {
                parsedConflictExtras = parsed.conflictExtras
                  .map((cItem: any) => {
                    const cName = extractEntryName(cItem);
                    if (!cName) return null;
                    return (
                      matchPhysicalModByName(cName) || {
                        ...(typeof cItem === "object" && cItem ? cItem : {}),
                        name: cName,
                        displayName: cName,
                      }
                    );
                  })
                  .filter(Boolean);
              }
            } catch { }
          }

          const stagedHashes = new Set(
            parsedStagedExtras.map((s: any) => s?.hash).filter(Boolean)
          );
          const localMatch =
            nonVirtualMods.find((m: any) => dnaHash && m.hash === dnaHash) ||
            nonVirtualMods.find(
              (m: any) =>
                modRow?.name &&
                !(m.hash && stagedHashes.has(m.hash)) &&
                (m.name?.toLowerCase().includes(modRow.name.toLowerCase()) ||
                  m.displayName?.toLowerCase() === modRow.name.toLowerCase())
            ) ||
            nonVirtualMods.find(
              (m: any) =>
                modRow?.name &&
                (m.name?.toLowerCase().includes(modRow.name.toLowerCase()) ||
                  m.displayName?.toLowerCase() === modRow.name.toLowerCase())
            );

          const fallbackModObj = modRow
            ? {
              id: modRow.id,
              hash: dnaHash || modRow.id,
              name: modRow.name,
              displayName: modRow.name,
              file_extension: modRow.file_extension,
              version: verRow?.version_label || "Local",
            }
            : null;

          const modObj = resolveRealReportMod(
            localMatch
              ? {
                ...localMatch,
                file_extension: localMatch.file_extension || modRow?.file_extension,
                version:
                  getModVersionLabel(localMatch, modList, parsedStagedExtras) !== "Local"
                    ? getModVersionLabel(localMatch, modList, parsedStagedExtras)
                    : verRow?.version_label || localMatch.version,
              }
              : fallbackModObj,
            parsedStagedExtras,
            modList
          );
          if (!modObj) return;

          const extractedLoadout = extractReportLoadoutFromLogAndContext({
            targetMod: modObj,
            testerNote: log.tester_note,
            logText: log.log_text || log.log_snippet,
            explicitDependencies: parsedStagedExtras,
            explicitConflictTarget: parsedConflictTarget,
            explicitConflictExtras: parsedConflictExtras,
            modList,
            activeGameSchema,
          });

          const isVerifiedPass =
            String(log.status || "").toLowerCase() === "verified" ||
            String(log.severity || "").toLowerCase() === "pass";

          recordRealTestEntry({
            id: `cloud_${log.id}`,
            sessionKey: `cloud_${log.id}`,
            mod: modObj,
            errorFound: !isVerifiedPass,
            verified: isVerifiedPass,
            time: log.created_at || new Date().toISOString(),
            logSnippet: snippet,
            conflictTarget: extractedLoadout.conflictTarget,
            stagedExtras: extractedLoadout.dependencies,
            conflictExtras: extractedLoadout.conflictExtras,
          });
        });
      } catch { }
    };
    syncCloudLogs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modList?.length]);

  const handledTerminalKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (memoryDismissedRef.current) return;
      try {
        const st = await invoke<LabVerificationStatus | null>("poll_lab_verification_session");
        if (mounted && st && !memoryDismissedRef.current) {
          setLabSessionStatus((prev) => {
            if (
              prev &&
              prev.active === st.active &&
              prev.stage === st.stage &&
              prev.dna_hash === st.dna_hash &&
              prev.elapsed_active_seconds === st.elapsed_active_seconds &&
              prev.current_ram_mb === st.current_ram_mb &&
              prev.current_idle_seconds === st.current_idle_seconds &&
              prev.is_focused === st.is_focused &&
              prev.pause_reason === st.pause_reason &&
              prev.error_log === st.error_log
            ) {
              return prev;
            }
            return st;
          });
          if (st.stage === "VERIFIED" && st.certificate) {
            const termKey = `VERIFIED_${st.certificate.dna_hash}_${st.certificate.verified_at}`;
            if (handledTerminalKeyRef.current !== termKey) {
              handledTerminalKeyRef.current = termKey;
              await recordVerifiedCertificate(st.certificate);
              if (activeLabMod) {
                recordRealTestEntry({
                  id: `verified_${st.certificate.dna_hash}_${st.certificate.verified_at}`,
                  sessionKey: `verified_${st.certificate.dna_hash}`,
                  mod: activeLabMod,
                  errorFound: false,
                  verified: true,
                  time: st.certificate.verified_at || new Date().toISOString(),
                  logSnippet: `Verified 4-stage live simulation (${st.certificate.active_seconds}s active, peak RAM ${st.certificate.peak_ram_mb} MB, save checkpoint: ${st.certificate.save_file_verified}).`,
                  conflictTarget,
                  stagedExtras,
                  conflictExtras,
                  missingDeps,
                  linkedFiles: st.linked_files || [],
                });
              }
            }
          } else if (
            st.stage === "FAILED" &&
            st.error_log &&
            activeLabMod &&
            !isUnrelatedGameBugLog(st.error_log, activeGameSchema)
          ) {
            const scrubbedErr = scrubLogUserData(st.error_log);
            const termKey = `FAILED_${st.dna_hash}_${scrubbedErr.slice(0, 48)}`;
            if (handledTerminalKeyRef.current !== termKey) {
              handledTerminalKeyRef.current = termKey;
              const failObj = {
                id: `failed_${st.dna_hash}`,
                sessionKey: `failed_${st.dna_hash}_${scrubbedErr.slice(0, 48)}`,
                mod: activeLabMod,
                errorFound: true,
                verified: false,
                time: new Date().toISOString(),
                logSnippet: scrubbedErr,
                conflictTarget,
                stagedExtras,
                conflictExtras,
                missingDeps,
                linkedFiles: st.linked_files || [],
                isConcluding: true,
              };
              recordRealTestEntry(failObj);
              setLastConcludingReport(failObj);
            }
          }
        } else if (mounted && !shelterActive) {
          const mem = loadLabSessionMemory();
          if (!mem?.active) {
            setLabSessionStatus((prev) => (prev === null ? null : null));
          }
        }
      } catch (e) { }
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelterActive, activeLabMod, conflictTarget, stagedExtras, conflictExtras, missingDeps]);

  const handleToggleAirgap = async (enable: boolean) => {
    try {
      await invoke("airgap_saves", {
        docsPath: docsPath || modsPath || "",
        enable,
      });
      setStatus(
        enable
          ? t("status_airgap_engaged", "SAVE AIRGAP ENGAGED: Live saves evacuated and locked.")
          : t("status_airgap_restored", "SAVE AIRGAP DISENGAGED: Live saves restored.")
      );
      await refreshAirgapStatus();
    } catch (err: any) {
      setStatus(`${t("status_lab_error", "Lab Error:")} ${err?.message || String(err)}`);
    }
  };

  const handleLinkExternalTool = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Executable",
            extensions: ["exe", "bat", "cmd", "app", "sh"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        const cleanName =
          selected
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.(exe|bat|cmd|app|sh)$/i, "") || selected;
        const toolObj = { name: cleanName, path: selected };
        setLinkedTool(toolObj);
        localStorage.setItem(toolStorageKey, JSON.stringify(toolObj));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlinkExternalTool = () => {
    setLinkedTool(null);
    localStorage.removeItem(toolStorageKey);
  };

  const handleLaunchExternalToolStandalone = async () => {
    if (!linkedTool?.path) return;
    try {
      setStatus(t("status_external_tool_launched", "Launching External Program in Save-Airgapped Sandbox..."));
      await invoke("launch_external_tool", {
        toolPath: linkedTool.path,
        docsPath: docsPath || modsPath || "",
        enforceAirgap: true,
      });
      await refreshAirgapStatus();
    } catch (err: any) {
      setStatus(`${t("status_lab_error", "Lab Error:")} ${err?.message || String(err)}`);
    }
  };

  const [searchLogs, setSearchLogs] = useState("");
  const [knownErrorSearch, setKnownErrorSearch] = useState("");
  const [isScanningLiveLogs, setIsScanningLiveLogs] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const [builderSearch, setBuilderSearch] = useState("");
  const [builderFilter, setBuilderFilter] = useState<"all" | "untested" | "tested" | "flagged">("all");
  const [builderPage, setBuilderPage] = useState(1);
  const [knownErrorFilter, setKnownErrorFilter] = useState<"all" | NormalizedRuleSeverity>("all");
  const [knownErrorLabBehavior, setKnownErrorLabBehavior] = useState<"all" | "fails" | "ignored">("all");
  const [knownErrorFileHint, setKnownErrorFileHint] = useState<string>("all");
  const [knownErrorSort, setKnownErrorSort] = useState<KnownErrorSortField>("severity");

  const handleScanLiveExceptionLogs = async () => {
    if (isScanningLiveLogs) return;
    setIsScanningLiveLogs(true);
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
      const files = targetDocs
        ? await invoke<ScrubbedRealLogFile[]>("get_scrubbed_game_logs", {
            docsPath: targetDocs,
            gameSchema: activeGameSchema,
          }).catch(() => [])
        : [];
      const combined = (files || [])
        .map((f) => scrubLogUserData(f?.content || ""))
        .filter((txt) => txt.trim().length > 0)
        .join("\n\n");

      if (!combined) {
        setStatus(
          t(
            "lab_ql_scan_logs_clean",
            "No game exception logs detected on disk — all clear!"
          )
        );
        return;
      }

      const rulesList = getExceptionRules(activeGameSchema);
      const matched = matchExceptionRules(combined, rulesList);
      const queryStr =
        matched.length > 0
          ? matched
              .map((r) => r.pattern.split("|")[0]?.trim())
              .filter(Boolean)
              .join(" ")
          : extractSuggestedPatternFromLog(combined, activeGameSchema)
              .pattern.split("|")[0]
              ?.trim() || "";

      setKnownErrorFilter("all");
      setKnownErrorLabBehavior("all");
      setKnownErrorFileHint("all");
      setKnownErrorSearch(queryStr || combined.slice(0, 120));
      setActiveTab("KNOWN_ERRORS");
      setStatus(
        matched.length > 0
          ? t(
              "lab_ql_scan_logs_matched",
              "Matched live game exception log against Community Known Errors."
            )
          : t(
              "lab_ql_scan_logs_opened",
              "Loaded live game exception signature into Known Errors search."
            )
      );
    } finally {
      setIsScanningLiveLogs(false);
    }
  };

  // Restore active test payload memory on mount if accidentally closed or navigated away
  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedPanelMemoryKey);
      if (raw) {
        const mem = JSON.parse(raw);
        if (!activeLabMod && mem.activeLabMod && setActiveLabMod) {
          setActiveLabMod(mem.activeLabMod);
        }
        if (!conflictTarget && mem.conflictTarget && setConflictTarget) {
          setConflictTarget(mem.conflictTarget);
        }
        if (Array.isArray(mem.stagedExtras) && mem.stagedExtras.length > 0 && stagedExtras.length === 0) {
          setStagedExtras(mem.stagedExtras);
        }
        if (Array.isArray(mem.conflictExtras) && mem.conflictExtras.length > 0 && conflictExtras.length === 0) {
          setConflictExtras(mem.conflictExtras);
        }
        if (mem.lastConcludingReport && !lastConcludingReport) {
          setLastConcludingReport(mem.lastConcludingReport);
        }
      }
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokeLabKey]);

  // Persist active test payload & concluding report to memory
  useEffect(() => {
    if (memoryDismissedRef.current) return;
    try {
      if (activeLabMod || lastConcludingReport) {
        localStorage.setItem(
          scopedPanelMemoryKey,
          JSON.stringify({
            activeLabMod,
            conflictTarget,
            stagedExtras,
            conflictExtras,
            lastConcludingReport,
            updatedAt: new Date().toISOString(),
          })
        );
      }
    } catch { }
  }, [activeLabMod, conflictTarget, stagedExtras, conflictExtras, lastConcludingReport, scopedPanelMemoryKey]);

  const handleClearLabMemory = async () => {
    memoryDismissedRef.current = true;
    try {
      localStorage.removeItem(scopedPanelMemoryKey);
    } catch { }
    saveLabSessionMemory(null);
    setLastConcludingReport(null);
    setLabSessionStatus(null);
    setSelectedReport(null);
    setShowTestPanel(false);
    setStagedExtras([]);
    setConflictExtras([]);
    if (setConflictTarget) setConflictTarget(null);
    if (setActiveLabMod) setActiveLabMod(null);
    try {
      await invoke("stop_lab_verification_session");
    } catch { }
  };

  useEffect(() => {
    if (testLogSnippet && !isUnrelatedGameBugLog(testLogSnippet, activeGameSchema)) {
      const scrubbedSnippet = scrubLogUserData(testLogSnippet);
      setActiveTab("REPORTS");
      const targetMod = activeLabMod || lastConcludingReport?.mod;
      if (targetMod) {
        const concludingObj = {
          id: "concluding_test",
          sessionKey: `crash_${targetMod.hash || targetMod.name}_${scrubbedSnippet.slice(0, 48)}`,
          mod: targetMod,
          errorFound: true,
          verified: false,
          time: new Date().toISOString(),
          logSnippet: scrubbedSnippet,
          conflictTarget: conflictTarget,
          stagedExtras: stagedExtras,
          conflictExtras: conflictExtras,
          missingDeps: missingDeps,
          linkedFiles: labSessionStatus?.linked_files || [],
          isConcluding: true,
        };
        setSelectedReport(concludingObj);
        setLastConcludingReport(concludingObj);
        recordRealTestEntry(concludingObj);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    testLogSnippet,
    activeLabMod,
    testErrorFound,
    conflictTarget,
    stagedExtras,
    conflictExtras,
  ]);

  useEffect(() => {
    let depsToStage: any[] = [];
    let missing: any[] = [];

    const extRegex = getExtensionRegex(activeGameSchema);
    const extractDepString = (raw: any): string => {
      if (!raw) return "";
      if (typeof raw === "string") return raw.trim();
      if (typeof raw === "object") {
        return String(raw.displayName || raw.name || raw.title || raw.mod_name || "").trim();
      }
      return String(raw).trim();
    };
    const cleanName = (raw: any) => {
      const name = extractDepString(raw);
      return name
        ? name
          .replace(/['"]/g, "")
          .replace(/_/g, " ")
          .replace(extRegex, "")
          .trim()
          .toUpperCase()
        : "";
    };

    if (activeLabMod && activeLabMod.dependencies) {
      let rawDeps: any[] = [];
      if (typeof activeLabMod.dependencies === "string") {
        rawDeps = activeLabMod.dependencies
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(activeLabMod.dependencies)) {
        rawDeps = [...activeLabMod.dependencies].filter((s) =>
          Boolean(extractDepString(s)),
        );
      }

      const foundDeps = rawDeps
        .map((rawDep) => {
          const depName = extractDepString(rawDep);
          if (!depName) return null;
          const depId =
            typeof rawDep === "object" && rawDep ? rawDep.id : undefined;
          const depHash =
            typeof rawDep === "object" && rawDep ? rawDep.hash : undefined;
          const depExt =
            typeof rawDep === "object" && rawDep
              ? String(rawDep.file_extension || "")
              : "";
          const targetDepClean = cleanName(depName);
          const isDBScript =
            depName.toLowerCase().includes("script") ||
            depExt.toLowerCase().includes("script");
          const found = modList.find((m: any) => {
            if (!m || m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash)
              return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name)
              return false;

            if (depHash && m.hash === depHash) return true;
            if (depId && (m.id === depId || m.dbId === depId)) return true;

            const mNameStr = extractDepString(m.name);
            if (!mNameStr) return false;

            const isLocalScript = mNameStr.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            return (
              cleanName(mNameStr) === targetDepClean ||
              cleanName(m.displayName) === targetDepClean ||
              (typeof m.path === "string" &&
                m.path.includes(depName) &&
                depName.length > 3)
            );
          });

          if (!found) {
            missing.push(
              typeof rawDep === "object" && rawDep
                ? {
                  ...rawDep,
                  name: depName,
                  displayName: rawDep.displayName || depName,
                }
                : { name: depName, displayName: depName },
            );
          }
          return found;
        })
        .filter(Boolean);

      depsToStage = [...depsToStage, ...foundDeps];
    }

    if (activeLabMod && associatedMods && associatedMods.length > 0) {
      const assocCleanName = (raw: any) => {
        const name = extractDepString(raw);
        return name
          ? name
            .replace(getExtensionRegex(useStore.getState().activeGameSchema), "")
            .replace(/_/g, " ")
            .replace(
              /(\.| |-)*(\(|\[)?(scripts?|modules?|artifacts?|zip)(\)|\])?/gi,
              "",
            )
            .trim()
            .toUpperCase()
          : "";
      };

      const extraDeps = associatedMods
        .map((am: any) => {
          const amName = extractDepString(am);
          const targetAmClean = assocCleanName(amName);
          const isDBScript =
            Boolean(
              typeof am?.file_extension === "string" &&
              am.file_extension.toLowerCase().includes("script"),
            ) || Boolean(amName && amName.toLowerCase().includes("script"));

          const found = modList.find((m: any) => {
            if (!m || m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash)
              return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name)
              return false;

            if (am?.hash && m.hash === am.hash) return true;
            if (am?.id && (m.id === am.id || m.dbId === am.id)) return true;

            const mNameStr = extractDepString(m.name);
            if (!amName || !mNameStr) return false;

            const isLocalScript = mNameStr.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            if (assocCleanName(m.displayName || mNameStr) === targetAmClean)
              return true;

            return false;
          });

          if (!found) {
            missing.push(
              typeof am === "object" && am
                ? { ...am, name: amName, displayName: am.displayName || amName }
                : { name: amName, displayName: amName },
            );
          }
          return found;
        })
        .filter(Boolean);

      depsToStage = [...depsToStage, ...extraDeps];
    }

    if (activeLabMod) {
      const uniqueDeps = Array.from(
        new Map(
          depsToStage.map((item) => [item.hash || item.name, item]),
        ).values(),
      );
      setStagedExtras(uniqueDeps);

      const groupedMissing = new Map<string, any[]>();
      missing.forEach((item) => {
        let nameToClean =
          typeof item === "string" ? item : item.displayName || item.name || "";
        let key = cleanName(nameToClean);
        if (!groupedMissing.has(key)) groupedMissing.set(key, []);
        groupedMissing.get(key)!.push(item);
      });

      const uniqueMissing: any[] = [];
      groupedMissing.forEach((items) => {
        const withId = items.filter((i) => typeof i !== "string" && i.id);
        if (withId.length > 0) {
          const uniqueById = Array.from(
            new Map(withId.map((i) => [i.id, i])).values(),
          );
          uniqueMissing.push(...uniqueById);
        } else {
          uniqueMissing.push(items[0]);
        }
      });

      setMissingDeps(uniqueMissing);
    } else {
      setStagedExtras([]);
      setMissingDeps([]);
    }
  }, [activeLabMod, associatedMods, modList, activeGameSchema]);

  const handleExportLogs = async () => {
    try {
      const reportNum = resolveLabReportNumber(selectedReport, reportsToList);
      const defaultFileName = `Lab_Report_${reportNum}.txt`;
      const path = await save({
        defaultPath: defaultFileName,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (path) {
        const reportTarget = selectedReport ? selectedReport.mod : activeLabMod;
        const rawLog = selectedReport ? selectedReport.logSnippet : testLogSnippet;
        const scrubbedLog = scrubLogUserData(rawLog || "");
        const matchedRules = matchExceptionRules(scrubbedLog, exceptionRules || []);
        const resolvedExportLoadout = extractReportLoadoutFromLogAndContext({
          targetMod: reportTarget,
          logText: scrubbedLog,
          explicitDependencies: selectedReport ? selectedReport.stagedExtras : stagedExtras,
          explicitConflictTarget: selectedReport ? selectedReport.conflictTarget : conflictTarget,
          explicitConflictExtras: selectedReport ? selectedReport.conflictExtras : conflictExtras,
          linkedFiles: selectedReport?.linkedFiles || labSessionStatus?.linked_files || [],
          modList,
          activeGameSchema,
        });

        const finalLabReport = buildFormattedLabReportText({
          reportNumber: reportNum,
          date: selectedReport?.time
            ? new Date(selectedReport.time).toLocaleString()
            : new Date().toLocaleString(),
          gameVersion: selectedVersion || "Local",
          targetMod: reportTarget,
          conflictTarget: resolvedExportLoadout.conflictTarget,
          stagedExtras: resolvedExportLoadout.dependencies,
          conflictExtras: resolvedExportLoadout.conflictExtras,
          missingDeps: selectedReport?.missingDeps || missingDeps,
          linkedFiles: selectedReport?.linkedFiles || labSessionStatus?.linked_files || [],
          matchedRules,
          rawLogText: scrubbedLog,
          errorFound: Boolean(selectedReport ? selectedReport.errorFound : testErrorFound),
          verified: Boolean(selectedReport ? selectedReport.verified : false),
          activeGameSchema,
          modList,
        });

        await writeTextFile(path, finalLabReport);

        // Also save the scrubbed real game log(s) alongside the Lab Report in the same directory
        const lastSepIdx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
        const dirPath = lastSepIdx >= 0 ? path.slice(0, lastSepIdx + 1) : "";
        const baseFileName = (lastSepIdx >= 0 ? path.slice(lastSepIdx + 1) : path).replace(/\.txt$/i, "");

        if (liveRealLogs.length > 0) {
          const fallbackLogName = resolveDefaultRealLogName(activeGameSchema);
          for (const realLog of liveRealLogs) {
            const rawName = realLog.fileName || realLog.file_name || fallbackLogName;
            const safeRealName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const companionPath = `${dirPath}${baseFileName}_${safeRealName}`;
            await writeTextFile(companionPath, scrubLogUserData(realLog.content));
          }
        } else if (scrubbedLog.trim().length > 0) {
          const cleanRealLog = extractCleanRealLogContent(scrubbedLog);
          const inferredRealName = inferRealLogFileName(scrubbedLog, undefined, activeGameSchema);
          const companionPath = `${dirPath}${baseFileName}_${inferredRealName}`;
          await writeTextFile(companionPath, cleanRealLog);
        }

        setDownloadCardState("done");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const executeHotSwapNow = async (customToolPath?: string) => {
    memoryDismissedRef.current = false;
    const extraNames = [...stagedExtras, ...conflictExtras].map((m) => m.name);
    await executeHotSwap(extraNames, customToolPath);
    await refreshAirgapStatus();
    setShowTestPanel(true);
  };

  const runCombinedHotSwap = async (customToolPath?: string) => {
    // First-time setup: if no dedicated Lab Test Save exists yet and user hasn't armed a clean sandbox, prompt setup first
    if (testSaveStatus && !testSaveStatus.has_test_save && !freshSaveArmed) {
      setPendingLaunchAfterSaveSetup({ customToolPath });
      setShowTestSaveModal(true);
      return;
    }
    await executeHotSwapNow(customToolPath);
  };

  const handleCopyLiveSaveForLab = async (saveFileName: string) => {
    setIsConfiguringSave(true);
    try {
      const targetDocs = docsPath || modsPath || "";
      const updated = await invoke<LabTestSaveStatus>("configure_lab_test_save", {
        docsPath: targetDocs,
        mode: "copy_live_save",
        sourceSaveName: saveFileName,
        gameSchema: activeGameSchema,
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(false);
      try {
        localStorage.removeItem(freshSaveArmedKey);
      } catch { }
      setStatus(`${t("lab_test_save_status_copied", "Dedicated Lab Test Save updated:")} ${saveFileName}`);
      if (pendingLaunchAfterSaveSetup) {
        const pending = pendingLaunchAfterSaveSetup;
        setPendingLaunchAfterSaveSetup(null);
        setShowTestSaveModal(false);
        await executeHotSwapNow(pending.customToolPath);
      }
    } catch (err: any) {
      setStatus(`${t("status_lab_error", "Lab Error:")} ${err?.message || String(err)}`);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const handleResetForFreshSave = async (launchNow = false) => {
    setIsConfiguringSave(true);
    try {
      const targetDocs = docsPath || modsPath || "";
      const updated = await invoke<LabTestSaveStatus>("configure_lab_test_save", {
        docsPath: targetDocs,
        mode: "reset_for_fresh_save",
        gameSchema: activeGameSchema,
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(true);
      try {
        localStorage.setItem(freshSaveArmedKey, "1");
      } catch { }
      setStatus(
        t(
          "lab_test_save_status_reset",
          "Lab Sandbox reset to clean state. Create & save a new game during your next Lab run."
        )
      );
      if (pendingLaunchAfterSaveSetup) {
        const pending = pendingLaunchAfterSaveSetup;
        setPendingLaunchAfterSaveSetup(null);
        setShowTestSaveModal(false);
        await executeHotSwapNow(pending.customToolPath);
      } else if (launchNow) {
        setShowTestSaveModal(false);
        if (activeLabMod) {
          await executeHotSwapNow();
        } else {
          await invoke("airgap_saves", { docsPath: targetDocs, enable: true, gameSchema: activeGameSchema });
          const coords: any = await invoke("get_saved_coordinates");
          await invoke("launch_game", {
            livePath: coords?.live_path || "",
            modsPath: coords?.mods_path || modsPath || "",
            gameSchema: activeGameSchema,
          });
          await refreshAirgapStatus();
        }
      }
    } catch (err: any) {
      setStatus(`${t("status_lab_error", "Lab Error:")} ${err?.message || String(err)}`);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const getModName = (mod: any, extraDeps?: any[]) => {
    if (!mod) return "UNKNOWN";
    return formatModWithExtAndVersion(
      mod,
      activeGameSchema,
      modList,
      extraDeps
    );
  };

  const builderBaseMods = React.useMemo(
    () => (modList || []).filter((m: any) => isLabTestableArtifact(m, activeGameSchema)),
    [modList, activeGameSchema]
  );

  const builderSymbioticMods = React.useMemo(() => {
    const excludedHashes = new Set(
      [
        ...stagedExtras.map((e: any) => e?.hash),
        ...conflictExtras.map((e: any) => e?.hash),
        conflictTarget?.hash,
      ].filter(Boolean)
    );
    return builderBaseMods.filter(
      (m: any) =>
        m.hash !== activeLabMod?.hash &&
        !(m.hash && excludedHashes.has(m.hash))
    );
  }, [builderBaseMods, activeLabMod?.hash, stagedExtras, conflictExtras, conflictTarget?.hash]);

  const builderPrimaryAdversaryMods = React.useMemo(() => {
    if (activeTab !== "BUILDER" || conflictTarget) return [];
    const stagedHashes = new Set(
      stagedExtras.map((e: any) => e?.hash).filter(Boolean)
    );
    return builderBaseMods.filter(
      (m: any) =>
        m.hash !== activeLabMod?.hash &&
        !(m.hash && stagedHashes.has(m.hash))
    );
  }, [activeTab, conflictTarget, builderBaseMods, activeLabMod?.hash, stagedExtras]);

  const builderExtraAdversaryMods = React.useMemo(() => {
    const stagedHashes = new Set(
      stagedExtras.map((e: any) => e?.hash).filter(Boolean)
    );
    return builderBaseMods.filter(
      (m: any) =>
        m.hash !== activeLabMod?.hash &&
        m.hash !== conflictTarget?.hash &&
        !(m.hash && stagedHashes.has(m.hash))
    );
  }, [builderBaseMods, activeLabMod?.hash, conflictTarget?.hash, stagedExtras]);

  const abortLab = () => {
    handleClearLabMemory();
  };

  const handleConcludeTest = async () => {
    if (secureCardState === "working" || secureCardState === "done") return;
    const fromReportPanel = Boolean(selectedReport);
    const targetMod = selectedReport?.mod || activeLabMod || lastConcludingReport?.mod;
    const targetErr = Boolean(
      selectedReport
        ? selectedReport.errorFound
        : testErrorFound || Boolean(testLogSnippet) || labSessionStatus?.stage === "FAILED"
    );
    const targetLog = scrubLogUserData(
      (selectedReport ? selectedReport.logSnippet : testLogSnippet) ||
      labSessionStatus?.error_log ||
      ""
    );
    const isVerifiedPass = Boolean(
      !targetErr &&
      (selectedReport?.verified || labSessionStatus?.stage === "VERIFIED")
    );

    const ctx = {
      conflictTarget: conflictTarget?.name,
      dependencies: [
        ...stagedExtras.map((m) => m.name),
        ...conflictExtras.map((m) => m.name),
      ],
    };

    if (fromReportPanel) {
      setSecureCardState("working");
    }

    // Only record to testHistory if the test actually produced a real error or passed verification
    if (targetMod && (targetErr || Boolean(targetLog) || isVerifiedPass)) {
      const result = {
        id: selectedReport?.id || crypto.randomUUID(),
        sessionKey: selectedReport?.sessionKey,
        mod: targetMod,
        errorFound: targetErr,
        verified: isVerifiedPass,
        time: selectedReport?.time || new Date().toISOString(),
        logSnippet:
          targetLog ||
          (isVerifiedPass ? "Verified 4-stage live simulation & save checkpoint." : ""),
        conflictTarget: selectedReport?.conflictTarget ?? conflictTarget,
        stagedExtras: selectedReport?.stagedExtras ?? stagedExtras,
        conflictExtras: selectedReport?.conflictExtras ?? conflictExtras,
        missingDeps: selectedReport?.missingDeps ?? missingDeps,
        linkedFiles: selectedReport?.linkedFiles ?? labSessionStatus?.linked_files ?? [],
      };
      setLastTestResult(result);
      recordRealTestEntry(result);
    }

    await concludeTest(ctx, targetMod, targetErr);
    await refreshAirgapStatus();

    if (fromReportPanel) {
      // Keep the Report SidePanel open and show in-place completion feedback on the clicked card
      setSecureCardState("done");
      setSelectedReport((prev: any) => (prev ? { ...prev, isConcluding: false } : prev));
      try {
        localStorage.removeItem(scopedPanelMemoryKey);
      } catch { }
      saveLabSessionMemory(null);
      setLastConcludingReport(null);
      setLabSessionStatus(null);
      setShowTestPanel(false);
    } else {
      await handleClearLabMemory();
      setActiveTab("DASHBOARD");
    }
  };

  const passedCount = testHistory.filter((m: any) => !m.errorFound).length;
  const failedCount = testHistory.filter((m: any) => m.errorFound).length;
  const totalRanCount = testHistory.length;
  const testedModHashes = React.useMemo(
    () => new Set(testHistory.map((th: any) => th?.mod?.hash).filter(Boolean)),
    [testHistory]
  );
  const testedEligibleCount = React.useMemo(
    () => builderBaseMods.filter((m: any) => m?.hash && testedModHashes.has(m.hash)).length,
    [builderBaseMods, testedModHashes]
  );
  const untestedCount = Math.max(0, builderBaseMods.length - testedEligibleCount);
  const flaggedEligibleCount = React.useMemo(
    () =>
      builderBaseMods.filter((m: any) => {
        const st = String(m?.status || "").toLowerCase();
        return st.includes("unstable") || st.includes("corrupted") || st.includes("broken");
      }).length,
    [builderBaseMods]
  );

  const filteredBuilderCandidates = React.useMemo(() => {
    const q = builderSearch.trim().toLowerCase();
    const matches = builderBaseMods.filter((m: any) => {
      const isTested = Boolean(m?.hash && testedModHashes.has(m.hash));
      if (builderFilter === "untested" && isTested) return false;
      if (builderFilter === "tested" && !isTested) return false;
      if (builderFilter === "flagged") {
        const st = String(m?.status || "").toLowerCase();
        if (!st.includes("unstable") && !st.includes("corrupted") && !st.includes("broken")) {
          return false;
        }
      }
      if (!q) return true;
      const clean = getCleanModBaseName(m).toLowerCase();
      const raw = String(m?.name || "").toLowerCase();
      const author = String(m?.author || m?.master_author || "").toLowerCase();
      return clean.includes(q) || raw.includes(q) || author.includes(q);
    });

    return [...matches].sort((a: any, b: any) => {
      const aTested = a?.hash && testedModHashes.has(a.hash) ? 1 : 0;
      const bTested = b?.hash && testedModHashes.has(b.hash) ? 1 : 0;
      if (aTested !== bTested) return aTested - bTested;
      return getCleanModBaseName(a).localeCompare(getCleanModBaseName(b));
    });
  }, [builderBaseMods, builderSearch, builderFilter, testedModHashes]);

  const realStats = {
    tested: totalRanCount,
    untested: untestedCount,
    totalRan: totalRanCount,
    passed: passedCount,
    failed: failedCount,
    lastTest: testHistory.length > 0 ? t("time_just_now", "Just Now") : "--",
  };

  let reportsToList = [...testHistory];
  const isConcluding = Boolean(testLogSnippet || testErrorFound);
  if (isConcluding && activeLabMod) {
    const scrubbedConcludingLog = scrubLogUserData(testLogSnippet || "");
    const concludingId = `crash_${activeLabMod.hash || activeLabMod.name}_${scrubbedConcludingLog.slice(0, 48)}`;
    if (!reportsToList.some((r) => r.sessionKey === concludingId)) {
      reportsToList.unshift({
        id: "concluding_test",
        sessionKey: concludingId,
        mod: activeLabMod,
        errorFound: true,
        time: new Date().toISOString(),
        logSnippet: scrubbedConcludingLog,
        conflictTarget: conflictTarget,
        stagedExtras: stagedExtras,
        conflictExtras: conflictExtras,
        missingDeps: missingDeps,
        linkedFiles: labSessionStatus?.linked_files || [],
        isConcluding: true,
      });
    }
  } else if (
    lastConcludingReport &&
    !reportsToList.some(
      (r) =>
        r.id === lastConcludingReport.id ||
        (r.sessionKey && r.sessionKey === lastConcludingReport.sessionKey)
    )
  ) {
    reportsToList.unshift(lastConcludingReport);
  }

  const filteredReports = reportsToList.filter((report: any) => {
    const m = report.mod;
    if (
      searchLogs &&
      !m?.name?.toLowerCase().includes(searchLogs.toLowerCase()) &&
      !m?.displayName?.toLowerCase().includes(searchLogs.toLowerCase())
    )
      return false;

    const isError = report.errorFound;
    const isPass = !report.errorFound;

    if (logFilter === "pass" && !isPass) return false;
    if (logFilter === "fail" && !isError) return false;
    return true;
  });

  const hasActiveMemorySession = Boolean(
    !memoryDismissedRef.current &&
    (shelterActive ||
      (labSessionStatus && labSessionStatus.active) ||
      (activeLabMod && labSessionStatus && labSessionStatus.stage !== "IDLE"))
  );
  const rememberedReport = !memoryDismissedRef.current
    ? lastConcludingReport || (isConcluding && activeLabMod ? reportsToList[0] : null)
    : null;
  const spokeExceptionRules = getExceptionRules(activeGameSchema);
  const spokeExceptionRulesCount = spokeExceptionRules.length;

  const headerPillActions: {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    activeClassName?: string;
  }[] = [];
  if (hasActiveMemorySession && !showTestPanel) {
    headerPillActions.push({
      id: "reopen_testing_panel",
      icon: t("icon_history", "history"),
      label: t("lab_memory_reopen_panel", "Reopen Testing Panel") as string,
      onClick: () => setShowTestPanel(true),
      activeClassName: "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
    });
  }
  if (rememberedReport && !selectedReport) {
    headerPillActions.push({
      id: "reopen_last_report",
      icon: rememberedReport.errorFound
        ? t("icon_warning", "warning")
        : t("icon_assignment_turned_in", "assignment_turned_in"),
      label: t("lab_memory_reopen_report", "Reopen Last Report") as string,
      onClick: () => setSelectedReport(rememberedReport),
      activeClassName: rememberedReport.errorFound
        ? "text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
        : "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]",
    });
  }
  if ((hasActiveMemorySession && !showTestPanel) || (rememberedReport && !selectedReport)) {
    headerPillActions.push({
      id: "clear_lab_memory",
      icon: t("icon_delete_sweep", "delete_sweep"),
      label: t("lab_memory_clear", "Clear Memory") as string,
      onClick: handleClearLabMemory,
      activeClassName:
        "text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]",
    });
  }

  headerPillActions.push({
    id: "lab_test_save_config",
    icon: t("icon_save", "save"),
    label: testSaveStatus?.active_test_save
      ? `${t("lab_test_save_title", "Dedicated Lab Test Save")}: ${testSaveStatus.active_test_save.file_name}`
      : (t("lab_test_save_btn_setup", "Set Up Test Save") as string),
    onClick: () => setShowTestSaveModal(true),
    activeClassName: testSaveStatus?.has_test_save
      ? "text-[var(--accent)]"
      : "text-[var(--warning)]",
  });

  if (activeTab === "BUILDER" && shelterActive) {
    headerPillActions.push({
      id: "view_active_test",
      icon: t("icon_science", "science"),
      label: t("btn_view_test", "View Active Test") as string,
      onClick: () => setShowTestPanel(true),
      activeClassName: "text-[var(--success)]",
    });
  }

  const showHeaderSearch =
    activeTab === "BUILDER" || activeTab === "REPORTS" || activeTab === "KNOWN_ERRORS";
  const activeSearchQuery =
    activeTab === "BUILDER"
      ? builderSearch
      : activeTab === "KNOWN_ERRORS"
        ? knownErrorSearch
        : searchLogs;
  const handleActiveSearchChange = (val: string) => {
    if (activeTab === "BUILDER") {
      setBuilderSearch(val);
      setBuilderPage(1);
    } else if (activeTab === "KNOWN_ERRORS") {
      setKnownErrorSearch(val);
    } else {
      setSearchLogs(val);
    }
  };

  const hasActivePopoverFilter =
    activeTab === "BUILDER"
      ? builderFilter !== "all"
      : activeTab === "REPORTS"
        ? logFilter !== "all"
        : activeTab === "KNOWN_ERRORS"
          ? knownErrorFilter !== "all" ||
            knownErrorLabBehavior !== "all" ||
            knownErrorFileHint !== "all" ||
            knownErrorSort !== "severity"
          : false;

  const labFilterPopoverContent =
    activeTab === "BUILDER" ? (
      <div className="flex flex-col w-[340px] max-w-[calc(100vw-40px)] p-4 gap-5 text-left">
        <LabFilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={builderFilter}
          onChange={(val) => {
            setBuilderFilter(val as "all" | "untested" | "tested" | "flagged");
            setBuilderPage(1);
          }}
          options={[
            { id: "all", label: `${t("filter_all", "All")} (${builderBaseMods.length})` },
            { id: "untested", label: `${t("lab_status_untested", "Untested")} (${untestedCount})` },
            { id: "tested", label: `${t("lab_status_tested", "Tested")} (${testedEligibleCount})` },
            { id: "flagged", label: `${t("label_unstable", "Unstable")} (${flaggedEligibleCount})` },
          ]}
        />
      </div>
    ) : activeTab === "REPORTS" ? (
      <div className="flex flex-col w-[340px] max-w-[calc(100vw-40px)] p-4 gap-5 text-left">
        <LabFilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={logFilter}
          onChange={(val) => setLogFilter(val)}
          options={[
            { id: "all", label: `${t("filter_all", "All")} (${reportsToList.length})` },
            { id: "pass", label: `${t("status_stable", "Stable")} (${realStats.passed})` },
            { id: "fail", label: `${t("fatal", "Fatal")} (${realStats.failed})` },
          ]}
        />
      </div>
    ) : activeTab === "KNOWN_ERRORS" ? (
      <KnownErrorFilterPopoverContent
        rules={spokeExceptionRules}
        severityFilter={knownErrorFilter}
        onSeverityFilterChange={setKnownErrorFilter}
        labBehaviorFilter={knownErrorLabBehavior}
        onLabBehaviorFilterChange={setKnownErrorLabBehavior}
        fileHintFilter={knownErrorFileHint}
        onFileHintFilterChange={setKnownErrorFileHint}
        sortBy={knownErrorSort}
        onSortByChange={setKnownErrorSort}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full relative z-10 pr-4">
      <ViewHeader
        title={t("term_lab", "Testing Lab")}
        subtitle={t("lab_subtitle", "Diagnostics, calibration, and local system health")}
        icon={t("icon_science", "science")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        breadcrumb={
          activeTab === "KNOWN_ERRORS"
            ? t("exc_rules_user_tab_title", "Known Errors")
            : activeTab !== "DASHBOARD"
              ? t(`tab_lab_${activeTab.toLowerCase()}`, activeTab)
              : undefined
        }
        onTitleClick={() => setActiveTab("DASHBOARD")}
      >
        <div className="flex items-center gap-3">
          {(showHeaderSearch || headerPillActions.length > 0) && (
            <ActionPill
              searchQuery={activeSearchQuery}
              setSearchQuery={handleActiveSearchChange}
              hideSearch={!showHeaderSearch}
              searchPlaceholder={
                activeTab === "KNOWN_ERRORS"
                  ? (t("exc_rules_search_short_ph", "Search errors or paste log...") as string)
                  : activeTab === "BUILDER"
                    ? (t("search_ph", "Search {mods}...") as string)
                    : (t("search_logs", "Search Logs...") as string)
              }
              primaryPopover={
                labFilterPopoverContent
                  ? {
                    icon: t("icon_tune", "tune"),
                    label: t("filters", "Filters") as string,
                    isActive: hasActivePopoverFilter,
                    content: labFilterPopoverContent,
                  }
                  : undefined
              }
              actions={headerPillActions}
            />
          )}
        </div>
      </ViewHeader>

      <div className="flex flex-col w-full gap-3 mb-8 md:mb-10">
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t("icon_dashboard", "dashboard")}
            label={t("overview", "Overview")}
            number=""
            onClick={() => setActiveTab("DASHBOARD")}
            isActive={activeTab === "DASHBOARD"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_science", "science")}
            label={t("tab_lab_builder", "Environment Builder")}
            number={builderBaseMods.length}
            onClick={() => setActiveTab("BUILDER")}
            isActive={activeTab === "BUILDER"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_terminal", "terminal")}
            label={t("tab_lab_reports", "Lab Reports")}
            number={reportsToList.length}
            onClick={() => { setActiveTab("REPORTS"); setLogFilter("all"); }}
            isActive={activeTab === "REPORTS"}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_rule_settings", "rule_settings")}
            label={t("exc_rules_user_tab_title", "Known Errors")}
            number={spokeExceptionRulesCount}
            onClick={() => { setActiveTab("KNOWN_ERRORS"); setKnownErrorFilter("all"); }}
            isActive={activeTab === "KNOWN_ERRORS"}
          />
        </StatTileCarousel>
      </div>

      {activeTab === "DASHBOARD" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
          {testSaveStatus && !testSaveStatus.has_test_save && (
            <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[22px]">
                    {t("icon_save", "save")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("lab_test_save_unconfigured_title", "First-Time Lab Save Setup")}
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_science", "science")}
                      </span>
                      <span>
                        {t("lab_test_save_none_badge", "CLEAN SANDBOX (CREATE SAVE IN-GAME)")}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                    {t(
                      "lab_test_save_unconfigured_desc",
                      "Instead of using your last played save, the Lab uses a dedicated testing save that is only active when the Lab is running. Create a new save in-game or copy an existing save below."
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end ml-auto shrink-0">
                <ActionButton
                  variant="accent"
                  icon={t("icon_save", "save")}
                  label={t("lab_test_save_btn_setup", "Set Up Test Save")}
                  onClick={() => setShowTestSaveModal(true)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-10 w-full">
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_tests_title", "Recent Tests")}
                    icon={t("icon_history", "history")}
                  />
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {testHistory.length > 0 ? (
                      testHistory
                        .slice(0, 10)
                        .map((test: any, index: number) => {
                          const isError = Boolean(test.errorFound);
                          const cardReportNum = resolveLabReportNumber(test, reportsToList);
                          const resolvedTestMod = resolveRealReportMod(
                            test.mod,
                            test.stagedExtras,
                            modList
                          );
                          const modVer = test.mod
                            ? getModVersionLabel(resolvedTestMod, modList, test.stagedExtras)
                            : null;
                          const modExt = test.mod
                            ? getModExtensionLabel(
                              resolvedTestMod,
                              activeGameSchema,
                              modList,
                              test.stagedExtras
                            )
                            : null;
                          return (
                            <UniversalCard
                              key={test.id || index}
                              layout="vertical"
                              onClick={() => setSelectedReport(test)}
                              onContextMenu={(e) => {
                                const menuItems: SanctuaryContextMenuItem[] = [
                                  {
                                    label: t("view_details", "View Details"),
                                    icon: t("icon_visibility", "visibility"),
                                    onClick: () => setSelectedReport(test),
                                  },
                                ];
                                if (resolvedTestMod && onOpenDossier) {
                                  menuItems.push({
                                    label: t("inspect", "Inspect"),
                                    icon: t("icon_deployed_code", "deployed_code"),
                                    onClick: () => onOpenDossier(resolvedTestMod),
                                  });
                                }
                                if (resolvedTestMod) {
                                  menuItems.push({
                                    label: t("tab_env_builder", "Environment Builder"),
                                    icon: t("icon_science", "science"),
                                    onClick: () => {
                                      setActiveLabMod(resolvedTestMod);
                                      setStagedExtras(Array.isArray(test.stagedExtras) ? test.stagedExtras : []);
                                      setConflictTarget(test.conflictTarget || null);
                                      setConflictExtras(Array.isArray(test.conflictExtras) ? test.conflictExtras : []);
                                      setActiveTab("BUILDER");
                                    },
                                  });
                                }
                                if (test.logSnippet) {
                                  menuItems.push({
                                    label: t("copy_log", "Copy Log"),
                                    icon: t("icon_content_copy", "content_copy"),
                                    dividerBefore: true,
                                    onClick: () => navigator.clipboard?.writeText(String(test.logSnippet)),
                                  });
                                }
                                if (isError && submitLabReport) {
                                  menuItems.push({
                                    label: t("lab_action_submit_diag_title", "Submit To Diagnostics"),
                                    icon: t("icon_send", "send"),
                                    variant: "warning",
                                    dividerBefore: !test.logSnippet,
                                    onClick: () => {
                                      submitLabReport(test);
                                    },
                                  });
                                }
                                openSanctuaryContextMenu(e, menuItems);
                              }}
                              icon={isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                              title={
                                test.mod
                                  ? getCleanModBaseName(resolvedTestMod)
                                  : t("ecosystem_forge", "Ecosystem Forge")
                              }
                              subtitle={
                                test.conflictTarget
                                  ? `${t("vs", "vs")} ${getCleanModBaseName(test.conflictTarget)}`
                                  : t("target_engine_core", "Target: Engine Core Only")
                              }
                              imageOverlay={
                                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-none">
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span
                                      className={`material-symbols-outlined !text-[12px] ${isError ? "text-[var(--danger)]" : "text-[var(--success)]"
                                        }`}
                                    >
                                      {isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                                    </span>
                                    <span>
                                      {isError
                                        ? t("fatal_collision", "Fatal Collision")
                                        : t("successful_injection", "Successful Injection")}
                                    </span>
                                  </span>
                                </div>
                              }
                              badges={
                                <>
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                      {t("icon_terminal", "terminal")}
                                    </span>
                                    <span className="font-mono">
                                      {`Lab_Report_${cardReportNum}`}
                                    </span>
                                  </span>
                                  {modExt && (
                                    <span className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                        {t("icon_deployed_code", "deployed_code")}
                                      </span>
                                      <span>{modExt}</span>
                                    </span>
                                  )}
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                      {t("icon_sell", "sell")}
                                    </span>
                                    <span>
                                      {modVer ? `v${modVer}` : selectedVersion || t("unknown", "Unknown")}
                                    </span>
                                  </span>
                                </>
                              }
                              footer={
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                                    {new Date(test.time).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}{" "}
                                    &bull;{" "}
                                    {new Date(test.time).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                                    {t("view_details", "View Details")}
                                    <span className="material-symbols-outlined !text-[14px]">
                                      {t("icon_arrow_forward", "arrow_forward")}
                                    </span>
                                  </span>
                                </div>
                              }
                            />
                          );
                        })
                    ) : (
                      <EmptyState
                        icon={t("icon_history", "history")}
                        title={t("no_recent_telemetry", "No Recent Telemetry")}
                        className="col-span-full py-12"
                      />
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_bolt", "bolt")}>
                <div className="flex flex-col gap-3.5 w-full">
                  {hasActiveMemorySession ? (
                    <CommandScreenQuickLink
                      icon={t("icon_radar", "radar")}
                      isActive={true}
                      title={t("btn_view_test", "View Active Test")}
                      subtitle={
                        activeLabMod
                          ? getCleanModBaseName(activeLabMod)
                          : t("test_running_wait", "Sandbox monitoring is active...")
                      }
                      onClick={() => setShowTestPanel(true)}
                    />
                  ) : airgapStatus.active ? (
                    <CommandScreenQuickLink
                      icon={t("icon_shield_lock", "shield_lock")}
                      isAlert={true}
                      title={t("lab_btn_restore_saves", "Restore Live Saves")}
                      subtitle={t(
                        "lab_airgap_active_sub",
                        "Save Airgap engaged — restore normal saves"
                      )}
                      onClick={() => handleToggleAirgap(false)}
                    />
                  ) : null}

                  <CommandScreenQuickLink
                    icon={t("icon_biotech", "biotech")}
                    title={t("lab_ql_test_untested_title", "Test Untested {Mods}")}
                    subtitle={
                      untestedCount > 0
                        ? t(
                            "lab_ql_test_untested_count",
                            "{count} untested in {Vault}"
                          ).replace("{count}", String(untestedCount))
                        : t("lab_ql_all_tested", "All {Vault} {mods} tested")
                    }
                    onClick={() => {
                      setBuilderFilter("untested");
                      setBuilderSearch("");
                      setBuilderPage(1);
                      setActiveTab("BUILDER");
                    }}
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_troubleshoot", "troubleshoot")}
                    iconColorClass={flaggedEligibleCount > 0 ? "text-[var(--warning)]" : ""}
                    title={t("lab_ql_isolate_flagged_title", "Isolate Unstable {Mods}")}
                    subtitle={
                      flaggedEligibleCount > 0
                        ? t(
                            "lab_ql_isolate_flagged_count",
                            "{count} flagged in {Vault}"
                          ).replace("{count}", String(flaggedEligibleCount))
                        : t("lab_ql_zero_flagged", "No unstable or corrupted {mods}")
                    }
                    onClick={() => {
                      setBuilderFilter("flagged");
                      setBuilderSearch("");
                      setBuilderPage(1);
                      setActiveTab("BUILDER");
                    }}
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_manage_search", "manage_search")}
                    title={t("lab_ql_scan_logs_title", "Scan Game Exception Logs")}
                    subtitle={t(
                      "lab_ql_scan_logs_sub",
                      "Match live game logs against Known Errors"
                    )}
                    onClick={handleScanLiveExceptionLogs}
                  />

                  <CommandScreenQuickLink
                    icon={t("icon_save", "save")}
                    iconColorClass={
                      testSaveStatus?.has_test_save
                        ? "text-[var(--accent)]"
                        : "text-[var(--warning)]"
                    }
                    title={t("lab_test_save_title", "Dedicated Lab Test Save")}
                    subtitle={
                      testSaveStatus?.active_test_save
                        ? testSaveStatus.active_test_save.file_name
                        : t("lab_test_save_none_short", "Clean Sandbox • Set Up Save")
                    }
                    onClick={() => setShowTestSaveModal(true)}
                  />

                  {/* EXTERNAL PROGRAM LINKER (MATCHES COMMANDSCREENQUICKLINK GEOMETRY 1:1) */}
                  <div
                    onClick={
                      linkedTool
                        ? handleLaunchExternalToolStandalone
                        : handleLinkExternalTool
                    }
                    className="w-full p-5 min-h-24 flex items-center glass-panel rounded-2xl transition-colors text-left group cursor-pointer border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                  >
                    <div className="flex items-center gap-4 w-full">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${
                          linkedTool ? "text-[var(--accent)]" : "text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[22px]">
                          {linkedTool
                            ? t("icon_launch", "rocket_launch")
                            : t("icon_build_circle", "build_circle")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <h3 className="text-sm font-black tracking-wide truncate text-[var(--text)] m-0">
                          {linkedTool
                            ? linkedTool.name
                            : t("lab_external_tool_title", "External Test Program")}
                        </h3>
                        <span className="text-[10px] font-semibold truncate text-[var(--subtext)]">
                          {linkedTool
                            ? t("lab_btn_launch_tool", "Launch Linked Tool")
                            : t("lab_btn_link_tool", "Link External Program")}
                        </span>
                      </div>
                      {linkedTool && (
                        <div
                          className="flex items-center gap-1.5 shrink-0 ml-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={handleLinkExternalTool}
                            className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_folder_open", "folder_open")}
                            </span>
                            <HoverTooltip title={t("lab_btn_change_tool", "Change Tool")} />
                          </button>
                          <button
                            type="button"
                            onClick={handleUnlinkExternalTool}
                            className="w-8 h-8 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_link_off", "link_off")}
                            </span>
                            <HoverTooltip title={t("nav_unlink", "Unlink")} variant="danger" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </div>
        </div>
      )}

      {activeTab === "BUILDER" && (() => {
        const BUILDER_PAGE_SIZE = 20;
        const totalBuilderPages = Math.max(
          1,
          Math.ceil(filteredBuilderCandidates.length / BUILDER_PAGE_SIZE)
        );
        const safeBuilderPage = Math.min(builderPage, totalBuilderPages);
        const pagedCandidates = filteredBuilderCandidates.slice(
          (safeBuilderPage - 1) * BUILDER_PAGE_SIZE,
          safeBuilderPage * BUILDER_PAGE_SIZE
        );
        const renderBenchModCard = (
          m: any,
          opts: {
            iconColorClass: string;
            onRemove: () => void;
            companionMods?: any[];
          }
        ) => {
          const itemExt = getModExtensionLabel(
            m,
            activeGameSchema,
            modList,
            opts.companionMods
          );
          const itemVer = getModVersionLabel(m, modList, opts.companionMods);
          const itemMeta =
            [
              itemExt,
              itemVer && itemVer !== "Local" ? `v${itemVer}` : "",
            ]
              .filter(Boolean)
              .join(" • ") || t("term_mod", "Mod");

          return (
            <div
              key={m.hash || m.name}
              className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0 ${opts.iconColorClass}`}
                >
                  <span className="material-symbols-outlined !text-[18px]">
                    {getModIcon(m, activeGameSchema, t)}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-black text-[var(--text)] truncate">
                    {getCleanModBaseName(m)}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--subtext)] truncate">
                    {itemMeta}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onOpenDossier && (
                  <button
                    type="button"
                    onClick={() => onOpenDossier(m)}
                    className="relative group/inspbtn w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_deployed_code", "deployed_code")}
                    </span>
                    <HoverTooltip
                      className="z-[100] !right-0 !translate-x-0 !left-auto"
                      title={t("inspect", "Inspect")}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={opts.onRemove}
                  className="w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-32">
            <CommandScreenBody>
              {/* LEFT PANE: VAULT MOD CATALOG */}
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("lab_vault_catalog_title", "{Vault} {Mods}")}
                    subtitle={t(
                      "lab_vault_catalog_subtitle",
                      "Select a {mod} to isolate and test in the sandbox"
                    )}
                    icon={t("icon_inventory_2", "inventory_2")}
                  />

                  {filteredBuilderCandidates.length === 0 ? (
                    <EmptyState
                      icon={
                        builderSearch || builderFilter !== "all"
                          ? t("icon_search_off", "search_off")
                          : t("icon_science", "science")
                      }
                      title={
                        builderSearch || builderFilter !== "all"
                          ? t("no_matches", "No matches found")
                          : t("shared_no_signatures", "No Signatures Found")
                      }
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 w-full">
                        {pagedCandidates.map((candidate: any, idx: number) => {
                          const isPrimaryStaged = Boolean(
                            activeLabMod &&
                              ((candidate.hash && activeLabMod.hash === candidate.hash) ||
                                (!candidate.hash && activeLabMod.name === candidate.name))
                          );
                          const isExtraStaged = Boolean(
                            candidate.hash && stagedExtras.some((e: any) => e.hash === candidate.hash)
                          );
                          const isConflictStaged = Boolean(
                            candidate.hash &&
                              ((conflictTarget && conflictTarget.hash === candidate.hash) ||
                                conflictExtras.some((e: any) => e.hash === candidate.hash))
                          );
                          const isAnyStaged = isPrimaryStaged || isExtraStaged || isConflictStaged;
                          const isTested = Boolean(
                            candidate?.hash && testedModHashes.has(candidate.hash)
                          );
                          const candExt = getModExtensionLabel(candidate, activeGameSchema, modList);
                          const candVer = getModVersionLabel(candidate, modList);
                          const candAuthor = candidate.author || candidate.master_author || "";
                          const candStatusLower = String(candidate?.status || "").toLowerCase();
                          const isFlagged =
                            candStatusLower.includes("unstable") ||
                            candStatusLower.includes("corrupted") ||
                            candStatusLower.includes("broken");

                          const cleanTitle = getCleanModBaseName(candidate);
                          const modIcon = getModIcon(candidate, activeGameSchema, t);
                          const metaParts = [
                            candAuthor ? getCleanModBaseName(candAuthor) : "",
                            candExt || "",
                            candVer && candVer !== "Local" ? `v${candVer}` : "",
                          ].filter(Boolean);

                          let chipIcon = t("icon_schedule", "schedule");
                          let chipIconColor = "text-[var(--subtext)]";
                          let chipLabel = t("lab_status_untested", "Untested");

                          if (isPrimaryStaged) {
                            chipIcon = t("icon_science", "science");
                            chipIconColor = "text-[var(--accent)]";
                            chipLabel = t("lab_role_primary", "Primary {Mod}");
                          } else if (isExtraStaged) {
                            chipIcon = t("icon_hub", "hub");
                            chipIconColor = "text-[var(--accent)]";
                            chipLabel = t("lab_role_dependency", "Dependency");
                          } else if (isConflictStaged) {
                            chipIcon = t("icon_compare_arrows", "compare_arrows");
                            chipIconColor = "text-[var(--warning)]";
                            chipLabel = t("lab_role_conflict", "Conflict Check");
                          } else if (isFlagged) {
                            chipIcon = t("icon_warning", "warning");
                            chipIconColor = "text-[var(--warning)]";
                            chipLabel = t("label_unstable", "Unstable");
                          } else if (isTested) {
                            chipIcon = t("icon_check_circle", "check_circle");
                            chipIconColor = "text-[var(--success)]";
                            chipLabel = t("lab_status_tested", "Tested");
                          }

                          return (
                            <div
                              key={candidate.hash || `${candidate.name}-${idx}`}
                              onClick={() => {
                                memoryDismissedRef.current = false;
                                if (!isPrimaryStaged) {
                                  setActiveLabMod(candidate);
                                  if (isConflictStaged && conflictTarget?.hash === candidate.hash) {
                                    setConflictTarget(null);
                                  }
                                }
                              }}
                              onContextMenu={(e) => {
                                const menuItems: SanctuaryContextMenuItem[] = [
                                  {
                                    label: t("select", "Select"),
                                    icon: t("icon_science", "science"),
                                    variant: "accent",
                                    onClick: () => {
                                      memoryDismissedRef.current = false;
                                      setActiveLabMod(candidate);
                                    },
                                  },
                                ];
                                if (activeLabMod && !isPrimaryStaged) {
                                  menuItems.push({
                                    label: isExtraStaged
                                      ? t("remove", "Remove")
                                      : t("lab_add_as_dep", "Add as Dependency"),
                                    icon: isExtraStaged
                                      ? t("icon_close", "close")
                                      : t("icon_hub", "hub"),
                                    onClick: () => {
                                      if (isExtraStaged) {
                                        setStagedExtras(
                                          stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                        );
                                      } else {
                                        setStagedExtras([...stagedExtras, candidate]);
                                      }
                                    },
                                  });
                                  menuItems.push({
                                    label: isConflictStaged
                                      ? t("remove", "Remove")
                                      : t("lab_set_as_conflict", "Test Conflict Against"),
                                    icon: isConflictStaged
                                      ? t("icon_close", "close")
                                      : t("icon_compare_arrows", "compare_arrows"),
                                    onClick: () => {
                                      if (isConflictStaged) {
                                        if (conflictTarget?.hash === candidate.hash) {
                                          setConflictTarget(null);
                                        }
                                        setConflictExtras(
                                          conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                        );
                                      } else {
                                        setConflictTarget(candidate);
                                      }
                                    },
                                  });
                                }
                                if (onOpenDossier) {
                                  menuItems.push({
                                    label: t("inspect", "Inspect"),
                                    icon: t("icon_deployed_code", "deployed_code"),
                                    dividerBefore: true,
                                    onClick: () => onOpenDossier(candidate),
                                  });
                                }
                                openSanctuaryContextMenu(e, menuItems);
                              }}
                              className={`glass-panel rounded-2xl p-3.5 border transition-all duration-200 flex flex-col justify-between gap-3 cursor-pointer group ${
                                isPrimaryStaged
                                  ? "sa-card-selected border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                                  : isAnyStaged
                                    ? "border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                              }`}
                            >
                              {/* Top Tier: Icon Well + Clean Mod Title & Metadata */}
                              <div className="flex items-center gap-3 min-w-0 w-full">
                                <div
                                  className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                                    isAnyStaged ? "text-[var(--accent)]" : "text-[var(--text)]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined !text-[20px]">
                                    {modIcon}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
                                    <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                                      {cleanTitle}
                                    </span>
                                    <HoverTooltip
                                      className="z-[100]"
                                      title={cleanTitle}
                                      icon={modIcon}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0 truncate opacity-85">
                                    <span className="truncate">
                                      {metaParts.join(" • ") || t("term_mod", "Mod")}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Bar: Neutral VAULT_CHIP_CLASS Status on Left | Clear Contextual Actions on Right */}
                              <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className={`material-symbols-outlined !text-[12px] shrink-0 ${chipIconColor}`}>
                                    {chipIcon}
                                  </span>
                                  <span>{chipLabel}</span>
                                </span>

                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                  {!activeLabMod ? (
                                    <span className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center gap-1 transition-all">
                                      <span>{t("select", "Select")}</span>
                                      <span className="material-symbols-outlined !text-[13px]">
                                        {t("icon_arrow_forward", "arrow_forward")}
                                      </span>
                                    </span>
                                  ) : isPrimaryStaged ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abortLab();
                                      }}
                                      className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined !text-[13px]">
                                        {t("icon_close", "close")}
                                      </span>
                                      <span>{t("clear", "Clear")}</span>
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isExtraStaged) {
                                            setStagedExtras(
                                              stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                          } else {
                                            if (conflictTarget?.hash === candidate.hash) {
                                              setConflictTarget(null);
                                            }
                                            setConflictExtras(
                                              conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                            setStagedExtras([...stagedExtras, candidate]);
                                          }
                                        }}
                                        className={`relative group/depbtn h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                          isExtraStaged
                                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                        }`}
                                      >
                                        <span
                                          className={`material-symbols-outlined !text-[13px] ${
                                            isExtraStaged ? "text-[var(--accent)]" : ""
                                          }`}
                                        >
                                          {isExtraStaged
                                            ? t("icon_check", "check")
                                            : t("icon_hub", "hub")}
                                        </span>
                                        <span>{t("lab_btn_dep_short", "Dep")}</span>
                                        <HoverTooltip
                                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                                          title={
                                            isExtraStaged
                                              ? t("remove", "Remove")
                                              : t("lab_add_as_dep", "Add as Dependency")
                                          }
                                          icon={t("icon_hub", "hub")}
                                        />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isConflictStaged) {
                                            if (conflictTarget?.hash === candidate.hash) {
                                              setConflictTarget(null);
                                            }
                                            setConflictExtras(
                                              conflictExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                          } else {
                                            setStagedExtras(
                                              stagedExtras.filter((x: any) => x.hash !== candidate.hash)
                                            );
                                            setConflictTarget(candidate);
                                          }
                                        }}
                                        className={`relative group/vsbtn h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                          isConflictStaged
                                            ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--text)]"
                                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                        }`}
                                      >
                                        <span
                                          className={`material-symbols-outlined !text-[13px] ${
                                            isConflictStaged ? "text-[var(--warning)]" : ""
                                          }`}
                                        >
                                          {isConflictStaged
                                            ? t("icon_check", "check")
                                            : t("icon_compare_arrows", "compare_arrows")}
                                        </span>
                                        <span>{t("vs", "vs")}</span>
                                        <HoverTooltip
                                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                                          title={
                                            isConflictStaged
                                              ? t("remove", "Remove")
                                              : t("lab_set_as_conflict", "Test Conflict Against")
                                          }
                                          icon={t("icon_compare_arrows", "compare_arrows")}
                                        />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {totalBuilderPages > 1 && (
                        <div className="flex items-center justify-center gap-3 pt-2 select-none">
                          <button
                            type="button"
                            disabled={safeBuilderPage === 1}
                            onClick={() => setBuilderPage((p) => Math.max(1, p - 1))}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_chevron_left", "chevron_left")}
                            </span>
                            <span>{t("prev", "Prev")}</span>
                          </button>

                          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-black text-[var(--subtext)] font-mono">
                            <span className="text-[var(--accent)]">{safeBuilderPage}</span>
                            <span className="opacity-40">/</span>
                            <span>{totalBuilderPages}</span>
                          </div>

                          <button
                            type="button"
                            disabled={safeBuilderPage >= totalBuilderPages}
                            onClick={() => setBuilderPage((p) => Math.min(totalBuilderPages, p + 1))}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                          >
                            <span>{t("next", "Next")}</span>
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_chevron_right", "chevron_right")}
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CommandScreenMain>

              {/* RIGHT PANE: STICKY ACTIVE TEST BENCH */}
              <div className="w-full lg:w-[400px] xl:w-[420px] shrink-0 lg:sticky lg:top-4 self-start flex flex-col gap-4">
                <CommandScreenSectionHeading
                  title={t("lab_test_bench_title", "Active Test Bench")}
                  subtitle={t(
                    "lab_test_bench_subtitle",
                    "Configure dependencies, conflicts, and sandbox safeguards"
                  )}
                  icon={t("icon_science", "science")}
                />

                <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                  {/* STEP 1: PRIMARY MOD */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_science", "science")}
                        </span>
                        <span>{t("lab_slot_primary_title", "1. Primary {Mod}")}</span>
                      </span>
                      {activeLabMod && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                          <span>{t("selected", "Selected")}</span>
                        </span>
                      )}
                    </div>

                    {!activeLabMod ? (
                      <div className="rounded-xl p-5 glass-surface border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-10 h-10 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)] flex items-center justify-center">
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_science", "science")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)]">
                          {t("lab_empty_primary_title", "Select a {Mod} to Test")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0 max-w-[280px]">
                          {t(
                            "lab_empty_primary_desc",
                            "Pick any {mod} from the catalog on the left to load it into an isolated test session."
                          )}
                        </p>
                      </div>
                    ) : (
                      renderBenchModCard(activeLabMod, {
                        iconColorClass: "text-[var(--accent)]",
                        onRemove: abortLab,
                        companionMods: stagedExtras,
                      })
                    )}

                    {activeLabMod && missingDeps.length > 0 && (
                      <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text)]">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">
                            {t("icon_warning", "warning")}
                          </span>
                          <span>{t("missing_deps", "Missing Dependencies")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {missingDeps.map((depObj, idx) => {
                            const depName =
                              typeof depObj === "string"
                                ? depObj
                                : depObj.displayName || depObj.name || t("unknown", "Unknown");
                            const depId = typeof depObj === "string" ? null : depObj.id;
                            return (
                              <button
                                key={depId || idx}
                                type="button"
                                onClick={async () => {
                                  if (!onOpenDossier) return;
                                  let data = null;
                                  if (depId) {
                                    const { data: d } = await supabase
                                      .from("mods")
                                      .select("*")
                                      .eq("id", depId)
                                      .eq("compliance_tier", 0)
                                      .in("status", ["stable", "unstable", "corrupted", "pending"])
                                      .single();
                                    data = d;
                                  } else {
                                    const searchTerms = depName
                                      .split(" ")
                                      .map((term: string) => term.trim())
                                      .filter(Boolean)
                                      .join("%");
                                    const { data: d } = await supabase
                                      .from("mods")
                                      .select("*")
                                      .ilike("name", `%${searchTerms}%`)
                                      .eq("compliance_tier", 0)
                                      .in("status", ["stable", "unstable", "corrupted", "pending"])
                                      .limit(1)
                                      .maybeSingle();
                                    data = d;
                                  }
                                  if (data) {
                                    onOpenDossier({ ...data, isNexusView: true });
                                  } else {
                                    onOpenDossier({
                                      name: depName,
                                      displayName: depName,
                                      isNexusView: true,
                                    });
                                  }
                                }}
                                className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] cursor-pointer transition-colors`}
                              >
                                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                                  {t("icon_warning", "warning")}
                                </span>
                                <span>{getCleanModBaseName(depName)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2: DEPENDENCIES */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_hub", "hub")}
                        </span>
                        <span>{t("lab_slot_deps_title", "2. Dependencies")}</span>
                      </span>
                      <span className={VAULT_CHIP_CLASS}>
                        <span>{stagedExtras.length}</span>
                      </span>
                    </div>

                    <ModSearchDropdown
                      modList={builderSymbioticMods}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        if (m && !stagedExtras.find((e: any) => e.hash === m.hash)) {
                          setStagedExtras([...stagedExtras, m]);
                        }
                      }}
                      onClear={() => {}}
                      placeholder={t("add_extra", "Add extra dependency...")}
                    />

                    {stagedExtras.length > 0 ? (
                      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                        {stagedExtras.map((m: any) =>
                          renderBenchModCard(m, {
                            iconColorClass: "text-[var(--accent)]",
                            onRemove: () =>
                              setStagedExtras(
                                stagedExtras.filter((x: any) => x.hash !== m.hash)
                              ),
                            companionMods: activeLabMod ? [activeLabMod] : undefined,
                          })
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-[var(--subtext)] opacity-75 px-0.5">
                        {t(
                          "lab_builder_no_deps_hint",
                          "No extra dependencies staged — only the primary {mod} will load."
                        )}
                      </span>
                    )}
                  </div>

                  {/* STEP 3: OPTIONAL CONFLICT CHECK */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                          {t("icon_compare_arrows", "compare_arrows")}
                        </span>
                        <span>{t("lab_slot_conflict_title", "3. Conflict Check")}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-65">
                        {t("lab_optional_label", "Optional")}
                      </span>
                    </div>

                    {!conflictTarget ? (
                      <ModSearchDropdown
                        modList={builderPrimaryAdversaryMods}
                        selectedItem={conflictTarget}
                        onSelect={setConflictTarget}
                        onClear={() => setConflictTarget(null)}
                        placeholder={t(
                          "lab_conflict_ph",
                          "Test compatibility against another {mod}..."
                        )}
                      />
                    ) : (
                      <ModSearchDropdown
                        modList={builderExtraAdversaryMods}
                        selectedItem={null}
                        onSelect={(m: any) => {
                          if (m && !conflictExtras.find((e: any) => e.hash === m.hash)) {
                            setConflictExtras([...conflictExtras, m]);
                          }
                        }}
                        onClear={() => {}}
                        placeholder={t("add_extra", "Add extra dependency...")}
                      />
                    )}

                    {conflictTarget && (
                      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                        {renderBenchModCard(conflictTarget, {
                          iconColorClass: "text-[var(--warning)]",
                          onRemove: () => {
                            setConflictTarget(null);
                            setConflictExtras([]);
                          },
                          companionMods: conflictExtras,
                        })}

                        {conflictExtras.map((m: any) =>
                          renderBenchModCard(m, {
                            iconColorClass: "text-[var(--subtext)]",
                            onRemove: () =>
                              setConflictExtras(
                                conflictExtras.filter((x: any) => x.hash !== m.hash)
                              ),
                            companionMods: conflictTarget ? [conflictTarget] : undefined,
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* SANDBOX SAFEGUARDS STRIP */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <button
                      type="button"
                      onClick={() => setShowTestSaveModal(true)}
                      className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex items-center gap-2 text-left transition-colors cursor-pointer min-w-0"
                    >
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          testSaveStatus?.has_test_save
                            ? "text-[var(--accent)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {t("icon_save", "save")}
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                          {t("lab_bench_save_label", "Test Save")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {testSaveStatus?.active_test_save?.file_name ||
                            t("lab_test_save_btn_setup", "Set Up Test Save")}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAirgap(!airgapStatus.active)}
                      className="glass-surface rounded-xl p-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] flex items-center gap-2 text-left transition-colors cursor-pointer min-w-0"
                    >
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          airgapStatus.active ? "text-[var(--success)]" : "text-[var(--subtext)]"
                        }`}
                      >
                        {t("icon_shield_lock", "shield_lock")}
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] truncate">
                          {t("lab_save_airgap_title", "Save Airgap Shield")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {airgapStatus.active
                            ? t("enabled", "Enabled")
                            : t("lab_airgap_auto_on_run", "Auto on Launch")}
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* PRIMARY LAUNCH CTA */}
                  <div className="flex flex-col gap-2 pt-1">
                    {!shelterActive ? (
                      <>
                        <div className="flex items-center gap-2 w-full">
                          <button
                            type="button"
                            disabled={!activeLabMod}
                            onClick={() => runCombinedHotSwap()}
                            className="flex-1 py-3 px-4 rounded-xl glass-surface sa-glass-pill-active text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <span className="material-symbols-outlined !text-[17px] text-[var(--accent)]">
                              {t("icon_bolt", "bolt")}
                            </span>
                            <span>{t("btn_initiate_swap", "Conduct Experiment")}</span>
                          </button>

                          {activeLabMod && (
                            <button
                              type="button"
                              onClick={abortLab}
                              className="py-3 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-xs font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_restart_alt", "restart_alt")}
                              </span>
                              <span>{t("clear", "Clear")}</span>
                            </button>
                          )}
                        </div>
                        {linkedTool && activeLabMod && (
                          <button
                            type="button"
                            onClick={() => runCombinedHotSwap(linkedTool.path)}
                            className="w-full py-2.5 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                              {t("icon_build_circle", "build_circle")}
                            </span>
                            <span className="truncate">
                              {`${t("lab_btn_launch_tool", "Launch Linked Tool")} (${linkedTool.name})`}
                            </span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTestPanel(true)}
                        className="w-full py-3 px-4 rounded-xl glass-surface sa-glass-pill-success text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[17px] text-[var(--success)]">
                          {t("icon_science", "science")}
                        </span>
                        <span>{t("btn_view_test", "View Active Test")}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CommandScreenBody>
          </div>
        );
      })()}

      {activeTab === "REPORTS" && (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full h-full min-h-[500px]">
          <CommandScreenSectionHeading
            title={t("tab_lab_reports", "Lab Reports")}
            subtitle={t(
              "lab_reports_section_sub",
              "Session logs, crash diagnostics, and sandbox verification results"
            )}
            icon={t("icon_terminal", "terminal")}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-32">
            {filteredReports.map((report: any) => {
              const isError = Boolean(report.errorFound);
              const cardReportNum = resolveLabReportNumber(report, reportsToList);
              const resolvedCardMod = resolveRealReportMod(
                report.mod,
                report.stagedExtras,
                modList
              );
              const modVer = getModVersionLabel(
                resolvedCardMod,
                modList,
                report.stagedExtras
              );
              const modExt = getModExtensionLabel(
                resolvedCardMod,
                activeGameSchema,
                modList,
                report.stagedExtras
              );
              return (
                <UniversalCard
                  key={report.id}
                  layout="vertical"
                  onClick={() => setSelectedReport(report)}
                  onContextMenu={(e) => {
                    const menuItems: SanctuaryContextMenuItem[] = [
                      {
                        label: t("view_details", "View Details"),
                        icon: t("icon_visibility", "visibility"),
                        onClick: () => setSelectedReport(report),
                      },
                    ];
                    if (resolvedCardMod && onOpenDossier) {
                      menuItems.push({
                        label: t("inspect", "Inspect"),
                        icon: t("icon_deployed_code", "deployed_code"),
                        onClick: () => onOpenDossier(resolvedCardMod),
                      });
                    }
                    if (resolvedCardMod) {
                      menuItems.push({
                        label: t("tab_env_builder", "Environment Builder"),
                        icon: t("icon_science", "science"),
                        onClick: () => {
                          setActiveLabMod(resolvedCardMod);
                          setStagedExtras(Array.isArray(report.stagedExtras) ? report.stagedExtras : []);
                          setConflictTarget(report.conflictTarget || null);
                          setConflictExtras(Array.isArray(report.conflictExtras) ? report.conflictExtras : []);
                          setActiveTab("BUILDER");
                        },
                      });
                    }
                    if (report.logSnippet) {
                      menuItems.push({
                        label: t("copy_log", "Copy Log"),
                        icon: t("icon_content_copy", "content_copy"),
                        dividerBefore: true,
                        onClick: () => navigator.clipboard?.writeText(String(report.logSnippet)),
                      });
                    }
                    if (isError && submitLabReport) {
                      menuItems.push({
                        label: t("lab_action_submit_diag_title", "Submit To Diagnostics"),
                        icon: t("icon_send", "send"),
                        variant: "warning",
                        dividerBefore: !report.logSnippet,
                        onClick: () => {
                          submitLabReport(report);
                        },
                      });
                    }
                    openSanctuaryContextMenu(e, menuItems);
                  }}
                  icon={isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                  title={getCleanModBaseName(resolvedCardMod)}
                  subtitle={
                    report.conflictTarget
                      ? `${t("vs", "vs")} ${getCleanModBaseName(report.conflictTarget)}`
                      : t("target_engine_core", "Target: Engine Core Only")
                  }
                  imageOverlay={
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-20 pointer-events-none">
                      <span className={VAULT_CHIP_CLASS}>
                        <span
                          className={`material-symbols-outlined !text-[12px] ${isError ? "text-[var(--danger)]" : "text-[var(--success)]"
                            }`}
                        >
                          {isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                        </span>
                        <span>
                          {isError
                            ? t("fatal_collision", "Fatal Collision")
                            : t("successful_injection", "Successful Injection")}
                        </span>
                      </span>
                    </div>
                  }
                  badges={
                    <>
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_terminal", "terminal")}
                        </span>
                        <span className="font-mono">
                          {`Lab_Report_${cardReportNum}`}
                        </span>
                      </span>
                      {modExt && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                            {t("icon_deployed_code", "deployed_code")}
                          </span>
                          <span>{modExt}</span>
                        </span>
                      )}
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t("icon_sell", "sell")}
                        </span>
                        <span>
                          {modVer ? `v${modVer}` : selectedVersion || t("unknown", "Unknown")}
                        </span>
                      </span>
                    </>
                  }
                  footer={
                    <div className="flex items-center justify-between w-full">
                      {report.isConcluding ? (
                        <span className="text-[10px] font-black text-amber-400 animate-pulse truncate">
                          {t("status_pending_review", "Pending Review")}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
                          {new Date(report.time).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          &bull;{" "}
                          {new Date(report.time).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        {t("view_details", "View Details")}
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    </div>
                  }
                />
              );
            })}

            {filteredReports.length === 0 && (
              <EmptyState
                icon={t("icon_terminal", "terminal")}
                title={t("lab_reports_empty", "No Reports Generated Yet")}
                subtitle={t("lab_reports_empty_desc", "Run a test in the Environment Builder to generate a report.")}
                className="col-span-full py-16"
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "KNOWN_ERRORS" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-32">
          <KnownErrorRulesManager
            searchQuery={knownErrorSearch}
            onClearSearch={() => {
              setKnownErrorSearch("");
              setKnownErrorFilter("all");
              setKnownErrorLabBehavior("all");
              setKnownErrorFileHint("all");
            }}
            canEdit={false}
            severityFilter={knownErrorFilter}
            onSeverityFilterChange={setKnownErrorFilter}
            labBehaviorFilter={knownErrorLabBehavior}
            fileHintFilter={knownErrorFileHint}
            sortBy={knownErrorSort}
          />
        </div>
      )}

      {selectedReport &&
        (() => {
          const isError = selectedReport.errorFound;
          const reportNum = resolveLabReportNumber(selectedReport, reportsToList);
          const rawLogData = scrubLogUserData(selectedReport.logSnippet || "");
          const matchedRules = matchExceptionRules(rawLogData, exceptionRules || []);
          const resolvedLoadout = extractReportLoadoutFromLogAndContext({
            targetMod: selectedReport.mod,
            logText: rawLogData,
            explicitDependencies: selectedReport.stagedExtras,
            explicitConflictTarget: selectedReport.conflictTarget,
            explicitConflictExtras: selectedReport.conflictExtras,
            linkedFiles: selectedReport.linkedFiles || labSessionStatus?.linked_files || [],
            modList,
            activeGameSchema,
          });
          const reportStagedDeps = resolvedLoadout.dependencies;
          const resolvedConflictTarget = resolvedLoadout.conflictTarget;
          const resolvedConflictExtras = resolvedLoadout.conflictExtras;
          const resolvedTargetMod = resolveRealReportMod(
            selectedReport.mod,
            reportStagedDeps,
            modList
          );
          const reportConflicts = [
            ...(resolvedConflictTarget ? [resolvedConflictTarget] : []),
            ...(resolvedConflictExtras || []),
          ];

          const formattedLabReportText = buildFormattedLabReportText({
            reportNumber: reportNum,
            date: selectedReport.time
              ? new Date(selectedReport.time).toLocaleString()
              : new Date().toLocaleString(),
            gameVersion: selectedVersion || "Local",
            targetMod: resolvedTargetMod,
            conflictTarget: resolvedConflictTarget,
            stagedExtras: reportStagedDeps,
            conflictExtras: resolvedConflictExtras,
            missingDeps: selectedReport.missingDeps || missingDeps,
            linkedFiles: selectedReport.linkedFiles || labSessionStatus?.linked_files || [],
            matchedRules,
            rawLogText: rawLogData,
            errorFound: Boolean(isError),
            verified: Boolean(selectedReport.verified),
            activeGameSchema,
            modList,
          });

          const realLogDisplayContent = formatHumanReadableLogText(
            liveRealLogs.length > 0
              ? liveRealLogs
                .map(
                  (l) =>
                    `// === FILE: ${l.fileName || l.file_name} ===\n${scrubLogUserData(l.content)}`
                )
                .join("\n\n")
              : extractCleanRealLogContent(rawLogData)
          );

          const hasRealLogContent = Boolean(
            liveRealLogs.length > 0 || rawLogData.trim().length > 0
          );

          const canSecureReport = Boolean(
            selectedReport.isConcluding ||
            shelterActive ||
            lastConcludingReport?.id === selectedReport.id ||
            secureCardState !== "idle"
          );

          const realLogFileName =
            liveRealLogs[0]?.fileName ||
            liveRealLogs[0]?.file_name ||
            resolveDefaultRealLogName(activeGameSchema);

          const activeLogTextToCopy =
            reportLogViewTab === "REAL_LOG"
              ? realLogDisplayContent || ""
              : formattedLabReportText || formatHumanReadableLogText(rawLogData) || "";

          const isReportRestrictedFromCloud = [
            resolvedTargetMod,
            ...(reportStagedDeps || []),
            ...(reportConflicts || []),
          ]
            .filter(Boolean)
            .some(
              (m: any) =>
                (Number(m.compliance_tier || 0) >= 1 && Number(m.compliance_tier || 0) <= 4) ||
                !m.isSynced ||
                !m.dbId ||
                String(m.status || "").toLowerCase() === "unverified"
            );

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setSelectedReport(null)}
              title={<span className="normal-case font-mono">{`Lab_Report_${reportNum}`}</span>}
              subtitle={`${isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection")} • ${t("tab_lab_reports", "Lab Reports")}`}
              icon={isError ? t("icon_warning", "warning") : t("icon_science", "science")}
              iconColorClass={
                isError ? "text-[var(--danger)]" : "text-[var(--success)]"
              }
              widthClass="w-[90vw] md:w-[820px]"
              headerActions={
                <PanelHeaderGroup>
                  {isError && submitLabReport && !isReportRestrictedFromCloud && (
                    <PanelHeaderButton
                      icon={
                        submitCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : submitCardState === "working"
                            ? t("icon_sync", "sync")
                            : t("icon_send", "send")
                      }
                      variant={submitCardState === "done" ? "success" : "warning"}
                      disabled={
                        isSubmittingReport ||
                        submitCardState === "working" ||
                        submitCardState === "done"
                      }
                      tooltip={
                        submitCardState === "done"
                          ? (t("lab_action_submit_diag_done_title", "Submitted To Architect Lab") as string)
                          : (t("lab_action_submit_diag_title", "Submit To Diagnostics") as string)
                      }
                      onClick={async () => {
                        if (submitCardState === "working" || submitCardState === "done") return;
                        setSubmitCardState("working");
                        const ok = await submitLabReport({
                          ...selectedReport,
                          stagedExtras: reportStagedDeps,
                          conflictTarget: resolvedConflictTarget,
                          conflictExtras: resolvedConflictExtras,
                        });
                        setSubmitCardState(ok ? "done" : "error");
                      }}
                    />
                  )}
                  <PanelHeaderButton
                    icon={
                      downloadCardState === "done"
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_download", "download")
                    }
                    variant={downloadCardState === "done" ? "success" : "accent"}
                    tooltip={
                      downloadCardState === "done"
                        ? (t("lab_action_download_done_title", "Report Saved Locally") as string)
                        : (t("lab_action_download_title", "Download Report") as string)
                    }
                    onClick={handleExportLogs}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 w-full pb-8">
                <SidePanelHeroCard
                  title={getCleanModBaseName(resolvedTargetMod)}
                  subtitle={`${getModExtensionLabel(
                    resolvedTargetMod,
                    activeGameSchema,
                    modList,
                    reportStagedDeps
                  )} • v${getModVersionLabel(resolvedTargetMod, modList, reportStagedDeps)}`}
                  label={t("subject_isolation", "Subject Isolation")}
                  icon={isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                  variant={isError ? "danger" : "success"}
                  badges={[
                    {
                      icon: isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle"),
                      label: isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection"),
                      colorClass: isError
                        ? "text-[var(--danger)]"
                        : "text-[var(--success)]",
                    },
                  ]}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                    <StatBox
                      icon={t("icon_sell", "sell")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("game_version", "Game Version")}
                      value={selectedVersion || t("unknown", "Unknown")}
                    />
                    <StatBox
                      icon={t("icon_memory", "memory")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("mod_version", "{Mod} Version")}
                      value={getModVersionLabel(resolvedTargetMod, modList, reportStagedDeps)}
                    />
                    <StatBox
                      icon={t("icon_schedule", "schedule")}
                      iconColorClass="text-[var(--accent)]"
                      label={t("date_created", "Time")}
                      tooltipSubtitle={new Date(selectedReport.time).toLocaleString()}
                      value={
                        <span className="text-xs md:text-sm font-black tracking-tight">
                          {new Date(selectedReport.time).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          &bull;{" "}
                          {new Date(selectedReport.time).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                    {resolvedTargetMod && onOpenDossier && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_deployed_code", "deployed_code")}
                        label={t("inspect", "Inspect")}
                        onClick={() => onOpenDossier(resolvedTargetMod)}
                      />
                    )}
                    {resolvedTargetMod && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_science", "science")}
                        label={t("tab_env_builder", "Environment Builder")}
                        onClick={() => {
                          if (setActiveLabMod) setActiveLabMod(resolvedTargetMod);
                          setStagedExtras(Array.isArray(reportStagedDeps) ? reportStagedDeps : []);
                          if (setConflictTarget) setConflictTarget(resolvedConflictTarget || null);
                          setConflictExtras(
                            Array.isArray(resolvedConflictExtras) ? resolvedConflictExtras : []
                          );
                          setSelectedReport(null);
                          setActiveTab("BUILDER");
                        }}
                      />
                    )}
                    <ActionButton
                      variant={downloadCardState === "done" ? "success" : "accent"}
                      icon={
                        downloadCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_download", "download")
                      }
                      label={
                        downloadCardState === "done"
                          ? t("lab_action_download_done_title", "Report Saved Locally")
                          : t("lab_action_download_title", "Download Report")
                      }
                      onClick={handleExportLogs}
                    />
                  </div>
                </SidePanelHeroCard>
                {canSecureReport && (
                  <button
                    type="button"
                    onClick={handleConcludeTest}
                    disabled={secureCardState === "working" || secureCardState === "done"}
                    className={`text-left glass-panel rounded-2xl p-3.5 border transition-all flex items-start gap-3 group cursor-pointer shadow-sm disabled:cursor-default ${secureCardState === "done"
                      ? "sa-glass-pill-active"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                      }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] ${secureCardState === "done"
                        ? "text-[var(--success)]"
                        : isError
                          ? "text-[var(--danger)]"
                          : "text-[var(--success)]"
                        }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[18px] ${secureCardState === "working" ? "animate-spin" : ""
                          }`}
                      >
                        {secureCardState === "done"
                          ? t("icon_check_circle", "check_circle")
                          : secureCardState === "working"
                            ? t("icon_sync", "sync")
                            : isError
                              ? t("icon_shield", "shield")
                              : t("icon_verified_user", "verified_user")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                          {secureCardState === "done"
                            ? isError
                              ? t("lab_action_secure_broken_done_title", "Removed From {Blueprint} & Secured")
                              : t("lab_action_secure_verified_done_title", "{Mod} Verified & Secured")
                            : secureCardState === "working"
                              ? t("lab_action_securing_title", "Securing Sandbox...")
                              : isError
                                ? t("lab_action_secure_broken_title", "Secure Corrupted Artifact")
                                : t("lab_action_secure_verified_title", "Secure Verified Artifact")}
                        </span>
                        <span
                          className={`material-symbols-outlined !text-[15px] transition-all ${secureCardState === "done"
                            ? "text-[var(--success)] opacity-100"
                            : "text-[var(--subtext)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5"
                            }`}
                        >
                          {secureCardState === "done"
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--subtext)] leading-snug">
                        {secureCardState === "done"
                          ? isError
                            ? t("lab_action_secure_broken_done_desc", "Live saves restored and corrupted {mod} unequipped from active {Blueprint}.")
                            : t(
                              "lab_action_secure_verified_done_desc",
                              "Sandbox closed, live saves restored, and mod signed off as verified."
                            )
                          : isError
                            ? t("lab_action_secure_broken_desc", "Conclude test, mark {mod} as broken, and restore your live {blueprint} & saves")
                            : t("lab_action_secure_verified_desc", "Conclude test, mark {mod} as verified, and restore your live {blueprint} & saves")}
                      </p>
                    </div>
                  </button>
                )}

                {/* Dependencies & Conflicts Loaded for Test (Side-by-Side Cards with Full-Width Rows) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          {t("icon_extension", "extension")}
                        </span>
                        {t("lab_report_deps_loaded_title", "Dependencies Loaded for Test")}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)]">
                        {reportStagedDeps.length}
                      </span>
                    </div>
                    {reportStagedDeps.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {reportStagedDeps.map((m: any) => (
                          <div
                            key={m.hash || m.name}
                            className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                {t("icon_extension", "extension")}
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(m)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] shrink-0">
                              {getModExtensionLabel(m, activeGameSchema, modList, reportStagedDeps)}{" "}
                              &bull; v{getModVersionLabel(m, modList, reportStagedDeps)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-60">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                          {t("icon_warning", "warning")}
                        </span>
                        {t("lab_report_conflicts_loaded_title", "Conflicts Loaded for Test")}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--subtext)]">
                        {reportConflicts.length}
                      </span>
                    </div>
                    {reportConflicts.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {resolvedConflictTarget && (
                          <div className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] shrink-0">
                                {t("icon_warning", "warning")}
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(resolvedConflictTarget)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] shrink-0">
                              {getModExtensionLabel(
                                resolvedConflictTarget,
                                activeGameSchema,
                                modList
                              )}{" "}
                              &bull; v
                              {getModVersionLabel(resolvedConflictTarget, modList)}
                            </span>
                          </div>
                        )}
                        {resolvedConflictExtras?.map((m: any) => (
                          <div
                            key={m.hash || m.name}
                            className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--warning)] shrink-0">
                                {t("icon_extension", "extension")}
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(m)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] shrink-0">
                              {getModExtensionLabel(m, activeGameSchema, modList)} &bull; v
                              {getModVersionLabel(m, modList)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-60">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Community Known Error Diagnosis & Spoke Rules */}
                {(isError || rawLogData) && (
                  <KnownErrorDiagnosisBanner
                    logText={rawLogData}
                    canEdit={false}
                    reportFailed={Boolean(isError)}
                  />
                )}

                {/* 2-Column StatTile Log Switcher */}
                {hasRealLogContent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={
                        <span className="material-symbols-outlined">
                          {t("icon_description", "description")}
                        </span>
                      }
                      label={t("lab_report_tab_lab_log", "Lab Report Log")}
                      number={`Lab_Report_${reportNum}.txt`}
                      isActive={reportLogViewTab === "LAB_REPORT"}
                      onClick={() => setReportLogViewTab("LAB_REPORT")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={
                        <span className="material-symbols-outlined">
                          {t("icon_terminal", "terminal")}
                        </span>
                      }
                      label={t("lab_report_tab_real_log", "Real Game Log (Scrubbed)")}
                      number={realLogFileName}
                      isActive={reportLogViewTab === "REAL_LOG"}
                      onClick={() => setReportLogViewTab("REAL_LOG")}
                    />
                  </div>
                )}

                {/* Log Terminal Card */}
                <div className="flex-1 min-h-[420px] glass-panel backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shadow-inner relative flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">
                        {reportLogViewTab === "REAL_LOG"
                          ? t("icon_terminal", "terminal")
                          : t("icon_description", "description")}
                      </span>
                      <span className="text-xs font-black font-mono text-[var(--text)]">
                        {reportLogViewTab === "REAL_LOG"
                          ? realLogFileName
                          : `Lab_Report_${reportNum}.txt`}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 flex-wrap ml-auto">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                          {t("icon_verified_user", "verified_user")}
                        </span>
                        <span>{t("lab_report_pii_scrubbed_badge", "User Data Scrubbed")}</span>
                      </span>

                      <PanelHeaderGroup>
                        <PanelHeaderButton
                          icon={
                            copiedLogState
                              ? t("icon_check", "check")
                              : t("icon_content_copy", "content_copy")
                          }
                          label={
                            copiedLogState
                              ? t("copied", "Copied")
                              : t("lab_report_copy_btn", "Copy Log")
                          }
                          variant={copiedLogState ? "success" : "default"}
                          onClick={() => {
                            if (!activeLogTextToCopy) return;
                            navigator.clipboard?.writeText(activeLogTextToCopy);
                            setCopiedLogState(true);
                            setTimeout(() => setCopiedLogState(false), 1800);
                          }}
                        />
                      </PanelHeaderGroup>
                    </div>
                  </div>

                  <pre className="p-5 font-mono text-[12px] text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed flex-1 overflow-y-auto custom-scrollbar opacity-90">
                    {reportLogViewTab === "REAL_LOG"
                      ? realLogDisplayContent || t("no_logs", "No logs available for this session. System reports standard exit code.")
                      : formattedLabReportText || formatHumanReadableLogText(rawLogData) || t("no_logs", "No logs available for this session. System reports standard exit code.")}
                  </pre>
                </div>
              </div>
            </SidePanel>
          );
        })()}

      {showTestPanel && (
        <SidePanel
          isOpen={showTestPanel}
          onClose={() => setShowTestPanel(false)}
          title={t("test_underway_title", "Experiment Underway")}
          subtitle={t("test_underway_desc", "Monitoring simulation for anomalies...")}
          icon={t("icon_science", "science")}
          iconColorClass="text-[var(--accent)]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_science", "science")}
                tooltip={t("btn_conclude_experiment", "Conclude Experiment")}
                onClick={() => {
                  handleConcludeTest();
                  setShowTestPanel(false);
                }}
                variant="success"
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col items-center justify-start gap-4 opacity-95 p-2 w-full">
            <SidePanelHeroCard
              title={getModName(activeLabMod)}
              subtitle={t("test_running_wait", "Sandbox monitoring is active...")}
              label={t("monitoring_subject", "Monitoring Subject")}
              icon={t("icon_radar", "radar")}
              variant="accent"
              badges={[
                {
                  icon: t("icon_shield_lock", "shield_lock"),
                  label: t("lab_badge_saves_airgapped", "Saves Airgapped (Sandbox Active)"),
                  colorClass: "text-[var(--success)]",
                },
              ]}
            >
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                {linkedTool && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_launch", "launch")}
                    label={`${t("lab_btn_launch_tool", "Launch Tool (Isolated)")} (${linkedTool.name})`}
                    onClick={handleLaunchExternalToolStandalone}
                  />
                )}
                <ActionButton
                  variant="success"
                  icon={t("icon_science", "science")}
                  label={t("btn_conclude_experiment", "Conclude Experiment")}
                  onClick={() => {
                    handleConcludeTest();
                    setShowTestPanel(false);
                  }}
                />
              </div>
            </SidePanelHeroCard>

            <div className="w-full text-left">
              <LabVerificationGate
                dnaHash={activeLabMod?.hash}
                modName={activeLabMod?.name || getModName(activeLabMod)}
                physicalPath={activeLabMod?.physical_path || activeLabMod?.name}
                roleContext="lab"
                isGateRequired={true}
                externalStatus={labSessionStatus}
              />
            </div>
          </div>
        </SidePanel>
      )}

      {/* Dedicated Lab Test Save Setup & Switcher SidePanel */}
      {showTestSaveModal && (
        <SidePanel
          isOpen={showTestSaveModal}
          onClose={() => {
            setShowTestSaveModal(false);
            setPendingLaunchAfterSaveSetup(null);
          }}
          title={t("lab_test_save_modal_title", "Lab Test Save Configuration")}
          subtitle={t(
            "lab_test_save_modal_subtitle",
            "Manage the isolated save file that is only active when the Homestead Lab is running"
          )}
          icon={t("icon_save", "save")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[92vw] md:w-[640px]"
        >
          <div className="flex flex-col gap-5 mt-3 w-full pb-12">
            {/* Current Status Banner */}
            <SidePanelHeroCard
              title={
                testSaveStatus?.active_test_save
                  ? testSaveStatus.active_test_save.file_name
                  : t("lab_test_save_none_badge", "Clean Sandbox (Create Save In-Game)")
              }
              subtitle={t("lab_test_save_active_sub", "Only active while Lab is running")}
              label={t("lab_test_save_current_label", "Active Lab Test Save")}
              icon={
                testSaveStatus?.has_test_save
                  ? t("icon_verified_user", "verified_user")
                  : t("icon_save", "save")
              }
              variant={testSaveStatus?.has_test_save ? "success" : "warning"}
              badges={[
                {
                  icon: testSaveStatus?.has_test_save
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_science", "science"),
                  label: testSaveStatus?.has_test_save
                    ? t("lab_test_save_active_badge", "Isolated Test Save Ready")
                    : t("lab_test_save_none_badge", "Clean Sandbox (Create Save In-Game)"),
                  colorClass: testSaveStatus?.has_test_save
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]",
                },
              ]}
            />

            {/* Option 1: Create a Fresh Test Save In-Game */}
            <UniversalGroup
              title={t("lab_test_save_option_fresh_title", "Create New Test Save In-Game")}
              icon={t("icon_add_circle", "add_circle")}
            >
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                {t(
                  "lab_test_save_option_fresh_desc",
                  "Starts the Lab with an empty saves folder so you can start a new game and save it as your dedicated testing world. Your normal saves remain untouched."
                )}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1 ml-auto w-full">
                <ActionButton
                  variant="glass"
                  icon={t("icon_save", "save")}
                  label={t(
                    "lab_test_save_btn_use_fresh",
                    "Use Clean Sandbox (Create Save In-Game)"
                  )}
                  disabled={isConfiguringSave}
                  onClick={() => handleResetForFreshSave(false)}
                />

                <ActionButton
                  variant="success"
                  icon={t("icon_launch", "rocket_launch")}
                  label={t(
                    "lab_test_save_btn_launch_create",
                    "Launch Game Now to Create Test Save"
                  )}
                  disabled={isConfiguringSave}
                  onClick={() => handleResetForFreshSave(true)}
                />
              </div>
            </UniversalGroup>

            {/* Option 2: Pick / Copy From Existing Live Save Files */}
            <UniversalGroup
              title={t("lab_test_save_option_copy_title", "Select or Change From Existing Saves")}
              icon={t("icon_swap_horiz", "swap_horiz")}
            >
              <p className="text-xs font-semibold text-[var(--subtext)] leading-relaxed">
                {t(
                  "lab_test_save_option_copy_desc",
                  "Copy one of your existing save files into the isolated Lab sandbox. Any changes made during testing stay in the Lab and never overwrite your original save."
                )}
              </p>

              {testSaveStatus?.available_live_saves &&
                testSaveStatus.available_live_saves.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {testSaveStatus.available_live_saves.map((saveItem) => {
                    const isCurrentActive =
                      testSaveStatus.active_test_save?.file_name?.toLowerCase() ===
                      saveItem.file_name.toLowerCase();
                    return (
                      <div
                        key={saveItem.file_name}
                        className={`glass-surface rounded-xl p-3 border flex items-center justify-between gap-3 transition-all ${isCurrentActive
                          ? "sa-glass-pill-active"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`material-symbols-outlined !text-[18px] shrink-0 ${isCurrentActive
                              ? "text-[var(--success)]"
                              : "text-[var(--subtext)]"
                              }`}
                          >
                            {t("icon_save", "save")}
                          </span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs font-black font-mono text-[var(--text)] truncate">
                              {saveItem.file_name}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75">
                              {`${(saveItem.size_kb / 1024).toFixed(1)} MB • ${saveItem.modified_epoch
                                ? new Date(
                                  saveItem.modified_epoch * 1000
                                ).toLocaleString()
                                : ""
                                }`}
                            </span>
                          </div>
                        </div>

                        <ActionButton
                          variant={isCurrentActive ? "success" : "glass"}
                          icon={
                            isCurrentActive
                              ? t("icon_check_circle", "check_circle")
                              : t("icon_content_copy", "content_copy")
                          }
                          label={
                            isCurrentActive
                              ? t("lab_test_save_btn_active", "Active Test Save")
                              : t("lab_test_save_btn_use_this", "Set as Test Save")
                          }
                          disabled={isConfiguringSave}
                          onClick={() => handleCopyLiveSaveForLab(saveItem.file_name)}
                          className="ml-auto shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--subtext)] text-center">
                  {t(
                    "lab_test_save_no_live_saves",
                    "No existing save files found in your game saves folder. Use the option above to create a new test save in-game."
                  )}
                </div>
              )}
            </UniversalGroup>
          </div>
        </SidePanel>
      )}
    </div>
  );
}
