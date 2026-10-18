import React, { useState, useEffect, useRef } from "react";
import { useLexicon } from "./LexiconContext";
import {
  ViewHeader,
  ModSearchDropdown,
  CustomDropdown,
  ActionButton,
  FilterTabs,
  FilterTabButton,
  SidePanel,
  getExtensionRegex,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  GlassSegmentedControl,
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
import { useStore } from "./store";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import {
  LabVerificationGate,
  LabVerificationBadge,
  LabVerificationStatus,
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
  formatModWithExtAndVersion,
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

  const refreshAirgapStatus = async () => {
    try {
      const res: any = await invoke("get_airgap_status", {
        docsPath: docsPath || modsPath || "",
      });
      if (res) {
        setAirgapStatus(res);
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

          recordRealTestEntry({
            id: `cloud_${log.id}`,
            sessionKey: `cloud_${log.id}`,
            mod: modObj,
            errorFound: true,
            verified: false,
            time: log.created_at || new Date().toISOString(),
            logSnippet: snippet,
            conflictTarget: parsedConflictTarget,
            stagedExtras: parsedStagedExtras,
            conflictExtras: parsedConflictExtras,
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

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (memoryDismissedRef.current) return;
      try {
        const st = await invoke<LabVerificationStatus | null>("poll_lab_verification_session");
        if (mounted && st && !memoryDismissedRef.current) {
          setLabSessionStatus(st);
          if (st.stage === "VERIFIED" && st.certificate) {
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
          } else if (
            st.stage === "FAILED" &&
            st.error_log &&
            activeLabMod &&
            !isUnrelatedGameBugLog(st.error_log, activeGameSchema)
          ) {
            const scrubbedErr = scrubLogUserData(st.error_log);
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
        } else if (mounted && !shelterActive) {
          const mem = loadLabSessionMemory();
          if (!mem?.active) {
            setLabSessionStatus(null);
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
  }, [shelterActive, activeLabMod]);

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

    const cleanName = (name: string) =>
      name
        ? name
          .replace(/['"]/g, "")
          .replace(/_/g, " ")
          .replace(getExtensionRegex(activeGameSchema), "")
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
          const found = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash)
              return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name)
              return false;

            if (!m.name) return false;

            const isDBScript = depName.toLowerCase().includes("script");
            const isLocalScript = m.name.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            return (
              cleanName(m.name) === cleanName(depName) ||
              cleanName(m.displayName) === cleanName(depName) ||
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
      const extraDeps = associatedMods
        .map((am: any) => {
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

            const isDBScript =
              (am.file_extension &&
                am.file_extension.toLowerCase().includes("script")) ||
              (am.name && am.name.toLowerCase().includes("script"));
            const isLocalScript =
              m.name && m.name.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            const cleanName = (name: string) =>
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
            if (cleanName(m.displayName || m.name) === cleanName(am.name))
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
  }, [activeLabMod, associatedMods, modList]);

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

        const finalLabReport = buildFormattedLabReportText({
          reportNumber: reportNum,
          date: selectedReport?.time
            ? new Date(selectedReport.time).toLocaleString()
            : new Date().toLocaleString(),
          gameVersion: selectedVersion || "Local",
          targetMod: reportTarget,
          conflictTarget: selectedReport ? selectedReport.conflictTarget : conflictTarget,
          stagedExtras: selectedReport ? selectedReport.stagedExtras : stagedExtras,
          conflictExtras: selectedReport ? selectedReport.conflictExtras : conflictExtras,
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

  const runCombinedHotSwap = async (customToolPath?: string) => {
    memoryDismissedRef.current = false;
    const extraNames = [...stagedExtras, ...conflictExtras].map((m) => m.name);
    await executeHotSwap(extraNames, customToolPath);
    await refreshAirgapStatus();
    setShowTestPanel(true);
  };

  const getModName = (mod: any, extraDeps?: any[]) => {
    if (!mod) return "UNKNOWN";
    const resolved = resolveRealReportMod(mod, extraDeps, modList);
    return formatModWithExtAndVersion(
      resolved,
      activeGameSchema,
      modList,
      extraDeps
    );
  };

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
    lastTest: testHistory.length > 0 ? t("time_just_now") : "--",
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

  if (activeTab === "BUILDER" && activeLabMod) {
    if (!shelterActive) {
      headerPillActions.push({
        id: "initiate_swap",
        icon: "bolt",
        label: t("btn_initiate_swap") as string,
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
        label: t("btn_view_test") as string,
        onClick: () => setShowTestPanel(true),
        activeClassName: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]",
      });
    }
  }

  const showHeaderSearch = activeTab === "REPORTS" || activeTab === "KNOWN_ERRORS";

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full relative z-10 pr-4">
      <ViewHeader
        title={t("lab_title")}
        subtitle={t("lab_subtitle")}
        icon={t("icon_science")}
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
                {t("payload")}
              </span>
              <span className="text-xs font-black text-[var(--text)] tracking-widest capitalize">
                {t("core_plus")}
                {stagedExtras.length +
                  (conflictTarget ? 1 : 0) +
                  conflictExtras.length}
                {t("injected")}
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
                  : (t("search_logs") as string)
              }
              actions={headerPillActions}
            />
          )}
        </div>
      </ViewHeader>

      <div className="flex flex-col w-full gap-3 mb-6">
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon="dashboard"
            label={t("overview")}
            number=""
            onClick={() => setActiveTab("DASHBOARD")}
            isActive={activeTab === "DASHBOARD"}
          />
          <DashboardStatTile
            variant="tab"
            icon="science"
            label={t("tab_lab_builder")}
            number={modList?.length || 0}
            onClick={() => setActiveTab("BUILDER")}
            isActive={activeTab === "BUILDER"}
          />
          <DashboardStatTile
            variant="tab"
            icon="terminal"
            label={t("tab_lab_reports")}
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
      
        {activeTab === "REPORTS" && (
          <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
            <StatTileCarousel>
              <DashboardStatTile
                variant="filter"
                icon="list"
                label={t("ql_all") || "All"}
                number={reportsToList.length}
                onClick={() => setLogFilter("all")}
                isActive={logFilter === "all"}
              />
              <DashboardStatTile
                variant="filter"
                icon="check_circle"
                label={t("verified") || "Stable"}
                colorClass="text-[var(--success)]"
                number={realStats.passed}
                onClick={() => setLogFilter("pass")}
                isActive={logFilter === "pass"}
              />
              <DashboardStatTile
                variant="filter"
                icon="warning"
                label={t("fatal") || "Fatal"}
                colorClass="text-[var(--danger)]"
                number={realStats.failed}
                onClick={() => setLogFilter("fail")}
                isActive={logFilter === "fail"}
              />
            </StatTileCarousel>
          </div>
        )}

        {activeTab === "KNOWN_ERRORS" && (
          <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
            <StatTileCarousel>
              <DashboardStatTile
                variant="filter"
                icon={t("icon_psychology", "psychology")}
                label={t("ql_all", "All")}
                number={spokeExceptionRulesCount}
                onClick={() => setKnownErrorFilter("all")}
                isActive={knownErrorFilter === "all"}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_gpp_maybe", "gpp_maybe")}
                label={t("exc_rules_filter_corrupted", "Corrupted")}
                colorClass="text-[var(--danger)]"
                number={knownErrorCounts.corrupted}
                onClick={() =>
                  setKnownErrorFilter(knownErrorFilter === "corrupted" ? "all" : "corrupted")
                }
                isActive={knownErrorFilter === "corrupted"}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_warning", "warning")}
                label={t("exc_rules_filter_unstable", "Unstable")}
                colorClass="text-[var(--warning)]"
                number={knownErrorCounts.unstable}
                onClick={() =>
                  setKnownErrorFilter(knownErrorFilter === "unstable" ? "all" : "unstable")
                }
                isActive={knownErrorFilter === "unstable"}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_bug_report", "bug_report")}
                label={t("exc_rules_filter_unrelated", "Unrelated")}
                colorClass="text-[var(--success)]"
                number={knownErrorCounts.unrelated}
                onClick={() =>
                  setKnownErrorFilter(knownErrorFilter === "unrelated" ? "all" : "unrelated")
                }
                isActive={knownErrorFilter === "unrelated"}
              />
            </StatTileCarousel>
          </div>
        )}
      </div>

      {activeTab === "DASHBOARD" && (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
          <div className="flex flex-col gap-10 w-full">
            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading
                    title={t("recent_tests_title")}
                    icon="history"
                  />
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4">
                    {testHistory.length > 0 ? (
                      testHistory
                        .slice(0, 10)
                        .map((test: any, index: number) => (
                          <UniversalCard
                            key={test.id || index}
                            onClick={() => setSelectedReport(test)}
                            layout="vertical"
                            icon={test.errorFound ? "warning" : "check_circle"}
                            statusColor={
                              test.errorFound
                                ? "border-rose-500"
                                : "border-emerald-500"
                            }
                            title={
                              test.mod
                                ? getModName(test.mod, test.stagedExtras)
                                : t("ecosystem_forge")
                            }
                            subtitle={
                              test.conflictTarget
                                ? `vs ${getModName(test.conflictTarget)}`
                                : t("target_engine_core")
                            }
                            badges={[
                              <span
                                key="status"
                                className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner ${test.errorFound ? "text-rose-500 border-rose-500/30 bg-rose-500/10" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"}`}
                              >
                                {test.errorFound
                                  ? t("fatal_collision")
                                  : t("successful_injection")}
                              </span>,
                              <span
                                key="time"
                                className="ml-auto text-[10px] font-bold opacity-50"
                              >
                                {new Date(test.time).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>,
                            ]}
                          />
                        ))
                    ) : (
                      <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center opacity-50 space-y-4 shadow-inner">
                        <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)]">
                          history
                        </span>
                        <div className="text-sm font-black capitalize tracking-widest text-[var(--text)]">
                          {t("no_recent_telemetry")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links")} icon="bolt">
                <div className="flex flex-col gap-4 w-full">
                  <CommandScreenQuickLink
                    icon="science"
                    title="Launch Blueprints"
                    subtitle="Initialize Test Runs"
                    onClick={() => setActiveTab("BUILDER")}
                  />
                  <CommandScreenQuickLink
                    icon="terminal"
                    title={t("tab_lab_reports")}
                    subtitle="All Telemetry Logs"
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("all");
                    }}
                  />
                  <CommandScreenQuickLink
                    icon="check_circle"
                    title="Recent Pass Tests"
                    subtitle="Filter by Stable"
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("pass");
                    }}
                    textColorClass="text-[var(--success)]"
                    hoverTextColorClass="group-hover:text-[var(--success)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon="warning"
                    title="Recent Failed Tests"
                    subtitle="Filter by Fatal"
                    onClick={() => {
                      setActiveTab("REPORTS");
                      setLogFilter("fail");
                    }}
                    textColorClass="text-[var(--danger)]"
                    hoverTextColorClass="group-hover:text-[var(--danger)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                  />

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
                            title={t("lab_btn_unlink_tool", "Unlink")}
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
                      {t("icon_science")}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-[var(--text)] capitalize tracking-[0.2em]">
                    {t("mount_subject")}
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 mt-2">
                    {t("mount_desc")}
                  </p>
                </div>

                <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                  {!activeLabMod ? (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual)}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        memoryDismissedRef.current = false;
                        setActiveLabMod(m);
                      }}
                      onClear={() => { }}
                      placeholder={t("filter_dna")}
                    />
                  ) : (
                    <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-2xl shadow-md flex flex-col items-center text-center group/core h-full justify-center">
                      <div className="absolute inset-0 rounded-[inherit] border-[2px] border-dashed border-[var(--accent)] opacity-20  animate-[spin_20s_linear_infinite] pointer-events-none scale-150" />
                      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-10 blur-[50px] rounded-full pointer-events-none" />

                      <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] drop-shadow-md mb-6">
                        view_in_ar
                      </span>

                      <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                        <span className="text-[10px] font-black text-[var(--accent)] capitalize tracking-[0.3em] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] py-1 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-max mx-auto px-4">
                          {t("subject_isolation")}
                        </span>
                        <span className="text-2xl font-black text-[var(--text)] break-words mt-4">
                          {getModName(activeLabMod)}
                        </span>
                      </div>

                      <div className="mt-8 relative z-10">
                        <ActionButton
                          icon="close"
                          label={t("lab_btn_abort")}
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
                  title={t("symbiotic_deps")}
                  subtitle={t("symbiotic_desc")}
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
                        {t("missing_symbiotic_deps")}
                      </div>
                      <div className="text-[10px] text-[color-mix(in_srgb,var(--danger)_80%,transparent)] capitalize font-bold">
                        {t("missing_deps_warning_desc")}
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
                              className="text-[10px] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-2 py-1 rounded font-mono text-[var(--danger)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-white transition-all"
                            >
                              {depName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <ModSearchDropdown
                    modList={modList.filter(
                      (m: any) =>
                        !m.isVirtual &&
                        m.hash !== activeLabMod?.hash &&
                        !conflictExtras.find((e) => e.hash === m.hash),
                    )}
                    selectedItem={null}
                    onSelect={(m: any) => {
                      if (m && !stagedExtras.find((e) => e.hash === m.hash))
                        setStagedExtras([...stagedExtras, m]);
                    }}
                    onClear={() => { }}
                    placeholder={t("add_extra")}
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
                            {t("icon_close")}
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
                  title={t("adversarial_entities")}
                  subtitle={t("adversarial_desc")}
                  icon="warning"
                  colorClass=""
                  iconColorClass="theme-text-warning opacity-90 animate-pulse"
                  className="mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 relative z-10 w-full flex-none"
                />

                <div className="relative z-20 mb-6 flex-none">
                  {!conflictTarget ? (
                    <ModSearchDropdown
                      modList={modList
                        .filter(
                          (m: any) =>
                            !m.isVirtual && m.hash !== activeLabMod?.hash,
                        )
                        .map((m: any) => ({
                          ...m,
                          displayName: getModName(m),
                        }))}
                      selectedItem={conflictTarget}
                      onSelect={setConflictTarget}
                      onClear={() => setConflictTarget(null)}
                      placeholder={t("select_adversary")}
                    />
                  ) : (
                    <ModSearchDropdown
                      modList={modList.filter(
                        (m: any) =>
                          !m.isVirtual &&
                          m.hash !== activeLabMod?.hash &&
                          m.hash !== conflictTarget?.hash &&
                          !stagedExtras.find((e) => e.hash === m.hash),
                      )}
                      selectedItem={null}
                      onSelect={(m: any) => {
                        if (m && !conflictExtras.find((e) => e.hash === m.hash))
                          setConflictExtras([...conflictExtras, m]);
                      }}
                      onClear={() => { }}
                      placeholder={t("add_extra")}
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
                            {t("primary_adversary")}
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
                            {t("icon_close")}
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
                              {t("icon_close")}
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
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full h-full min-h-[500px]">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-32">
            {filteredReports.map((report: any) => {
              const isError = report.errorFound;
              const cardReportNum = resolveLabReportNumber(report, reportsToList);
              const resolvedCardMod = resolveRealReportMod(
                report.mod,
                report.stagedExtras,
                modList
              );
              return (
                <UniversalCard
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  layout="vertical"
                  icon={isError ? "warning" : "check_circle"}
                  statusColor={
                    isError ? "border-rose-500" : "border-emerald-500"
                  }
                  title={getModName(resolvedCardMod, report.stagedExtras)}
                  subtitle={
                    report.conflictTarget
                      ? `vs ${getModName(report.conflictTarget)}`
                      : t("target_engine_core")
                  }
                  badges={[
                    <span
                      key="report-num"
                      className="px-2 py-1 rounded-lg text-[9px] font-black tracking-widest border shadow-inner border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] font-mono"
                    >
                      {`Lab_Report_${cardReportNum}`}
                    </span>,
                    <span
                      key="status"
                      className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner ${isError ? "text-rose-500 border-rose-500/30 bg-rose-500/10" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"}`}
                    >
                      {isError
                        ? t("fatal_collision")
                        : t("successful_injection")}
                    </span>,
                    <span
                      key="game-version"
                      className="px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner border-[var(--text)]/10 text-[var(--subtext)]"
                    >
                      {selectedVersion || "vLocal"}
                    </span>,
                    <span
                      key="mod-version"
                      className="px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner border-[var(--text)]/10 text-[var(--subtext)]"
                    >
                      M: {getModVersionLabel(resolvedCardMod, modList, report.stagedExtras)}
                    </span>,
                    report.isConcluding && (
                      <span
                        key="pending"
                        className="ml-auto text-[10px] font-bold opacity-50 text-amber-400 animate-pulse"
                      >
                        {t("status_pending_review")}
                      </span>
                    ),
                  ]}
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
                      {t("lab_reports_empty")}
                    </h2>
                    <p className="text-sm font-medium text-[var(--subtext)]">
                      {t("lab_reports_empty_desc")}
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
          const reportStagedDeps = (selectedReport.stagedExtras || []).map((m: any) =>
            resolveRealReportMod(m, undefined, modList)
          );
          const resolvedTargetMod = resolveRealReportMod(
            selectedReport.mod,
            reportStagedDeps,
            modList
          );
          const reportConflicts = [
            ...(selectedReport.conflictTarget ? [selectedReport.conflictTarget] : []),
            ...(selectedReport.conflictExtras || []),
          ];

          const formattedLabReportText = buildFormattedLabReportText({
            reportNumber: reportNum,
            date: selectedReport.time
              ? new Date(selectedReport.time).toLocaleString()
              : new Date().toLocaleString(),
            gameVersion: selectedVersion || "Local",
            targetMod: resolvedTargetMod,
            conflictTarget: selectedReport.conflictTarget,
            stagedExtras: reportStagedDeps,
            conflictExtras: selectedReport.conflictExtras,
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

          return (
            <SidePanel
              isOpen={true}
              onClose={() => setSelectedReport(null)}
              title={<span className="normal-case">{getModName(resolvedTargetMod, selectedReport.stagedExtras)}</span>}
              subtitle={`${isError ? t("status_broken") : t("verified")} • Lab_Report_${reportNum}`}
              icon={isError ? "warning" : "science"}
              iconColorClass={
                isError ? "text-[var(--danger)]" : "text-[var(--success)]"
              }
              widthClass="w-[90vw] md:w-[860px]"
            >
              <div className="flex flex-col gap-6 mt-4 w-full">
                {/* Report Action Cards (replaces header & footer buttons) */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lab_report_actions_heading", "Report Actions & Resolution")}
                  </h3>
                  <div
                    className={`grid grid-cols-1 ${
                      canSecureReport && isError && submitLabReport
                        ? "md:grid-cols-3"
                        : canSecureReport || (isError && submitLabReport)
                          ? "md:grid-cols-2"
                          : "md:grid-cols-1"
                    } gap-3`}
                  >
                    {canSecureReport && (
                      <button
                        type="button"
                        onClick={handleConcludeTest}
                        disabled={secureCardState === "working" || secureCardState === "done"}
                        className={`text-left rounded-2xl p-4 border transition-all flex items-start gap-3.5 group cursor-pointer shadow-sm disabled:cursor-default ${
                          secureCardState === "done"
                            ? "border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_16%,transparent)]"
                            : isError
                              ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] hover:border-[var(--danger)]"
                              : "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_18%,transparent)] hover:border-[var(--success)]"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            secureCardState === "done"
                              ? "bg-[color-mix(in_srgb,var(--success)_22%,transparent)] border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                              : isError
                                ? "bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]"
                                : "bg-[color-mix(in_srgb,var(--success)_18%,transparent)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[20px] ${
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
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-black uppercase tracking-wider ${
                                secureCardState === "done"
                                  ? "text-[var(--success)]"
                                  : isError
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--success)]"
                              }`}
                            >
                              {secureCardState === "done"
                                ? isError
                                  ? t("lab_action_secure_broken_done_title", "Removed From Blueprint")
                                  : t("lab_action_secure_verified_done_title", "Artifact Verified & Restored")
                                : secureCardState === "working"
                                  ? t("lab_action_securing_title", "Securing Sandbox...")
                                  : isError
                                    ? t("lab_action_secure_broken_title", "Secure Corrupted Artifact")
                                    : t("lab_action_secure_verified_title", "Secure Verified Artifact")}
                            </span>
                            <span
                              className={`material-symbols-outlined !text-[16px] transition-all ${
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
                          <p className="text-[11px] text-[var(--subtext)] leading-relaxed">
                            {secureCardState === "done"
                              ? isError
                                ? t(
                                    "lab_action_secure_broken_done_desc",
                                    "Sandbox closed, live saves restored, and mod unequipped from active Blueprint."
                                  )
                                : t(
                                    "lab_action_secure_verified_done_desc",
                                    "Sandbox closed, live saves restored, and mod signed off as verified."
                                  )
                              : isError
                                ? t(
                                    "lab_action_secure_broken_desc",
                                    "End sandbox session, restore live saves, and quarantine or flag this mod."
                                  )
                                : t(
                                    "lab_action_secure_verified_desc",
                                    "End sandbox session, restore live saves, and sign off on this mod as verified."
                                  )}
                          </p>
                        </div>
                      </button>
                    )}

                    {isError && submitLabReport && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (submitCardState === "working" || submitCardState === "done") return;
                          setSubmitCardState("working");
                          const ok = await submitLabReport(selectedReport);
                          setSubmitCardState(ok ? "done" : "error");
                        }}
                        disabled={isSubmittingReport || submitCardState === "working" || submitCardState === "done"}
                        className={`text-left rounded-2xl p-4 border transition-all flex items-start gap-3.5 group cursor-pointer shadow-sm disabled:cursor-default ${
                          submitCardState === "done"
                            ? "border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_16%,transparent)]"
                            : submitCardState === "error"
                              ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] hover:border-[var(--warning)]"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            submitCardState === "done"
                              ? "bg-[color-mix(in_srgb,var(--success)_22%,transparent)] border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                              : submitCardState === "error"
                                ? "bg-[color-mix(in_srgb,var(--danger)_22%,transparent)] border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                                : "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[20px] ${
                              submitCardState === "working" ? "animate-spin" : ""
                            }`}
                          >
                            {submitCardState === "done"
                              ? "check_circle"
                              : submitCardState === "working"
                                ? t("icon_sync", "sync")
                                : submitCardState === "error"
                                  ? t("icon_error", "error")
                                  : t("icon_send", "send")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-black uppercase tracking-wider ${
                                submitCardState === "done"
                                  ? "text-[var(--success)]"
                                  : submitCardState === "error"
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--warning)]"
                              }`}
                            >
                              {submitCardState === "done"
                                ? t("lab_action_submit_diag_done_title", "Submitted To Architect Lab")
                                : submitCardState === "working"
                                  ? t("lab_action_submit_diag_working_title", "Transmitting Telemetry...")
                                  : submitCardState === "error"
                                    ? t("lab_action_submit_diag_error_title", "Transmission Failed — Retry")
                                    : t("lab_action_submit_diag_title", "Submit To Diagnostics")}
                            </span>
                            <span
                              className={`material-symbols-outlined !text-[16px] transition-all ${
                                submitCardState === "done"
                                  ? "text-[var(--success)] opacity-100"
                                  : "text-[var(--warning)] opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5"
                              }`}
                            >
                              {submitCardState === "done"
                                ? "check_circle"
                                : t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--subtext)] leading-relaxed">
                            {submitCardState === "done"
                              ? t(
                                  "lab_action_submit_diag_done_desc",
                                  "Crash report and payload telemetry queued in Spoke Architect Diagnostics."
                                )
                              : t(
                                  "lab_action_submit_diag_desc",
                                  "Transmit this crash report and payload telemetry to the Spoke Diagnostics queue."
                                )}
                          </p>
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleExportLogs}
                      className={`text-left rounded-2xl p-4 border transition-all flex items-start gap-3.5 group cursor-pointer shadow-sm ${
                        downloadCardState === "done"
                          ? "border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_16%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] hover:border-[var(--accent)]"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          downloadCardState === "done"
                            ? "bg-[color-mix(in_srgb,var(--success)_22%,transparent)] border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                            : "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {downloadCardState === "done"
                            ? "check_circle"
                            : t("icon_download", "download")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-black uppercase tracking-wider ${
                              downloadCardState === "done"
                                ? "text-[var(--success)]"
                                : "text-[var(--accent)]"
                            }`}
                          >
                            {downloadCardState === "done"
                              ? t("lab_action_download_done_title", "Report Saved Locally")
                              : t("lab_action_download_title", "Download Report")}
                          </span>
                          <span
                            className={`material-symbols-outlined !text-[16px] transition-all ${
                              downloadCardState === "done"
                                ? "text-[var(--success)] opacity-100"
                                : "text-[var(--accent)] opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5"
                            }`}
                          >
                            {downloadCardState === "done"
                              ? "check_circle"
                              : t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--subtext)] leading-relaxed">
                          {downloadCardState === "done"
                            ? t(
                                "lab_action_download_done_desc_with_real",
                                "Lab_Report_#.txt and scrubbed real game log saved to disk."
                              )
                            : t(
                                "lab_action_download_desc_with_real",
                                "Save Lab_Report_#.txt along with the scrubbed real game log."
                              )}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                      {t("game_version") || "Game Version"}
                    </span>
                    <span className="text-sm font-bold text-[var(--text)]">
                      {selectedVersion || t("vlocal")}
                    </span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                      {t("mod_version") || "Mod Version"}
                    </span>
                    <span className="text-sm font-bold text-[var(--text)]">
                      {getModVersionLabel(resolvedTargetMod, modList, reportStagedDeps)}
                    </span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                      {t("mod_id") || "Mod ID"}
                    </span>
                    <span
                      className="text-xs font-mono text-[var(--text)] truncate"
                      title={resolvedTargetMod?.hash || resolvedTargetMod?.id}
                    >
                      {resolvedTargetMod?.hash ||
                        resolvedTargetMod?.id ||
                        "N/A"}
                    </span>
                  </div>
                  <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[10px] font-black tracking-widest text-[var(--subtext)] capitalize">
                      {t("date_created") || "Time"}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {new Date(selectedReport.time).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h3 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">
                    {t("payload_composition")}
                  </h3>

                  {/* Core Artifact Tested */}
                  <div className="glass-panel rounded-xl p-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center gap-3 relative group">
                    <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-50" />
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[18px] relative z-10">
                      science
                    </span>
                    <span className="text-[var(--text)] text-xs font-bold tracking-widest truncate relative z-10">
                      {getModName(resolvedTargetMod, reportStagedDeps)}
                    </span>
                    <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--accent)] capitalize tracking-widest relative z-10">
                      {t("payload_core")}
                    </span>
                  </div>

                  {/* Explicit Dependencies & Conflicts Loaded for Test */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Dependencies Loaded for Test */}
                    <div className="glass-panel rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
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
                              className="rounded-lg px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[var(--subtext)] !text-[14px]">
                                extension
                              </span>
                              <span className="text-[var(--text)] text-xs font-bold truncate">
                                {getModName(m)}
                              </span>
                              <span className="ml-auto text-[9px] font-black opacity-60 text-[var(--text)] capitalize tracking-widest">
                                {t("payload_injected")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-[var(--subtext)] opacity-60 py-1">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </div>
                      )}
                    </div>

                    {/* Conflicts Loaded for Test */}
                    <div className="glass-panel rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] flex flex-col gap-2.5">
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
                          {selectedReport.conflictTarget && (
                            <div className="rounded-lg px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center gap-2">
                              <span className="material-symbols-outlined text-[var(--danger)] !text-[14px]">
                                warning
                              </span>
                              <span className="text-[var(--text)] text-xs font-bold truncate">
                                {getModName(selectedReport.conflictTarget)}
                              </span>
                              <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--danger)] capitalize tracking-widest">
                                {t("payload_adversary")}
                              </span>
                            </div>
                          )}
                          {selectedReport.conflictExtras?.map((m: any) => (
                            <div
                              key={m.hash || m.name}
                              className="rounded-lg px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[var(--warning)] !text-[14px]">
                                extension
                              </span>
                              <span className="text-[var(--text)] text-xs font-bold truncate">
                                {getModName(m)}
                              </span>
                              <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--warning)] capitalize tracking-widest">
                                {t("payload_injected")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-[var(--subtext)] opacity-60 py-1">
                          {t("lab_report_none_loaded", "None Loaded")}
                        </div>
                      )}
                    </div>
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

                {/* StatTile Switcher: Lab Report Log vs Scrubbed Real Game Log */}
                {hasRealLogContent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
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
                      number={
                        liveRealLogs[0]?.fileName ||
                        liveRealLogs[0]?.file_name ||
                        "lastException.txt"
                      }
                      isActive={reportLogViewTab === "REAL_LOG"}
                      onClick={() => setReportLogViewTab("REAL_LOG")}
                    />
                  </div>
                )}

                <div className="flex-1 min-h-[400px] glass-panel backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-6 font-mono text-[13px] text-[var(--text)] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col mb-10">
                  <div className="flex flex-wrap items-center gap-2.5 mb-5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4 shrink-0">
                    <span className="material-symbols-outlined text-[var(--subtext)] opacity-50 !text-[18px]">
                      {t("icon_terminal")}
                    </span>
                    <span className="text-[var(--subtext)] opacity-70 capitalize tracking-widest text-[11px] font-black">
                      {[
                        reportLogViewTab === "REAL_LOG"
                          ? liveRealLogs[0]?.fileName ||
                            liveRealLogs[0]?.file_name ||
                            "lastException.txt"
                          : `Lab_Report_${reportNum}.txt`,
                        String(t("execution_logs", "Execution Logs")).replace(/^\/\/\s*/, ""),
                        String(t("system_stdout", "System_stdout")).replace(/^\/\/\s*/, ""),
                      ]
                        .filter(Boolean)
                        .join(" // ")}
                    </span>

                    {/* Scrubbed & Stamped Badges */}
                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] flex items-center gap-1">
                      <span className="material-symbols-outlined !text-[12px]">
                        verified_user
                      </span>
                      {t("lab_report_pii_scrubbed_badge", "USER DATA SCRUBBED")}
                    </span>

                    {matchedRules.length > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)] flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[12px]">
                          verified
                        </span>
                        {t("lab_report_known_error_stamp_badge", "KNOWN ERROR STAMPED")}
                      </span>
                    )}

                    {isError && !hasRealLogContent && (
                      <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-[var(--danger)] capitalize tracking-widest bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-3 py-1.5 rounded-lg">
                        <span className="material-symbols-outlined !text-[14px]">
                          warning
                        </span>
                        CRITICAL FAILURE
                      </div>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap break-all leading-relaxed flex-1 opacity-85 font-mono">
                    {reportLogViewTab === "REAL_LOG"
                      ? realLogDisplayContent || t("no_logs")
                      : formattedLabReportText || formatHumanReadableLogText(rawLogData) || t("no_logs")}
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
          title={t("test_underway_title")}
          subtitle={t("test_underway_desc")}
          icon="science"
          iconColorClass="text-[var(--accent)]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon="science"
                tooltip={t("btn_conclude_experiment")}
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
            <div className="glass-surface w-full rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-md relative z-10">
                  <span className="material-symbols-outlined !text-[28px] text-[var(--accent)] animate-pulse drop-shadow-lg">
                    {t("icon_radar", "radar")}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("monitoring_subject")}
                </div>
                <div className="text-sm font-black tracking-wider text-[var(--accent)] truncate">
                  {getModName(activeLabMod)}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] text-[9px] font-black tracking-widest uppercase">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_shield_lock", "shield_lock")}
                    </span>
                    <span>
                      {t("lab_badge_saves_airgapped", "SAVES AIRGAPPED (SANDBOX ACTIVE)")}
                    </span>
                  </div>
                  {linkedTool && (
                    <button
                      type="button"
                      onClick={handleLaunchExternalToolStandalone}
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_launch", "launch")}
                      </span>
                      {`${t("lab_btn_launch_tool", "Launch Tool (Isolated)")} (${linkedTool.name})`}
                    </button>
                  )}
                </div>
              </div>
            </div>

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

            <div className="text-[10px] capitalize font-bold text-[var(--subtext)] tracking-widest text-center">
              {t("test_running_wait")}
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  );
}
