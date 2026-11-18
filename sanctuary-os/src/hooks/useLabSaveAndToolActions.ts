import { useEffect } from "react";
import { getExtensionRegex } from "../shared";
import { useStore } from "../store";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { LabTestSaveStatus, saveLabSessionMemory } from "../components/LabVerificationGate";
import {
  getExceptionRules,
  matchExceptionRules,
  extractSuggestedPatternFromLog,
  isUnrelatedGameBugLog,
} from "../components/KnownExceptionRules";
import {
  scrubLogUserData,
  extractCleanRealLogContent,
  inferRealLogFileName,
  resolveLabReportNumber,
  buildFormattedLabReportText,
  extractReportLoadoutFromLogAndContext,
  ScrubbedRealLogFile,
} from "../utils/logScrubber";
import { resolveDefaultRealLogName, parseLabTimestamp } from "../components/lab/labHelpers";

export function useLabSaveAndToolActions({
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
}: any) {
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
      const rawErr = typeof err === "string" ? err : err?.message || String(err);
      if (rawErr.includes("lab_err_game_running_saves_locked")) {
        setStatus(
          t(
            "lab_err_game_running_saves_locked",
            "Close the running game first so your live saves can be unlocked and restored safely."
          )
        );
      } else {
        setStatus(`${t("status_lab_error", "Lab Error:")} ${rawErr}`);
      }
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
      const rawErr = typeof err === "string" ? err : err?.message || String(err);
      if (rawErr.includes("lab_err_game_running_saves_locked")) {
        setStatus(
          t(
            "lab_err_game_running_saves_locked",
            "Close the running game first so your live saves can be unlocked and restored safely."
          )
        );
      } else {
        setStatus(`${t("status_lab_error", "Lab Error:")} ${rawErr}`);
      }
    }
  };

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
      const reportNum = resolveLabReportNumber(selectedReport, reportsToListRef.current);
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
            ? parseLabTimestamp(selectedReport.time).toLocaleString()
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
    const targetDocs = (docsPath || modsPath || "").trim();
    const latestStatus =
      (await invoke<LabTestSaveStatus>("get_lab_test_save_status", {
        docsPath: targetDocs,
        gameSchema: activeGameSchema,
      }).catch(() => null)) || testSaveStatus;
    if (latestStatus) {
      setTestSaveStatus(latestStatus);
    }
    // First-time setup: if no dedicated Lab Test Save exists yet and user hasn't explicitly armed a clean sandbox, prompt setup first
    const hasConfiguredSave = Boolean(latestStatus?.has_test_save);
    const isFreshSandboxExplicitlyArmed = Boolean(latestStatus?.fresh_sandbox_armed || freshSaveArmed);
    if (!hasConfiguredSave && !isFreshSandboxExplicitlyArmed) {
      setPendingLaunchAfterSaveSetup({ customToolPath });
      setShowTestSaveModal(true);
      return;
    }
    await executeHotSwapNow(customToolPath);
  };

  const reportSaveConfigSuccess = (msg: string) => {
    setSaveModalFeedback({ tone: "success", text: msg });
    setStatus(msg);
    useStore.getState().pushStatus?.(msg, "success");
  };

  const reportSaveConfigError = (err: any) => {
    const rawErr = typeof err === "string" ? err : err?.message || String(err);
    const formatted = rawErr.includes("lab_err_game_running_saves_locked")
      ? t(
          "lab_err_game_running_saves_locked",
          "Close the running game first so your live saves can be unlocked and restored safely."
        )
      : `${t("status_lab_error", "Lab Error:")} ${rawErr}`;
    setSaveModalFeedback({ tone: "error", text: formatted });
    setStatus(formatted);
    useStore.getState().pushStatus?.(formatted, "error");
  };

  const resumePendingLaunchIfArmed = async () => {
    if (pendingLaunchAfterSaveSetup) {
      const pending = pendingLaunchAfterSaveSetup;
      setPendingLaunchAfterSaveSetup(null);
      setShowTestSaveModal(false);
      await executeHotSwapNow(pending.customToolPath);
    }
  };

  const handleSelectSandboxSave = async (saveFileName: string) => {
    setIsConfiguringSave(true);
    setSaveModalFeedback(null);
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
      const updated = await invoke<LabTestSaveStatus>("configure_lab_test_save", {
        docsPath: targetDocs,
        mode: "select_sandbox_save",
        sourceSaveName: saveFileName,
        gameSchema: activeGameSchema,
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(false);
      try {
        localStorage.removeItem(freshSaveArmedKey);
      } catch { }
      reportSaveConfigSuccess(
        `${t("lab_test_save_status_copied", "Dedicated Lab Test Save updated:")} ${saveFileName}`
      );
      await resumePendingLaunchIfArmed();
    } catch (err: any) {
      reportSaveConfigError(err);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const handleCopyLiveSaveForLab = async (saveFileName: string) => {
    setIsConfiguringSave(true);
    setSaveModalFeedback(null);
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
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
      reportSaveConfigSuccess(
        `${t("lab_test_save_status_copied", "Dedicated Lab Test Save updated:")} ${saveFileName}`
      );
      await resumePendingLaunchIfArmed();
    } catch (err: any) {
      reportSaveConfigError(err);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const handleImportSaveFilesFromDisk = async (
    mode: "import_to_live_saves" | "import_external_save"
  ) => {
    try {
      const rawExts: string[] = Array.isArray(activeGameSchema?.lab_verification?.save_extensions)
        ? activeGameSchema.lab_verification.save_extensions
        : [];
      const cleanExts = Array.from(
        new Set(
          rawExts
            .map((ext) => String(ext || "").trim().replace(/^\.+/, "").toLowerCase())
            .filter((ext) => ext.length > 0 && ext !== "dir" && ext !== "folder" && ext !== "directory")
        )
      );

      const picked = await open({
        multiple: true,
        filters:
          cleanExts.length > 0
            ? [
                {
                  name: t("lab_save_dialog_filter_label", "Save Files"),
                  extensions: cleanExts,
                },
              ]
            : undefined,
      });
      const paths = (Array.isArray(picked) ? picked : picked ? [picked] : [])
        .map((p) => String(p || "").trim())
        .filter(Boolean);
      if (paths.length === 0) return;

      setIsConfiguringSave(true);
      setSaveModalFeedback(null);
      const targetDocs = (docsPath || modsPath || "").trim();
      const updated = await invoke<LabTestSaveStatus>("configure_lab_test_save", {
        docsPath: targetDocs,
        mode,
        sourceSaveName: paths.join("\n"),
        externalFilePaths: paths,
        gameSchema: activeGameSchema,
      });
      setTestSaveStatus(updated);
      setFreshSaveArmed(false);
      try {
        localStorage.removeItem(freshSaveArmedKey);
      } catch { }
      reportSaveConfigSuccess(
        mode === "import_to_live_saves"
          ? t(
              "lab_test_save_status_restored_live",
              "Save files imported to Live Saves and set for {Lab} testing."
            )
          : t(
              "lab_test_save_status_imported_sandbox",
              "Save files imported into {Lab} sandbox."
            )
      );
      await resumePendingLaunchIfArmed();
    } catch (err: any) {
      reportSaveConfigError(err);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const handleRestoreLiveSavesFromVaultMirror = async () => {
    setIsConfiguringSave(true);
    setSaveModalFeedback(null);
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
      const updated = await invoke<LabTestSaveStatus>("configure_lab_test_save", {
        docsPath: targetDocs,
        mode: "restore_from_vault_mirror",
        gameSchema: activeGameSchema,
      });
      setTestSaveStatus(updated);
      reportSaveConfigSuccess(
        t(
          "lab_test_save_status_restored_mirror",
          "Live saves restored from {Vault} backup mirror."
        )
      );
    } catch (err: any) {
      reportSaveConfigError(err);
    } finally {
      setIsConfiguringSave(false);
    }
  };

  const handleResetForFreshSave = async (launchNow = false) => {
    setIsConfiguringSave(true);
    setSaveModalFeedback(null);
    try {
      const targetDocs = (docsPath || modsPath || "").trim();
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
      reportSaveConfigSuccess(
        t(
          "lab_test_save_status_reset",
          "Lab Sandbox reset to clean state. Create & save a new game during your next Lab run."
        )
      );
      if (pendingLaunchAfterSaveSetup) {
        await resumePendingLaunchIfArmed();
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
      reportSaveConfigError(err);
    } finally {
      setIsConfiguringSave(false);
    }
  };


  return {
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
  };
}
