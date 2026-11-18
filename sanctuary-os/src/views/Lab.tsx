import React, { useState, useEffect, useRef } from "react";
import { useLexicon } from "../LexiconContext";
import {
  ViewHeader,
  ActionPill,
  HoverTooltip,
  EmptyState,
} from "../shared";
import {
  DashboardStatTile,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  StatTileCarousel
} from "../hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "../components/universal/UniversalCard";
import { openSanctuaryContextMenu, SanctuaryContextMenuItem } from "../shared-components/ContextMenu";
import { VAULT_CHIP_CLASS } from "../shared-components/constants";
import { useStore } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../supabase";
import {
  LabVerificationStatus,
  LabTestSaveStatus,
  recordVerifiedCertificate,
  loadLabSessionMemory,
  saveLabSessionMemory,
} from "../components/LabVerificationGate";
import {
  KnownErrorFilterPopoverContent,
  KnownErrorSortField,
  getExceptionRules,
  useExceptionRules,
  isUnrelatedGameBugLog,
  NormalizedRuleSeverity,
} from "../components/KnownExceptionRules";
import {
  scrubLogUserData,
  resolveLabReportNumber,
  extractReportLoadoutFromLogAndContext,
  formatModWithExtAndVersion,
  getCleanModBaseName,
  getModExtensionLabel,
  getModVersionLabel,
  resolveRealReportMod,
  ScrubbedRealLogFile,
} from "../utils/logScrubber";
import { LAB_PANEL_MEMORY_KEY, resolveSpokeLabScopeKey, resolveDefaultRealLogName, parseLabTimestamp, isLabTestableArtifact, LabFilterSection } from "../components/lab/labHelpers";
import { useLabSaveAndToolActions } from "../hooks/useLabSaveAndToolActions";
import { LabBuilderAndReportsTabs } from "../components/lab/LabBuilderAndReportsTabs";
import { LabSidePanelsAndModals } from "../components/lab/LabSidePanelsAndModals";
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
  const [saveModalFeedback, setSaveModalFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
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
      const [res, saveRes]: any = await Promise.all([
        invoke("get_airgap_status", { docsPath: targetDocs, gameSchema: activeGameSchema }).catch(() => null),
        invoke("get_lab_test_save_status", { docsPath: targetDocs, gameSchema: activeGameSchema }).catch(() => null),
      ]);
      if (res) {
        setAirgapStatus(res);
      }
      if (saveRes) {
        setTestSaveStatus(saveRes);
        const armed = Boolean(saveRes.fresh_sandbox_armed && !saveRes.has_test_save);
        setFreshSaveArmed(armed);
        try {
          if (armed) {
            localStorage.setItem(freshSaveArmedKey, "1");
          } else {
            localStorage.removeItem(freshSaveArmedKey);
          }
        } catch { }
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

  useEffect(() => {
    if (showTestSaveModal) {
      refreshAirgapStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTestSaveModal]);

  const memoryDismissedRef = useRef<boolean>(false);

  const [labSessionStatus, setLabSessionStatus] = useState<LabVerificationStatus | null>(() => {
    return loadLabSessionMemory();
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isSessionRunning =
      Boolean(labSessionStatus?.active) &&
      labSessionStatus?.stage !== "VERIFIED" &&
      labSessionStatus?.stage !== "FAILED";
    document.documentElement.dataset.saGameFocused =
      isSessionRunning && labSessionStatus?.is_focused ? "true" : "false";
    return () => {
      document.documentElement.dataset.saGameFocused = "false";
    };
  }, [labSessionStatus?.active, labSessionStatus?.stage, labSessionStatus?.is_focused]);

  const [stagedExtras, setStagedExtras] = useState<any[]>([]);
  const [conflictExtras, setConflictExtras] = useState<any[]>([]);
  const [missingDeps, setMissingDeps] = useState<any[]>([]);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("DASHBOARD");
  const [, setLastTestResult] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isEndingTest, setIsEndingTest] = useState(false);
  const [secureCardState, setSecureCardState] = useState<"idle" | "working" | "done">("idle");
  const [submitCardState, setSubmitCardState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [downloadCardState, setDownloadCardState] = useState<"idle" | "done">("idle");
  const [reportLogViewTab, setReportLogViewTab] = useState<"LAB_REPORT" | "REAL_LOG">("LAB_REPORT");
  const [liveRealLogs, setLiveRealLogs] = useState<ScrubbedRealLogFile[]>([]);
  const exceptionRules = useExceptionRules(activeGameSchema);

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

  const getReportModIdentityKey = (mod: any): string => {
    if (!mod) return "";
    if (mod.hash) return String(mod.hash).toLowerCase();
    if (mod.id) return String(mod.id).toLowerCase();
    return getCleanModBaseName(mod).toLowerCase();
  };

  const sortAndDedupeLabReportsNewestFirst = (entries: any[]): any[] => {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const sorted = entries
      .filter(
        (entry: any) =>
          Boolean(entry?.mod) &&
          (Boolean(entry.errorFound) ||
            Boolean(entry.logSnippet && String(entry.logSnippet).trim().length > 0) ||
            Boolean(entry.verified))
      )
      .map((entry: any) => ({
        ...entry,
        isConcluding: false,
        time: parseLabTimestamp(entry.time).toISOString(),
        logSnippet: scrubLogUserData(entry.logSnippet),
      }))
      .sort(
        (a: any, b: any) =>
          parseLabTimestamp(b.time).getTime() - parseLabTimestamp(a.time).getTime()
      );

    const deduped: any[] = [];
    for (const item of sorted) {
      const itemModKey = getReportModIdentityKey(item.mod);
      const itemConflictKey = getReportModIdentityKey(item.conflictTarget);
      const itemTs = parseLabTimestamp(item.time).getTime();

      const matchIdx = deduped.findIndex((existing: any) => {
        if (item.id && existing.id && item.id === existing.id) return true;
        if (item.sessionKey && existing.sessionKey && item.sessionKey === existing.sessionKey) {
          return true;
        }
        const exModKey = getReportModIdentityKey(existing.mod);
        const exConflictKey = getReportModIdentityKey(existing.conflictTarget);
        const exTs = parseLabTimestamp(existing.time).getTime();
        if (
          itemModKey &&
          itemModKey === exModKey &&
          itemConflictKey === exConflictKey &&
          Boolean(item.errorFound) === Boolean(existing.errorFound) &&
          Math.abs(itemTs - exTs) <= 90_000
        ) {
          return true;
        }
        return false;
      });

      if (matchIdx >= 0) {
        const prev = deduped[matchIdx];
        const prevSnippet = String(prev.logSnippet || "");
        const nextSnippet = String(item.logSnippet || "");
        const preferredSnippet =
          nextSnippet.length > prevSnippet.length ? nextSnippet : prevSnippet;
        const prevIsCloud = String(prev.id || "").startsWith("cloud_");
        const nextIsCloud = String(item.id || "").startsWith("cloud_");
        const canonicalTime =
          nextIsCloud && !prevIsCloud
            ? item.time
            : prevIsCloud && !nextIsCloud
              ? prev.time
              : parseLabTimestamp(prev.time).getTime() >= itemTs
                ? prev.time
                : item.time;
        deduped[matchIdx] = {
          ...item,
          ...prev,
          id: prevIsCloud ? prev.id : nextIsCloud ? item.id : prev.id || item.id,
          sessionKey:
            prevIsCloud
              ? prev.sessionKey
              : nextIsCloud
                ? item.sessionKey
                : prev.sessionKey || item.sessionKey,
          time: canonicalTime,
          logSnippet: preferredSnippet,
          verified: Boolean(prev.verified || item.verified),
          isConcluding: false,
        };
      } else {
        deduped.push(item);
      }
    }

    return deduped.sort(
      (a: any, b: any) =>
        parseLabTimestamp(b.time).getTime() - parseLabTimestamp(a.time).getTime()
    );
  };

  const loadScopedTestHistory = (scopeKey: string): any[] => {
    try {
      const key = `sanctuary_test_history_${scopeKey}`;
      const rawStr = localStorage.getItem(key) || "[]";
      const raw = JSON.parse(rawStr);
      if (!Array.isArray(raw)) return [];
      const cleaned = sortAndDedupeLabReportsNewestFirst(raw).slice(0, 50);
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
      const normalized = {
        ...entry,
        isConcluding: false,
        time: parseLabTimestamp(entry.time).toISOString(),
        logSnippet: scrubbedSnippet,
        sessionKey: key,
      };
      const existingIdx = prev.findIndex(
        (r: any) =>
          (entry.id && r.id === entry.id) ||
          (r.sessionKey && r.sessionKey === key) ||
          (r.mod?.hash &&
            r.mod.hash === entry.mod?.hash &&
            Boolean(r.errorFound) === Boolean(entry.errorFound) &&
            (r.logSnippet || "").slice(0, 80) === scrubbedSnippet.slice(0, 80))
      );
      let candidateList: any[];
      if (existingIdx >= 0) {
        candidateList = [...prev];
        candidateList[existingIdx] = {
          ...candidateList[existingIdx],
          ...normalized,
          logSnippet:
            normalized.logSnippet.length >= String(candidateList[existingIdx].logSnippet || "").length
              ? normalized.logSnippet
              : candidateList[existingIdx].logSnippet,
        };
      } else {
        candidateList = [normalized, ...prev];
      }
      const next = sortAndDedupeLabReportsNewestFirst(candidateList).slice(0, 50);
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

        const cloudEntries: any[] = [];
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

          cloudEntries.push({
            id: `cloud_${log.id}`,
            sessionKey: `cloud_${log.id}`,
            mod: modObj,
            errorFound: !isVerifiedPass,
            verified: isVerifiedPass,
            isConcluding: false,
            time: log.created_at || new Date().toISOString(),
            logSnippet: snippet,
            conflictTarget: extractedLoadout.conflictTarget,
            stagedExtras: extractedLoadout.dependencies,
            conflictExtras: extractedLoadout.conflictExtras,
          });
        });

        if (cloudEntries.length > 0 && !cancelled) {
          setTestHistory((prev: any[]) => {
            const next = sortAndDedupeLabReportsNewestFirst([...cloudEntries, ...prev]).slice(0, 50);
            try {
              localStorage.setItem(scopedTestHistoryKey, JSON.stringify(next));
            } catch { }
            return next;
          });
        }
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
                  time: parseLabTimestamp(st.certificate.verified_at).toISOString(),
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

  const reportsToListRef = useRef<any[]>([]);
  const {
    handleToggleAirgap,
    handleLinkExternalTool,
    handleUnlinkExternalTool,
    handleLaunchExternalToolStandalone,
    handleScanLiveExceptionLogs,
    handleClearLabMemory,
    handleExportLogs,
    runCombinedHotSwap,
    handleSelectSandboxSave,
    handleCopyLiveSaveForLab,
    handleImportSaveFilesFromDisk,
    handleRestoreLiveSavesFromVaultMirror,
    handleResetForFreshSave,
  } = useLabSaveAndToolActions({
    activeLabMod,
    setActiveLabMod,
    modList,
    executeHotSwap,
    conflictTarget,
    setConflictTarget,
    testErrorFound,
    testLogSnippet,
    associatedMods,
    t,
    activeGameSchema,
    selectedVersion,
    modsPath,
    docsPath,
    setStatus,
    spokeLabKey,
    scopedPanelMemoryKey,
    toolStorageKey,
    setLinkedTool,
    linkedTool,
    testSaveStatus,
    setTestSaveStatus,
    setShowTestSaveModal,
    setIsConfiguringSave,
    setSaveModalFeedback,
    setPendingLaunchAfterSaveSetup,
    pendingLaunchAfterSaveSetup,
    freshSaveArmedKey,
    freshSaveArmed,
    setFreshSaveArmed,
    refreshAirgapStatus,
    memoryDismissedRef,
    setLabSessionStatus,
    labSessionStatus,
    stagedExtras,
    setStagedExtras,
    conflictExtras,
    setConflictExtras,
    missingDeps,
    setMissingDeps,
    setShowTestPanel,
    setActiveTab,
    setSelectedReport,
    selectedReport,
    setDownloadCardState,
    liveRealLogs,
    exceptionRules,
    lastConcludingReport,
    setLastConcludingReport,
    recordRealTestEntry,
    setKnownErrorSearch,
    isScanningLiveLogs,
    setIsScanningLiveLogs,
    setKnownErrorFilter,
    setKnownErrorLabBehavior,
    setKnownErrorFileHint,
    reportsToListRef,
  });
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

  const abortLab = async () => {
    if (isEndingTest) return;
    if (shelterActive || airgapStatus.active || Boolean(labSessionStatus?.active)) {
      await handleConcludeTest();
      return;
    }
    await handleClearLabMemory();
  };

  const handleConcludeTest = async () => {
    if (isEndingTest || secureCardState === "working" || secureCardState === "done") {
      return false;
    }
    setIsEndingTest(true);
    const fromReportPanel = Boolean(selectedReport);
    try {
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
        const cert = labSessionStatus?.certificate;
        const modIdentity = targetMod.hash || targetMod.name;
        const canonicalSessionKey =
          selectedReport?.sessionKey ||
          (isVerifiedPass
            ? `verified_${cert?.dna_hash || modIdentity}`
            : `failed_${labSessionStatus?.dna_hash || modIdentity}_${targetLog.slice(0, 48)}`);
        const canonicalId =
          selectedReport?.id && selectedReport.id !== "concluding_test"
            ? selectedReport.id
            : isVerifiedPass && cert
              ? `verified_${cert.dna_hash}_${cert.verified_at}`
              : canonicalSessionKey;
        const canonicalTime = parseLabTimestamp(
          selectedReport?.time || (isVerifiedPass ? cert?.verified_at : undefined)
        ).toISOString();
        const detailedVerifiedSnippet =
          isVerifiedPass && cert
            ? `Verified 4-stage live simulation (${cert.active_seconds}s active, peak RAM ${cert.peak_ram_mb} MB, save checkpoint: ${cert.save_file_verified}).`
            : "Verified 4-stage live simulation & save checkpoint.";
        const result = {
          id: canonicalId,
          sessionKey: canonicalSessionKey,
          mod: targetMod,
          errorFound: targetErr,
          verified: isVerifiedPass,
          isConcluding: false,
          time: canonicalTime,
          logSnippet: targetLog || (isVerifiedPass ? detailedVerifiedSnippet : ""),
          conflictTarget: selectedReport?.conflictTarget ?? conflictTarget,
          stagedExtras: selectedReport?.stagedExtras ?? stagedExtras,
          conflictExtras: selectedReport?.conflictExtras ?? conflictExtras,
          missingDeps: selectedReport?.missingDeps ?? missingDeps,
          linkedFiles: selectedReport?.linkedFiles ?? labSessionStatus?.linked_files ?? [],
        };
        setLastTestResult(result);
        recordRealTestEntry(result);
      }

      const didConclude = await concludeTest(ctx, targetMod, targetErr);
      await refreshAirgapStatus();
      if (!didConclude) {
        if (fromReportPanel) {
          setSecureCardState("idle");
        }
        return false;
      }

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
      return true;
    } finally {
      setIsEndingTest(false);
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

  let reportsToList = [...testHistory].sort(
    (a: any, b: any) =>
      parseLabTimestamp(b.time).getTime() - parseLabTimestamp(a.time).getTime()
  );
  const isConcluding = Boolean(shelterActive && (testLogSnippet || testErrorFound));
  if (isConcluding && activeLabMod) {
    const scrubbedConcludingLog = scrubLogUserData(testLogSnippet || "");
    const concludingId = `crash_${activeLabMod.hash || activeLabMod.name}_${scrubbedConcludingLog.slice(0, 48)}`;
    const activeModKey = getReportModIdentityKey(activeLabMod);
    const existingActiveIdx = reportsToList.findIndex(
      (r) =>
        r.sessionKey === concludingId ||
        (activeModKey &&
          getReportModIdentityKey(r.mod) === activeModKey &&
          Boolean(r.errorFound) &&
          Math.abs(Date.now() - parseLabTimestamp(r.time).getTime()) <= 90_000)
    );
    if (existingActiveIdx >= 0) {
      reportsToList[existingActiveIdx] = {
        ...reportsToList[existingActiveIdx],
        isConcluding: true,
      };
    } else {
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
    shelterActive &&
    lastConcludingReport &&
    !reportsToList.some(
      (r) =>
        r.id === lastConcludingReport.id ||
        (r.sessionKey && r.sessionKey === lastConcludingReport.sessionKey)
    )
  ) {
    reportsToList.unshift({ ...lastConcludingReport, isConcluding: true });
  }
  reportsToList.sort((a: any, b: any) => {
    const aLive = Boolean(a.isConcluding && shelterActive) ? 1 : 0;
    const bLive = Boolean(b.isConcluding && shelterActive) ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return parseLabTimestamp(b.time).getTime() - parseLabTimestamp(a.time).getTime();
  });

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
  reportsToListRef.current = reportsToList;

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

  const isModKnownCloudTier0ForLabReport = (m: any): boolean => {
    if (!m) return false;
    const tier = Number(m.compliance_tier || 0);
    const statusLower = String(m.status || "").trim().toLowerCase();
    const mHash = String(m.hash || m.dna_hash || "").trim();
    return (
      tier === 0 &&
      !m.is_unknown &&
      Boolean(mHash) &&
      mHash !== "calculating" &&
      Boolean(m.isSynced) &&
      Boolean(m.dbId) &&
      statusLower !== "unverified" &&
      statusLower !== "rejected"
    );
  };

  const canSubmitLabReportItem = (primaryMod: any, item: any): boolean => {
    if (!primaryMod) return false;
    const involved = [
      primaryMod,
      ...(Array.isArray(item?.stagedExtras) ? item.stagedExtras : []),
      item?.conflictTarget,
      ...(Array.isArray(item?.conflictExtras) ? item.conflictExtras : []),
    ].filter(Boolean);
    return involved.length > 0 && involved.every(isModKnownCloudTier0ForLabReport);
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
          <div className="flex flex-col gap-10 w-full">
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_tests_title", "Recent Tests")}
                    icon={t("icon_history", "history")}
                  />
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                    {reportsToList.length > 0 ? (
                      reportsToList
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
                                if (
                                  isError &&
                                  submitLabReport &&
                                  canSubmitLabReportItem(resolvedTestMod, test)
                                ) {
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
                                    {parseLabTimestamp(test.time).toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}{" "}
                                    &bull;{" "}
                                    {parseLabTimestamp(test.time).toLocaleTimeString([], {
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

      <LabBuilderAndReportsTabs
        activeLabMod={activeLabMod}
        setActiveLabMod={setActiveLabMod}
        modList={modList}
        onOpenDossier={onOpenDossier}
        shelterActive={shelterActive}
        conflictTarget={conflictTarget}
        setConflictTarget={setConflictTarget}
        submitLabReport={submitLabReport}
        t={t}
        activeGameSchema={activeGameSchema}
        selectedVersion={selectedVersion}
        linkedTool={linkedTool}
        airgapStatus={airgapStatus}
        testSaveStatus={testSaveStatus}
        setShowTestSaveModal={setShowTestSaveModal}
        memoryDismissedRef={memoryDismissedRef}
        stagedExtras={stagedExtras}
        setStagedExtras={setStagedExtras}
        conflictExtras={conflictExtras}
        setConflictExtras={setConflictExtras}
        missingDeps={missingDeps}
        setShowTestPanel={setShowTestPanel}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setSelectedReport={setSelectedReport}
        handleToggleAirgap={handleToggleAirgap}
        knownErrorSearch={knownErrorSearch}
        setKnownErrorSearch={setKnownErrorSearch}
        builderSearch={builderSearch}
        builderFilter={builderFilter}
        builderPage={builderPage}
        setBuilderPage={setBuilderPage}
        setKnownErrorFilter={setKnownErrorFilter}
        knownErrorFilter={knownErrorFilter}
        setKnownErrorLabBehavior={setKnownErrorLabBehavior}
        knownErrorLabBehavior={knownErrorLabBehavior}
        setKnownErrorFileHint={setKnownErrorFileHint}
        knownErrorFileHint={knownErrorFileHint}
        knownErrorSort={knownErrorSort}
        runCombinedHotSwap={runCombinedHotSwap}
        builderSymbioticMods={builderSymbioticMods}
        builderPrimaryAdversaryMods={builderPrimaryAdversaryMods}
        builderExtraAdversaryMods={builderExtraAdversaryMods}
        abortLab={abortLab}
        testedModHashes={testedModHashes}
        filteredBuilderCandidates={filteredBuilderCandidates}
        reportsToList={reportsToList}
        filteredReports={filteredReports}
        canSubmitLabReportItem={canSubmitLabReportItem}
      />
      <LabSidePanelsAndModals
        activeLabMod={activeLabMod}
        setActiveLabMod={setActiveLabMod}
        modList={modList}
        onOpenDossier={onOpenDossier}
        shelterActive={shelterActive}
        setConflictTarget={setConflictTarget}
        testErrorFound={testErrorFound}
        isSubmittingReport={isSubmittingReport}
        submitLabReport={submitLabReport}
        t={t}
        activeGameSchema={activeGameSchema}
        selectedVersion={selectedVersion}
        linkedTool={linkedTool}
        testSaveStatus={testSaveStatus}
        showTestSaveModal={showTestSaveModal}
        setShowTestSaveModal={setShowTestSaveModal}
        isConfiguringSave={isConfiguringSave}
        setSaveModalFeedback={setSaveModalFeedback}
        saveModalFeedback={saveModalFeedback}
        setPendingLaunchAfterSaveSetup={setPendingLaunchAfterSaveSetup}
        copiedLogState={copiedLogState}
        setCopiedLogState={setCopiedLogState}
        refreshAirgapStatus={refreshAirgapStatus}
        labSessionStatus={labSessionStatus}
        setStagedExtras={setStagedExtras}
        setConflictExtras={setConflictExtras}
        missingDeps={missingDeps}
        showTestPanel={showTestPanel}
        setShowTestPanel={setShowTestPanel}
        setActiveTab={setActiveTab}
        selectedReport={selectedReport}
        setSelectedReport={setSelectedReport}
        isEndingTest={isEndingTest}
        secureCardState={secureCardState}
        submitCardState={submitCardState}
        setSubmitCardState={setSubmitCardState}
        downloadCardState={downloadCardState}
        reportLogViewTab={reportLogViewTab}
        setReportLogViewTab={setReportLogViewTab}
        liveRealLogs={liveRealLogs}
        exceptionRules={exceptionRules}
        lastConcludingReport={lastConcludingReport}
        handleLaunchExternalToolStandalone={handleLaunchExternalToolStandalone}
        handleExportLogs={handleExportLogs}
        handleSelectSandboxSave={handleSelectSandboxSave}
        handleCopyLiveSaveForLab={handleCopyLiveSaveForLab}
        handleImportSaveFilesFromDisk={handleImportSaveFilesFromDisk}
        handleRestoreLiveSavesFromVaultMirror={handleRestoreLiveSavesFromVaultMirror}
        handleResetForFreshSave={handleResetForFreshSave}
        getModName={getModName}
        handleConcludeTest={handleConcludeTest}
        reportsToList={reportsToList}
        isModKnownCloudTier0ForLabReport={isModKnownCloudTier0ForLabReport}
      />
    </div>
  );
}
