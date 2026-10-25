import React, { useState, useEffect, useRef } from "react";
import { useLexicon } from "./LexiconContext";
import {
  ViewHeader,
  ModSearchDropdown,
  CustomDropdown,
  ActionButton,
  FilterTabs,
  SidePanel,
  getExtensionRegex,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  GlassSegmentedControl,
  StatBox,
} from "./shared";
import {
  CommandScreenLayout,
  DashboardStatTile,
  CommandScreenStats,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  StatTileCarousel
} from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./components/universal/UniversalCard";
import { SidePanelHeroCard, UniversalGroup } from "./components/layouts/ElevatedHubLayout";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";
import { useStore } from "./store";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import {
  LabVerificationGate,
  LabVerificationBadge,
  LabVerificationStatus,
  LabTestSaveStatus,
  recordVerifiedCertificate,
  loadLabSessionMemory,
  saveLabSessionMemory,
} from "./components/LabVerificationGate";
import {
  KnownErrorDiagnosisBanner,
  KnownErrorRulesManager,
  getExceptionRules,
  matchExceptionRules,
  normalizeRuleSeverity,
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
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const selectedVersion = useStore((s) => s.selectedVersion);
  const modsPath = useStore((s) => s.modsPath);
  const docsPath = modsPath ? modsPath.split(/[\\/]Mods/i)[0] : "";
  const setStatus = useStore((s) => s.setStatus);

  const gameKey = activeGameSchema?.game_id || "ts4";
  const toolStorageKey = `sanctuary_lab_external_tool_${gameKey}`;

  const [linkedTool, setLinkedTool] = useState<{ name: string; path: string } | null>(() => {
    try {
      const saved = localStorage.getItem(`sanctuary_lab_external_tool_${activeGameSchema?.game_id || "ts4"}`);
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
  const freshSaveArmedKey = `sanctuary_lab_fresh_save_armed_${gameKey}`;
  const [freshSaveArmed, setFreshSaveArmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`sanctuary_lab_fresh_save_armed_${activeGameSchema?.game_id || "ts4"}`) === "1";
    } catch {
      return false;
    }
  });

  const refreshAirgapStatus = async () => {
    try {
      const targetDocs = docsPath || modsPath || "";
      const [res, saveRes]: any = await Promise.all([
        invoke("get_airgap_status", { docsPath: targetDocs }).catch(() => null),
        invoke("get_lab_test_save_status", { docsPath: targetDocs }).catch(() => null),
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
          } catch {}
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
  const [lastTestResult, setLastTestResult] = useState<any>(null);
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
      })
        .then((files) => {
          if (Array.isArray(files) && files.length > 0) {
            setLiveRealLogs(
              files.map((f) => ({
                ...f,
                fileName: f.fileName || f.file_name || "lastException.txt",
                content: scrubLogUserData(f.content),
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [selectedReport?.id, selectedReport?.sessionKey, docsPath, modsPath]);

  const [lastConcludingReport, setLastConcludingReport] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(LAB_PANEL_MEMORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lastConcludingReport) {
          return {
            ...parsed.lastConcludingReport,
            logSnippet: scrubLogUserData(parsed.lastConcludingReport.logSnippet),
          };
        }
      }
    } catch {}
    return null;
  });

  const [testHistory, setTestHistory] = useState<any[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("sanctuary_test_history") || "[]");
      if (!Array.isArray(raw)) return [];
      // Filter out bogus legacy entries and scrub any user data in stored logs
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
      localStorage.setItem("sanctuary_test_history", JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return [];
    }
  });

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
        localStorage.setItem("sanctuary_test_history", JSON.stringify(next));
      } catch {}
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
          .select("id, mod_id, version_id, mod_version_id, log_snippet, log_text, tester_note, created_at, mods(id, name, status, file_extension), mod_versions(dna_hash, version_label)")
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
              if (parsed.conflictTarget) {
                parsedConflictTarget = matchPhysicalModByName(parsed.conflictTarget) || {
                  name: parsed.conflictTarget,
                  displayName: parsed.conflictTarget,
                };
              }
              if (Array.isArray(parsed.dependencies)) {
                parsedStagedExtras = parsed.dependencies.map(
                  (depName: string) =>
                    matchPhysicalModByName(depName) || {
                      name: depName,
                      displayName: depName,
                    }
                );
              }
              if (Array.isArray(parsed.conflictExtras)) {
                parsedConflictExtras = parsed.conflictExtras.map(
                  (cName: string) =>
                    matchPhysicalModByName(cName) || {
                      name: cName,
                      displayName: cName,
                    }
                );
              }
            } catch {}
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

          recordRealTestEntry({
            id: `cloud_${log.id}`,
            sessionKey: `cloud_${log.id}`,
            mod: modObj,
            errorFound: true,
            verified: false,
            time: log.created_at || new Date().toISOString(),
            logSnippet: snippet,
            conflictTarget: extractedLoadout.conflictTarget,
            stagedExtras: extractedLoadout.dependencies,
            conflictExtras: extractedLoadout.conflictExtras,
          });
        });
      } catch {}
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
      } catch (e) {}
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
  const [logFilter, setLogFilter] = useState("all");
  const [knownErrorFilter, setKnownErrorFilter] = useState<"all" | NormalizedRuleSeverity>("all");

  // Restore active test payload memory on mount if accidentally closed or navigated away
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_PANEL_MEMORY_KEY);
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
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active test payload & concluding report to memory
  useEffect(() => {
    if (memoryDismissedRef.current) return;
    try {
      if (activeLabMod || lastConcludingReport) {
        localStorage.setItem(
          LAB_PANEL_MEMORY_KEY,
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
    } catch {}
  }, [activeLabMod, conflictTarget, stagedExtras, conflictExtras, lastConcludingReport]);

  const handleClearLabMemory = async () => {
    memoryDismissedRef.current = true;
    try {
      localStorage.removeItem(LAB_PANEL_MEMORY_KEY);
    } catch {}
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
    } catch {}
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
    const cleanName = (name: string) =>
      name
        ? name
          .replace(/['"]/g, "")
          .replace(/_/g, " ")
          .replace(extRegex, "")
          .trim()
          .toUpperCase()
        : "";

    if (activeLabMod && activeLabMod.dependencies) {
      let rawDeps: string[] = [];
      if (typeof activeLabMod.dependencies === "string") {
        rawDeps = activeLabMod.dependencies
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(activeLabMod.dependencies)) {
        rawDeps = [...activeLabMod.dependencies]
          .map((s) => (typeof s === "string" ? s.trim() : s))
          .filter(Boolean);
      }

      const foundDeps = rawDeps
        .map((depName) => {
          const targetDepClean = cleanName(depName);
          const isDBScript = depName.toLowerCase().includes("script");
          const found = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash)
              return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name)
              return false;

            if (!m.name) return false;

            const isLocalScript = m.name.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            return (
              cleanName(m.name) === targetDepClean ||
              cleanName(m.displayName) === targetDepClean ||
              (m.path && m.path.includes(depName) && depName.length > 3)
            );
          });

          if (!found) missing.push({ name: depName, displayName: depName });
          return found;
        })
        .filter(Boolean);

      depsToStage = [...depsToStage, ...foundDeps];
    }

    if (activeLabMod && associatedMods && associatedMods.length > 0) {
      const assocCleanName = (name: string) =>
        name
          ? name
            .replace(/_/g, " ")
            .replace(
              /(\.| |-)*(\(|\[)?(package|ts4scripts?|scripts?|zip)(\)|\])?/gi,
              "",
            )
            .trim()
            .toUpperCase()
          : "";

      const extraDeps = associatedMods
        .map((am: any) => {
          const targetAmClean = assocCleanName(am.name);
          const isDBScript =
            Boolean(am.file_extension && am.file_extension.toLowerCase().includes("script")) ||
            Boolean(am.name && am.name.toLowerCase().includes("script"));

          const found = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash)
              return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name)
              return false;

            if (am.hash && m.hash === am.hash) return true;
            if (am.id && m.id === am.id) return true;

            if (!am.name || !m.name) return false;

            const isLocalScript = Boolean(m.name && m.name.toLowerCase().includes("script"));
            if (isDBScript !== isLocalScript) return false;

            if (assocCleanName(m.displayName || m.name) === targetAmClean)
              return true;

            return false;
          });

          if (!found) missing.push(am);
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
          for (const realLog of liveRealLogs) {
            const rawName = realLog.fileName || realLog.file_name || "lastException.txt";
            const safeRealName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const companionPath = `${dirPath}${baseFileName}_${safeRealName}`;
            await writeTextFile(companionPath, scrubLogUserData(realLog.content));
          }
        } else if (scrubbedLog.trim().length > 0) {
          const cleanRealLog = extractCleanRealLogContent(scrubbedLog);
          const inferredRealName = inferRealLogFileName(scrubbedLog);
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
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(false);
      try {
        localStorage.removeItem(freshSaveArmedKey);
      } catch {}
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
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(true);
      try {
        localStorage.setItem(freshSaveArmedKey, "1");
      } catch {}
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
          await invoke("airgap_saves", { docsPath: targetDocs, enable: true });
          const coords: any = await invoke("get_saved_coordinates");
          await invoke("launch_game", {
            livePath: coords?.live_path || "",
            modsPath: coords?.mods_path || modsPath || "",
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
    () => (modList || []).filter((m: any) => !m?.isVirtual),
    [modList]
  );

  const builderSymbioticMods = React.useMemo(() => {
    const conflictHashes = new Set(
      conflictExtras.map((e: any) => e?.hash).filter(Boolean)
    );
    return builderBaseMods.filter(
      (m: any) =>
        m.hash !== activeLabMod?.hash &&
        !(m.hash && conflictHashes.has(m.hash))
    );
  }, [builderBaseMods, activeLabMod?.hash, conflictExtras]);

  const builderPrimaryAdversaryMods = React.useMemo(() => {
    if (activeTab !== "BUILDER" || conflictTarget) return [];
    return builderBaseMods
      .filter((m: any) => m.hash !== activeLabMod?.hash)
      .map((m: any) => ({
        ...m,
        displayName: formatModWithExtAndVersion(m, activeGameSchema, modList),
      }));
  }, [activeTab, conflictTarget, builderBaseMods, activeLabMod?.hash, activeGameSchema, modList]);

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
        localStorage.removeItem(LAB_PANEL_MEMORY_KEY);
      } catch {}
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
  const untestedCount =
    modList.length - new Set(testHistory.map((t) => t.mod?.hash)).size;

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
  const knownErrorCounts = {
    corrupted: spokeExceptionRules.filter((r) => normalizeRuleSeverity(r) === "corrupted").length,
    unstable: spokeExceptionRules.filter((r) => normalizeRuleSeverity(r) === "unstable").length,
    unrelated: spokeExceptionRules.filter((r) => normalizeRuleSeverity(r) === "unrelated").length,
  };

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
      icon: rememberedReport.errorFound ? "warning" : "assignment_turned_in",
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

  if (activeTab === "BUILDER" && activeLabMod) {
    if (!shelterActive) {
      headerPillActions.push({
        id: "initiate_swap",
        icon: "bolt",
        label: t("btn_initiate_swap", "Conduct Experiment") as string,
        onClick: () => runCombinedHotSwap(),
        activeClassName: "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
      });
      if (linkedTool) {
        headerPillActions.push({
          id: "launch_linked_tool",
          icon: t("icon_build_circle", "build_circle"),
          label: `${t("lab_btn_launch_tool", "Launch Linked Tool")} (${linkedTool.name})`,
          onClick: () => runCombinedHotSwap(linkedTool.path),
        });
      }
    } else {
      headerPillActions.push({
        id: "view_active_test",
        icon: "science",
        label: t("btn_view_test", "View Active Test") as string,
        onClick: () => setShowTestPanel(true),
        activeClassName: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]",
      });
    }
  }

  const showHeaderSearch = activeTab === "REPORTS" || activeTab === "KNOWN_ERRORS";

  const labFilterPopoverContent =
    activeTab === "REPORTS" ? (
      <div className="flex flex-col w-[360px] p-4 max-w-[calc(100vw-40px)] text-left">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
          {t("filter_status", "Filter Status") || "Status"}
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: `${t("filter_all", "All")} (${reportsToList.length})` },
            { id: "pass", label: `${t("verified", "Stable")} (${realStats.passed})` },
            { id: "fail", label: `${t("fatal", "Fatal")} (${realStats.failed})` },
          ].map((opt) => {
            const active = logFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLogFilter(opt.id)}
                className={`rounded-full px-4 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold capitalize tracking-widest border cursor-pointer ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                    : "border-transparent bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : activeTab === "KNOWN_ERRORS" ? (
      <div className="flex flex-col w-[420px] p-4 max-w-[calc(100vw-40px)] text-left">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2.5 px-1 flex items-center gap-2">
          {t("filter_status", "Filter Status") || "Status"}
          <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: `${t("filter_all", "All")} (${spokeExceptionRulesCount})` },
            { id: "corrupted", label: `${t("status_corrupted", "Corrupted")} (${knownErrorCounts.corrupted})` },
            { id: "unstable", label: `${t("label_unstable", "Unstable")} (${knownErrorCounts.unstable})` },
            { id: "unrelated", label: `${t("exc_rules_filter_unrelated", "Unrelated")} (${knownErrorCounts.unrelated})` },
          ].map((opt) => {
            const active = knownErrorFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKnownErrorFilter(opt.id as "all" | NormalizedRuleSeverity)}
                className={`rounded-full px-4 py-1.5 transition-all flex items-center justify-center text-[10px] font-bold capitalize tracking-widest border cursor-pointer ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                    : "border-transparent bg-transparent text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
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
              ? t(`tab_lab_${activeTab.toLowerCase()}`) || activeTab
              : undefined
        }
        onTitleClick={() => setActiveTab("DASHBOARD")}
      >
        <div className="flex items-center gap-3">
          {activeTab === "BUILDER" && activeLabMod && (
            <div className="hidden xl:flex flex-col items-end gap-0.5 px-3 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest">
                {t("payload", "Payload")}
              </span>
              <span className="text-xs font-black text-[var(--text)] tracking-widest capitalize">
                {t("core_plus", "1 Core + ")}
                {stagedExtras.length +
                  (conflictTarget ? 1 : 0) +
                  conflictExtras.length}
                {t("injected", " Injected")}
              </span>
            </div>
          )}

          {(showHeaderSearch || headerPillActions.length > 0) && (
            <ActionPill
              searchQuery={searchLogs}
              setSearchQuery={setSearchLogs}
              hideSearch={!showHeaderSearch}
              searchPlaceholder={
                activeTab === "KNOWN_ERRORS"
                  ? (t("exc_rules_search_placeholder", "Search exception patterns, error codes, or fixes...") as string)
                  : (t("search_logs", "Search Logs...") as string)
              }
              primaryPopover={
                labFilterPopoverContent
                  ? {
                      icon: "tune",
                      label: t("filters", "Filters") as string,
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
            icon="dashboard"
            label={t("overview", "Overview")}
            number=""
            onClick={() => setActiveTab("DASHBOARD")}
            isActive={activeTab === "DASHBOARD"}
          />
          <DashboardStatTile
            variant="tab"
            icon="science"
            label={t("tab_lab_builder", "Environment Builder")}
            number={modList?.length || 0}
            onClick={() => setActiveTab("BUILDER")}
            isActive={activeTab === "BUILDER"}
          />
          <DashboardStatTile
            variant="tab"
            icon="terminal"
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
            <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-xl border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-transparent text-[var(--accent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[22px]">
                    {t("icon_save", "save")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("lab_test_save_unconfigured_title", "First-Time Lab Save Setup")}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider uppercase border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)] bg-transparent flex items-center gap-1.5 shrink-0">
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
              <button
                type="button"
                onClick={() => setShowTestSaveModal(true)}
                className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_save", "save")}
                </span>
                {t("lab_test_save_btn_setup", "Set Up Test Save")}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-10 w-full">
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_tests_title", "Recent Tests")}
                    icon="history"
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
                                      className={`material-symbols-outlined !text-[12px] ${
                                        isError ? "text-rose-400" : "text-emerald-400"
                                      }`}
                                    >
                                      {isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                                    </span>
                                    <span className={isError ? "text-rose-400" : "text-emerald-400"}>
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
                                    <span className="font-mono text-[var(--accent)]">
                                      {`Lab_Report_${cardReportNum}`}
                                    </span>
                                  </span>
                                  {modExt && (
                                    <span className={VAULT_CHIP_CLASS}>
                                      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                        {t("icon_deployed_code", "deployed_code")}
                                      </span>
                                      <span className="text-[var(--subtext)]">{modExt}</span>
                                    </span>
                                  )}
                                  <span className={VAULT_CHIP_CLASS}>
                                    <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                                      {t("icon_sell", "sell")}
                                    </span>
                                    <span className="text-[var(--subtext)]">
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
                      <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center opacity-50 space-y-4 shadow-inner">
                        <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)]">
                          {t("icon_history", "history")}
                        </span>
                        <div className="text-sm font-black capitalize tracking-widest text-[var(--text)]">
                          {t("no_recent_telemetry", "No Recent Telemetry")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links", "Quick Links")} icon={t("icon_bolt", "bolt")}>
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenQuickLink
                    icon={t("icon_science", "science")}
                    title={t("launch_blueprints", "Launch {Blueprints}")}
                    subtitle={t("initialize_test_runs", "Initialize Test Runs")}
                    onClick={() => setActiveTab("BUILDER")}
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_terminal", "terminal")}
                    title={t("tab_lab_reports", "Lab Reports")}
                    subtitle={t("all_telemetry_logs", "All Telemetry Logs")}
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("all");
                    }}
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_check_circle", "check_circle")}
                    title={t("recent_pass_tests", "Recent Pass Tests")}
                    subtitle={t("filter_by_stable", "Filter by Stable")}
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("pass");
                    }}
                    textColorClass="text-[var(--success)]"
                    hoverTextColorClass="group-hover:text-[var(--success)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon={t("icon_warning", "warning")}
                    title={t("recent_failed_tests", "Recent Failed Tests")}
                    subtitle={t("filter_by_fatal", "Filter by Fatal")}
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("fail");
                    }}
                    textColorClass="text-[var(--danger)]"
                    hoverTextColorClass="group-hover:text-[var(--danger)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                  />

                  {/* DEDICATED LAB TEST SAVE CONFIGURATOR */}
                  <button
                    type="button"
                    onClick={() => setShowTestSaveModal(true)}
                    className={`w-full p-5 glass-panel rounded-2xl transition duration-500 text-left group relative h-24 shadow-md cursor-pointer ${
                      testSaveStatus?.has_test_save
                        ? "border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        : "border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center gap-4 h-full relative z-10">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 bg-transparent border ${
                          testSaveStatus?.has_test_save
                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[26px]">
                          {t("icon_save", "save")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                        <h3 className="text-[11px] font-[900] uppercase tracking-widest truncate text-[var(--text)] m-0">
                          {testSaveStatus?.has_test_save
                            ? t("lab_test_save_title", "Dedicated Lab Test Save")
                            : t("lab_test_save_unconfigured_title", "First-Time Lab Save Setup")}
                        </h3>
                        <span
                          className={`text-[9px] font-bold tracking-wider flex items-center gap-1.5 truncate ${
                            testSaveStatus?.has_test_save
                              ? "text-[var(--accent)]"
                              : "text-[var(--warning)]"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              testSaveStatus?.has_test_save
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--warning)]"
                            }`}
                          />
                          {testSaveStatus?.active_test_save
                            ? `${testSaveStatus.active_test_save.file_name} • ${t("lab_test_save_btn_change", "Change Test Save")}`
                            : t("lab_test_save_unconfigured_sub", "No test save configured — click to set up")}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* SAVE AIRGAP SHIELD */}
                  <button
                    type="button"
                    onClick={() => handleToggleAirgap(!airgapStatus.active)}
                    className={`w-full p-5 glass-panel rounded-2xl transition duration-500 text-left group relative h-24 shadow-md cursor-pointer ${
                      airgapStatus.active
                        ? "border border-[color-mix(in_srgb,var(--success)_35%,transparent)]"
                        : "border border-transparent hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
                    }`}
                  >
                    <div
                      className={`absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden ${
                        airgapStatus.active
                          ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                          : "bg-radial-[at_0%_0%] from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent"
                      }`}
                    />
                    <div className="flex items-center gap-4 h-full relative z-10">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 shadow-[inset_0_0_15px_color-mix(in_srgb,var(--text)_5%,transparent)] border ${
                          airgapStatus.active
                            ? "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
                            : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[28px] opacity-80 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_10px_currentColor]">
                          {t("icon_shield_lock", "shield_lock")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                        <h3 className="text-[11px] font-[900] uppercase tracking-widest transition-colors duration-500 truncate text-[var(--text)] group-hover:brightness-125 m-0">
                          {t("lab_save_airgap_title", "Save Airgap Shield")}
                        </h3>
                        <span
                          className={`text-[9px] capitalize font-bold opacity-80 group-hover:opacity-100 transition-opacity duration-500 tracking-widest flex items-center gap-1.5 truncate ${
                            airgapStatus.active
                              ? "text-[var(--success)]"
                              : "text-[var(--subtext)]"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              airgapStatus.active
                                ? "bg-[var(--success)]"
                                : "bg-[var(--accent)]"
                            }`}
                          />
                          {airgapStatus.active
                            ? t("lab_btn_restore_saves", "Restore Live Saves")
                            : t("lab_btn_engage_airgap", "Engage Save Airgap")}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* EXTERNAL PROGRAM LINKER */}
                  <div
                    onClick={
                      linkedTool
                        ? handleLaunchExternalToolStandalone
                        : handleLinkExternalTool
                    }
                    className={`w-full p-5 glass-panel rounded-2xl transition duration-500 text-left group relative h-24 shadow-md cursor-pointer ${
                      linkedTool
                        ? "border border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        : "border border-transparent hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]"
                    }`}
                  >
                    <div className="absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden bg-radial-[at_0%_0%] from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
                    <div className="flex items-center gap-4 h-full relative z-10">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 shadow-[inset_0_0_15px_color-mix(in_srgb,var(--text)_5%,transparent)] border ${
                          linkedTool
                            ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                            : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] group-hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[28px] opacity-80 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_10px_currentColor]">
                          {linkedTool
                            ? t("icon_launch", "rocket_launch")
                            : t("icon_build_circle", "build_circle")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                        <h3 className="text-[11px] font-[900] uppercase tracking-widest transition-colors duration-500 truncate text-[var(--text)] group-hover:brightness-125 m-0">
                          {linkedTool
                            ? linkedTool.name
                            : t("lab_external_tool_title", "External Test Program")}
                        </h3>
                        <span className="text-[9px] capitalize font-bold opacity-70 group-hover:opacity-100 transition-opacity duration-500 tracking-widest flex items-center gap-2 truncate text-[var(--subtext)]">
                          {linkedTool
                            ? t("lab_btn_launch_tool", "Launch Linked Tool")
                            : t("lab_btn_link_tool", "Link External Program")}
                        </span>
                      </div>
                      {linkedTool && (
                        <div
                          className="flex items-center gap-1.5 shrink-0 ml-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={handleLinkExternalTool}
                            title={t("lab_btn_change_tool", "Change Tool")}
                            className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_folder_open", "folder_open")}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleUnlinkExternalTool}
                            title={t("nav_unlink", "Unlink")}
                            className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_link_off", "link_off")}
                            </span>
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

      {activeTab === "BUILDER" && (
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full mt-2 pb-32">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-8 w-full max-w-[1600px] mx-auto">
            {/* LEFT COLUMN: THE CORE (SUBJECT) */}
            <div className="flex flex-col gap-6 h-full">
              <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative flex flex-col flex-1 min-h-[500px] group">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-50 pointer-events-none" />

                <div className="flex flex-col items-center justify-center text-center p-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10">
                  <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shrink-0 mb-4 shadow-md">
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[40px] animate-pulse">
                      {t("icon_science", "science")}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-[var(--text)] capitalize tracking-[0.2em]">
                    {t("mount_subject", "Mount Hash Subject")}
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 mt-2">
                    {t("mount_desc", "Select a primary File Hash signature to begin the simulation sequence.")}
                  </p>
                </div>

                <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                  {!activeLabMod ? (
                    <ModSearchDropdown
                      modList={builderBaseMods}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        memoryDismissedRef.current = false;
                        setActiveLabMod(m);
                      }}
                      onClear={() => { }}
                      placeholder={t("filter_dna", "Filter File Hash signatures...")}
                    />
                  ) : (
                    <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-2xl shadow-md flex flex-col items-center text-center group/core h-full justify-center">
                      <div className="absolute inset-0 rounded-[inherit] border-[2px] border-dashed border-[var(--accent)] opacity-20  animate-[spin_20s_linear_infinite] pointer-events-none scale-150" />
                      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-10 blur-[50px] rounded-full pointer-events-none" />

                      <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] drop-shadow-md mb-6">
                        view_in_ar
                      </span>

                      <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                        <span className={`${VAULT_CHIP_CLASS} mx-auto`}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                            {t("icon_science", "science")}
                          </span>
                          <span className="text-[var(--accent)]">
                            {t("subject_isolation", "Subject Isolation")}
                          </span>
                        </span>
                        <span className="text-2xl font-black text-[var(--text)] break-words mt-4">
                          {getModName(activeLabMod)}
                        </span>
                      </div>

                      <div className="mt-8 relative z-10">
                        <ActionButton
                          icon="close"
                          label={t("lab_btn_abort", "Abort / Dismount Subject")}
                          onClick={abortLab}
                          className="!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MODIFIERS */}
            <div className="flex flex-col gap-8 h-full">
              {/* SYMBIOTIC GRID */}
              <div
                className={`glass-panel p-8 rounded-2xl border shadow-xl relative flex flex-col flex-1 min-h-[300px] transition-all ${!activeLabMod ? "opacity-30 pointer-events-none border-[color-mix(in_srgb,var(--text)_5%,transparent)] grayscale" : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"}`}
              >
                <CommandScreenSectionHeading
                  shape="circle"
                  title={t("symbiotic_deps", "Symbiotic Dependencies")}
                  subtitle={t("symbiotic_desc", "These {mods} will be injected into the simulation alongside the primary subject.")}
                  icon="folder"
                  colorClass=""
                  iconColorClass="text-[var(--text)] opacity-80"
                  className="mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 relative z-10 w-full"
                />

                <div className="relative z-20 mb-6 flex-none">
                  {missingDeps.length > 0 && (
                    <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl p-4 mb-6 flex flex-col gap-2 shadow-md">
                      <div className="flex items-center gap-2 text-[var(--danger)] font-black text-xs capitalize tracking-widest">
                        <span className="material-symbols-outlined !text-[16px]">
                          warning
                        </span>
                        {t("missing_deps", "Missing Dependencies")}
                      </div>
                      <div className="text-[10px] text-[color-mix(in_srgb,var(--danger)_80%,transparent)] capitalize font-bold">
                        {t("missing_deps_warning_desc", "The test will likely fail because the following dependencies were not found in your vault:")}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {missingDeps.map((depObj, idx) => {
                          const depName =
                            typeof depObj === "string"
                              ? depObj
                              : depObj.displayName ||
                              depObj.name ||
                              "Unknown Mod";
                          const depId =
                            typeof depObj === "string" ? null : depObj.id;
                          return (
                            <span
                              key={depId || idx}
                              onClick={async () => {
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
                                    .map((t: string) => t.trim())
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
                                    description:
                                      "Artifact not found in the global registry.",
                                  });
                                }
                              }}
                              className="text-[10px] bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] px-2.5 py-1 rounded-lg font-mono text-[var(--danger)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] transition-all inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined !text-[12px]">
                                warning
                              </span>
                              {depName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <ModSearchDropdown
                    modList={builderSymbioticMods}
                    selectedItem={null}
                    onSelect={(m: any) => {
                      if (m && !stagedExtras.find((e) => e.hash === m.hash))
                        setStagedExtras([...stagedExtras, m]);
                    }}
                    onClear={() => { }}
                    placeholder={t("add_extra", "Add extra dependency...")}
                  />
                </div>

                {stagedExtras.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max relative z-10">
                    {stagedExtras.map((m: any) => (
                      <div
                        key={m.hash}
                        className="flex justify-start items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all group/item shadow-sm h-[60px]"
                      >
                        <span className="text-[11px] font-black text-[var(--text)] truncate pr-4 flex-1 min-w-0">
                          {getModName(m)}
                        </span>
                        <button
                          onClick={() =>
                            setStagedExtras(
                              stagedExtras.filter((e) => e.hash !== m.hash),
                            )
                          }
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_close", "close")}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full flex-1 min-h-[100px] mt-2 flex items-center justify-center border-2 border-dashed border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl bg-black/20 text-[var(--subtext)] opacity-50 font-black text-[10px] capitalize tracking-widest relative z-10">
                    NO SYMBIOTIC ENTITIES LOADED
                  </div>
                )}
              </div>

              {/* ADVERSARIAL GRID */}
              <div
                className={`glass-panel p-8 rounded-2xl border shadow-xl relative flex flex-col flex-1 min-h-[300px] transition-all ${!activeLabMod ? "opacity-30 pointer-events-none border-[color-mix(in_srgb,var(--text)_5%,transparent)] grayscale" : "border-[color-mix(in_srgb,var(--warning)_20%,transparent)]"}`}
              >
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--warning)_5%,transparent)] to-transparent opacity-50  pointer-events-none" />
                <CommandScreenSectionHeading
                  shape="circle"
                  title={t("adversarial_entities", "Adversarial Entities")}
                  subtitle={t("adversarial_desc", "These {mods} will be pitted against the primary subject to monitor structural clashes.")}
                  icon="warning"
                  colorClass=""
                  iconColorClass="theme-text-warning opacity-90 animate-pulse"
                  className="mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 relative z-10 w-full flex-none"
                />

                <div className="relative z-20 mb-6 flex-none">
                  {!conflictTarget ? (
                    <ModSearchDropdown
                      modList={builderPrimaryAdversaryMods}
                      selectedItem={conflictTarget}
                      onSelect={setConflictTarget}
                      onClear={() => setConflictTarget(null)}
                      placeholder={t("select_adversary", "Select Adversary...")}
                    />
                  ) : (
                    <ModSearchDropdown
                      modList={builderExtraAdversaryMods}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        if (m && !conflictExtras.find((e) => e.hash === m.hash))
                          setConflictExtras([...conflictExtras, m]);
                      }}
                      onClear={() => { }}
                      placeholder={t("add_extra", "Add extra dependency...")}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-4 relative z-10 flex-1">
                  {conflictTarget ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
                      <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] p-4 rounded-xl shadow-md flex justify-start items-center group md:col-span-2 h-[80px]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--warning)] opacity-10 blur-[30px] rounded-full pointer-events-none" />
                        <div className="flex flex-col gap-1 relative z-10 min-w-0 pr-4">
                          <span className="text-[9px] font-black theme-text-warning capitalize tracking-[0.3em]">
                            {t("primary_adversary", "Primary Adversary")}
                          </span>
                          <span className="text-sm font-black text-[var(--text)] truncate">
                            {getModName(conflictTarget)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setConflictTarget(null);
                            setConflictExtras([]);
                          }}
                          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[var(--danger)] text-[var(--text)] hover:text-white transition-all shadow-md relative z-10"
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_close", "close")}
                          </span>
                        </button>
                      </div>

                      {conflictExtras.map((m: any) => (
                        <div
                          key={m.hash}
                          className="flex justify-start items-center bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] border border-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] transition-all group/item shadow-sm h-[60px]"
                        >
                          <span className="text-[11px] font-black text-[var(--text)] truncate pr-4 flex-1 min-w-0">
                            {getModName(m)}
                          </span>
                          <button
                            onClick={() =>
                              setConflictExtras(
                                conflictExtras.filter((e) => e.hash !== m.hash),
                              )
                            }
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full flex-1 min-h-[100px] mt-4 flex items-center justify-center border-2 border-dashed border-[color-mix(in_srgb,var(--warning)_20%,transparent)] rounded-xl bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] text-[var(--warning)] opacity-70 font-black text-[10px] capitalize tracking-widest relative z-10">
                      NO ADVERSARIAL THREATS DETECTED
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "REPORTS" && (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full h-full min-h-[500px]">
          <CommandScreenSectionHeading
            title={t("tab_lab_reports", "Lab Reports")}
            icon="terminal"
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
                          className={`material-symbols-outlined !text-[12px] ${
                            isError ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {isError ? t("icon_warning", "warning") : t("icon_check_circle", "check_circle")}
                        </span>
                        <span className={isError ? "text-rose-400" : "text-emerald-400"}>
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
                        <span className="font-mono text-[var(--accent)]">
                          {`Lab_Report_${cardReportNum}`}
                        </span>
                      </span>
                      {modExt && (
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                            {t("icon_deployed_code", "deployed_code")}
                          </span>
                          <span className="text-[var(--subtext)]">{modExt}</span>
                        </span>
                      )}
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                          {t("icon_sell", "sell")}
                        </span>
                        <span className="text-[var(--subtext)]">
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
              <div className="col-span-full flex flex-col items-center justify-center space-y-6 mt-10">
                <div className="opacity-50 flex flex-col items-center justify-center space-y-6">
                  <span className="material-symbols-outlined !text-[80px] text-[var(--subtext)]">
                    terminal
                  </span>
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)]">
                      {t("lab_reports_empty", "No Reports Generated Yet")}
                    </h2>
                    <p className="text-sm font-medium text-[var(--subtext)]">
                      {t("lab_reports_empty_desc", "Run a test in the Environment Builder to generate a report.")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "KNOWN_ERRORS" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-32">
          <KnownErrorRulesManager
            searchQuery={searchLogs}
            canEdit={false}
            severityFilter={knownErrorFilter}
            onSeverityFilterChange={setKnownErrorFilter}
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
            "lastException.txt";

          const activeLogTextToCopy =
            reportLogViewTab === "REAL_LOG"
              ? realLogDisplayContent || ""
              : formattedLabReportText || formatHumanReadableLogText(rawLogData) || "";

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setSelectedReport(null)}
              title={<span className="normal-case font-mono">{`Lab_Report_${reportNum}`}</span>}
              subtitle={`${isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection")} • ${t("tab_lab_reports", "Lab Reports")}`}
              icon={isError ? "warning" : "science"}
              iconColorClass={
                isError ? "text-[var(--danger)]" : "text-[var(--success)]"
              }
              widthClass="w-[90vw] md:w-[820px]"
              headerActions={
                <PanelHeaderGroup>
                  {isError && submitLabReport && (
                    <PanelHeaderButton
                      icon={
                        submitCardState === "done"
                          ? "check_circle"
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
                        ? "check_circle"
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
                  icon={isError ? "warning" : "check_circle"}
                  variant={isError ? "danger" : "success"}
                  badges={[
                    {
                      icon: isError ? "warning" : "check_circle",
                      label: isError ? t("fatal_collision", "Fatal Collision") : t("successful_injection", "Successful Injection"),
                      colorClass: isError
                        ? "text-rose-400 border-rose-500/45"
                        : "text-emerald-400 border-emerald-500/45",
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
                </SidePanelHeroCard>
                {canSecureReport && (
                  <button
                    type="button"
                    onClick={handleConcludeTest}
                    disabled={secureCardState === "working" || secureCardState === "done"}
                    className={`text-left rounded-2xl p-3.5 border transition-all flex items-start gap-3 group cursor-pointer shadow-sm disabled:cursor-default bg-transparent ${
                      secureCardState === "done"
                        ? "border-[var(--success)]"
                        : isError
                          ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_8%,transparent)]"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-transparent ${
                        secureCardState === "done"
                          ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                          : isError
                            ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                            : "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[18px] ${
                          secureCardState === "working" ? "animate-spin" : ""
                        }`}
                      >
                        {secureCardState === "done"
                          ? "check_circle"
                          : secureCardState === "working"
                            ? t("icon_sync", "sync")
                            : isError
                              ? "shield"
                              : "verified_user"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-black uppercase tracking-wider ${
                            secureCardState === "done"
                              ? "text-[var(--success)]"
                              : isError
                                ? "text-[var(--danger)]"
                                : "text-[var(--success)]"
                          }`}
                        >
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
                          className={`material-symbols-outlined !text-[15px] transition-all ${
                            secureCardState === "done"
                              ? "text-[var(--success)] opacity-100"
                              : `opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 ${
                                  isError ? "text-[var(--danger)]" : "text-[var(--success)]"
                                }`
                          }`}
                        >
                          {secureCardState === "done"
                            ? "check_circle"
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
                          extension
                        </span>
                        {t("lab_report_deps_loaded_title", "Dependencies Loaded for Test")}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
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
                                extension
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

                  <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                          warning
                        </span>
                        {t("lab_report_conflicts_loaded_title", "Conflicts Loaded for Test")}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--warning)]">
                        {reportConflicts.length}
                      </span>
                    </div>
                    {reportConflicts.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {resolvedConflictTarget && (
                          <div className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--danger)_4%,transparent)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] shrink-0">
                                warning
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(resolvedConflictTarget)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--danger)] shrink-0">
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
                            className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--warning)] shrink-0">
                                extension
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(m)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--warning)] shrink-0">
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

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[12px]">
                          verified_user
                        </span>
                        {t("lab_report_pii_scrubbed_badge", "USER DATA SCRUBBED")}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          if (!activeLogTextToCopy) return;
                          navigator.clipboard?.writeText(activeLogTextToCopy);
                          setCopiedLogState(true);
                          setTimeout(() => setCopiedLogState(false), 1800);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {copiedLogState
                            ? "check"
                            : t("icon_content_copy", "content_copy")}
                        </span>
                        {copiedLogState
                          ? t("copied", "Copied")
                          : t("lab_report_copy_btn", "Copy Log")}
                      </button>
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
          icon="science"
          iconColorClass="text-[var(--accent)]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon="science"
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
                  label: t("lab_badge_saves_airgapped", "SAVES AIRGAPPED (SANDBOX ACTIVE)"),
                  colorClass: "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_45%,transparent)]",
                },
              ]}
            >
              {linkedTool && (
                <button
                  type="button"
                  onClick={handleLaunchExternalToolStandalone}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-transparent text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all inline-flex items-center gap-1.5 cursor-pointer w-fit"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_launch", "launch")}
                  </span>
                  {`${t("lab_btn_launch_tool", "Launch Tool (Isolated)")} (${linkedTool.name})`}
                </button>
              )}
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
                  : t("lab_test_save_none_badge", "CLEAN SANDBOX (CREATE SAVE IN-GAME)")
              }
              subtitle={t("lab_test_save_active_sub", "Only active while Lab is running")}
              label={t("lab_test_save_current_label", "Active Lab Test Save")}
              icon={testSaveStatus?.has_test_save ? "verified_user" : t("icon_save", "save")}
              variant={testSaveStatus?.has_test_save ? "success" : "warning"}
              badges={[
                {
                  icon: testSaveStatus?.has_test_save ? "check_circle" : "science",
                  label: testSaveStatus?.has_test_save
                    ? t("lab_test_save_active_badge", "ISOLATED TEST SAVE READY")
                    : t("lab_test_save_none_badge", "CLEAN SANDBOX (CREATE SAVE IN-GAME)"),
                  colorClass: testSaveStatus?.has_test_save
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
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

              <div className="flex items-center gap-2.5 flex-wrap pt-1">
                <button
                  type="button"
                  disabled={isConfiguringSave}
                  onClick={() => handleResetForFreshSave(false)}
                  className="px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_save", "save")}
                  </span>
                  {t(
                    "lab_test_save_btn_use_fresh",
                    "Use Clean Sandbox (Create Save In-Game)"
                  )}
                </button>

                <button
                  type="button"
                  disabled={isConfiguringSave}
                  onClick={() => handleResetForFreshSave(true)}
                  className="px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)] bg-transparent hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_launch", "rocket_launch")}
                  </span>
                  {t(
                    "lab_test_save_btn_launch_create",
                    "Launch Game Now to Create Test Save"
                  )}
                </button>
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
                        className={`glass-surface rounded-xl p-3 border flex items-center justify-between gap-3 transition-all ${
                          isCurrentActive
                            ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`material-symbols-outlined !text-[18px] shrink-0 ${
                              isCurrentActive
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
                              {`${(saveItem.size_kb / 1024).toFixed(1)} MB • ${
                                saveItem.modified_epoch
                                  ? new Date(
                                      saveItem.modified_epoch * 1000
                                    ).toLocaleString()
                                  : ""
                              }`}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isConfiguringSave}
                          onClick={() => handleCopyLiveSaveForLab(saveItem.file_name)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-transparent transition-all flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 ${
                            isCurrentActive
                              ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                              : "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[12px]">
                            {isCurrentActive ? "check_circle" : "content_copy"}
                          </span>
                          {isCurrentActive
                            ? t("lab_test_save_btn_active", "Active Test Save")
                            : t("lab_test_save_btn_use_this", "Set as Test Save")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--subtext)] text-center">
                  {t(
                    "lab_test_save_no_live_saves",
                    "No existing .save files found in your game saves folder. Use the option above to create a new test save in-game."
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
