import {
  SidePanel,
  ModSearchDropdown,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
  CustomTierDropdown,
  getExtensionRegex,
  cleanSearchName,
  DashboardStatTile,
  StatBox,
   fetchAllPaginated,
} from "./shared";
import {
  ElevatedHubLayout,
  HubOverviewLanding,
  HubOverviewSection,
} from "./components/layouts/ElevatedHubLayout";
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  LabVerificationGate,
  LabVerificationStatus,
  recordVerifiedCertificate,
} from "./components/LabVerificationGate";
import {
  KnownErrorDiagnosisBanner,
  KnownErrorRulesManager,
  getExceptionRules,
  matchExceptionRules,
  NormalizedRuleSeverity,
} from "./components/KnownExceptionRules";
import {
  scrubLogUserData,
  formatHumanReadableLogText,
  extractCleanRealLogContent,
  inferRealLogFileName,
  buildFormattedLabReportText,
  extractReportLoadoutFromLogAndContext,
  getCleanModBaseName,
  getModExtensionLabel,
  getModVersionLabel,
} from "./utils/logScrubber";

export function HomesteadDiagnostics({
  modList,
}: {
  modList: any[];
  setStatus?: any;
}) {
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const selectedVersion = useStore((state: any) => state.selectedVersion);

  const { t } = useLexicon();
  const [labReports, setLabReports] = useState<any[]>([]);
  const [allMods, setAllMods] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [activeReportDate, setActiveReportDate] = useState<string>("");
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [conflictTarget, setConflictTarget] = useState<any | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isMissingArtifactPanelOpen, setIsMissingArtifactPanelOpen] = useState(false);
  const [testRun, setTestRun] = useState(false);
  const [testPassed, setTestPassed] = useState(true);
  const [testLog, setTestLog] = useState("");
  const [logWatcher, setLogWatcher] = useState<any>(null);
  const [diagSessionStatus, setDiagSessionStatus] = useState<LabVerificationStatus | null>(null);
  const [isDiagVerified, setIsDiagVerified] = useState<boolean>(false);

  const [severity, setSeverity] = useState(4);
  const [resolution, setResolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState<"overview" | "pending" | "completed" | "known_errors">("overview");
  const [knownErrorFilter, setKnownErrorFilter] = useState<"all" | NormalizedRuleSeverity>("all");
  const [visibleCount, setVisibleCount] = useState(100);
  const [submittedLog, setSubmittedLog] = useState<string>("");
  const [diagLogViewTab, setDiagLogViewTab] = useState<"REPORT" | "REAL_LOG">("REPORT");
  const [copiedLogState, setCopiedLogState] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "done">("idle");
  const [triggerCreateRule, setTriggerCreateRule] = useState<number>(0);
  const [triggerCreateGameBug, setTriggerCreateGameBug] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      let { data: logsData, error: logsError } = await supabase
        .from("homestead_lab_logs")
        .select("*, mods(*), mod_versions(dna_hash, version_label)")
        .order("created_at", { ascending: false });

      if (logsError && !logsData) {
        const fallbackRes = await supabase
          .from("homestead_lab_logs")
          .select("*, mods(*)")
          .order("created_at", { ascending: false });
        logsData = fallbackRes.data as any;
      }

      if (logsData) {
        const uniqueModsMap = new Map();
        logsData.forEach((log: any) => {
          let mod = log.mods;
          if (Array.isArray(mod)) mod = mod[0];
          if (!mod) return;

          const effectiveStatus =
            log.status === "pending" && mod.status !== "verified" && mod.status !== "broken"
              ? "under_review"
              : ["under_review", "verified", "broken"].includes(mod.status)
                ? mod.status
                : "under_review";

          let hash = mod.id;
          let verLabel = mod.latest_version;
          if (log.mod_versions) {
            const mv = Array.isArray(log.mod_versions) ? log.mod_versions[0] : log.mod_versions;
            hash = mv?.dna_hash || hash;
            verLabel = mv?.version_label || verLabel;
          }
          hash = hash || mod.id;

          if (!uniqueModsMap.has(hash)) {
            uniqueModsMap.set(hash, {
              ...mod,
              status: effectiveStatus,
              dna_hash: hash !== mod.id ? hash : mod.dna_hash,
              latest_version: verLabel || mod.latest_version,
              last_report_at: log.created_at,
            });
          }
        });
        const reports = Array.from(uniqueModsMap.values()).sort((a: any, b: any) =>
          (a.name || "").localeCompare(b.name || "")
        );
        setLabReports(reports);
      }

      const { data: mData } = await fetchAllPaginated(() =>
        supabase
          .from("mods")
          .select("id, name, master_author, latest_version, url, file_extension")
          .order("name")
      );
      if (mData) setAllMods(mData);
    };
    fetchData();
    return () => {
      if (logWatcher) clearInterval(logWatcher);
    };
  }, [logWatcher]);

  useEffect(() => {
    setDiagLogViewTab("REPORT");
    setDownloadState("idle");
    let cancelled = false;

    if (activeReport) {
      setActiveReportDate(activeReport.last_report_at || new Date().toISOString());

      // Immediately seed from local/cloud twin & test history while async queries run
      const initialLoadout = extractReportLoadoutFromLogAndContext({
        targetMod: activeReport,
        modList,
        allMods,
        activeGameSchema,
      });
      setDependencies(initialLoadout.dependencies);
      setConflictTarget(initialLoadout.conflictTarget);

      (async () => {
        try {
          const [logRes, depRes, twinChildRes, twinParentRes, addonRes, conflictARes, conflictBRes] =
            await Promise.all([
              supabase
                .from("homestead_lab_logs")
                .select("tester_note, log_snippet, log_text, created_at")
                .eq("mod_id", activeReport.id)
                .order("created_at", { ascending: false })
                .limit(1),
              supabase
                .from("mod_dependencies")
                .select("parent_id")
                .eq("child_id", activeReport.id),
              supabase
                .from("mod_relationships")
                .select("child_id")
                .eq("parent_id", activeReport.id)
                .eq("relationship_type", "twin"),
              supabase
                .from("mod_relationships")
                .select("parent_id")
                .eq("child_id", activeReport.id)
                .eq("relationship_type", "twin"),
              supabase
                .from("mod_relationships")
                .select("parent_id")
                .eq("child_id", activeReport.id)
                .eq("relationship_type", "addon"),
              supabase
                .from("logical_conflicts")
                .select("mod_b_id, mod_b")
                .eq("mod_a_id", activeReport.id)
                .limit(5),
              supabase
                .from("logical_conflicts")
                .select("mod_a_id, mod_a")
                .eq("mod_b_id", activeReport.id)
                .limit(5),
            ]);

          if (cancelled) return;

          const relatedDepIds = Array.from(
            new Set([
              ...(depRes.data?.map((r: any) => String(r.parent_id)) || []),
              ...(twinChildRes.data?.map((r: any) => String(r.child_id)) || []),
              ...(twinParentRes.data?.map((r: any) => String(r.parent_id)) || []),
              ...(addonRes.data?.map((r: any) => String(r.parent_id)) || []),
            ].filter(Boolean))
          );

          let dbDepMods: any[] = [];
          if (relatedDepIds.length > 0) {
            const matchedFromAll = allMods.filter((m) =>
              relatedDepIds.includes(String(m.id))
            );
            if (matchedFromAll.length === relatedDepIds.length) {
              dbDepMods = matchedFromAll;
            } else {
              const { data: fetchedRelMods } = await supabase
                .from("mods")
                .select("id, name, master_author, latest_version, url, file_extension")
                .in("id", relatedDepIds);
              if (fetchedRelMods) dbDepMods = fetchedRelMods;
            }
          }

          let dbConflictCandidate: any = null;
          const firstConflictId =
            conflictARes.data?.[0]?.mod_b_id || conflictBRes.data?.[0]?.mod_a_id;
          const firstConflictName =
            conflictARes.data?.[0]?.mod_b || conflictBRes.data?.[0]?.mod_a;
          if (firstConflictId) {
            dbConflictCandidate =
              allMods.find((m) => String(m.id) === String(firstConflictId)) || null;
          } else if (firstConflictName) {
            dbConflictCandidate = firstConflictName;
          }

          const logRow = logRes.data?.[0];
          const combinedLogText = logRow
            ? scrubLogUserData(logRow.log_text || logRow.log_snippet || "")
            : "";

          if (logRow?.created_at) {
            setActiveReportDate(logRow.created_at);
          }
          setSubmittedLog(combinedLogText);

          const resolvedLoadout = extractReportLoadoutFromLogAndContext({
            targetMod: activeReport,
            testerNote: logRow?.tester_note,
            logText: logRow?.log_text || logRow?.log_snippet,
            explicitDependencies: dbDepMods,
            explicitConflictTarget: dbConflictCandidate,
            modList,
            allMods,
            activeGameSchema,
          });

          setDependencies(resolvedLoadout.dependencies);
          setConflictTarget(resolvedLoadout.conflictTarget);
        } catch (err) {
          console.warn("Could not hydrate report context:", err);
        }
      })();
    } else {
      setSubmittedLog("");
      setDependencies([]);
      setConflictTarget(null);
    }

    return () => {
      cancelled = true;
    };
  }, [activeReport, allMods, modList, activeGameSchema]);

  useEffect(() => {
    setVisibleCount(100);
  }, [searchTerm, filterTab]);

  const closePanel = () => {
    if (isLoading) return;
    setActiveReport(null);
    setDependencies([]);
    setConflictTarget(null);
    setTestRun(false);
    setTestPassed(true);
    setTestLog("");
    setSubmittedLog("");
  };

  const handleSelectDependency = (mod: any) => {
    if (!dependencies.find((d) => d.id === mod.id)) {
      setDependencies([...dependencies, mod]);
    }
  };

  const handleRemoveDependency = (id: string) => {
    setDependencies(dependencies.filter((d) => d.id !== id));
  };

  const isModMissingLocally = (modName: string) => {
    return !modList.find(
      (m) =>
        m.name === modName ||
        m.displayName === modName ||
        (m.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .toLowerCase() === (modName || "").toLowerCase()
    );
  };

  const runSimulation = async () => {
    if (!activeReport) return;
    if (isModMissingLocally(activeReport.name)) return;
    setIsLoading(true);
    setTestRun(false);
    setTestLog("");

    try {
      let depPaths: string[] = [];
      const ids = [
        activeReport.id,
        ...dependencies.map((d) => d.id),
        conflictTarget?.id,
      ].filter(Boolean);

      if (ids.length > 0) {
        const orQuery = ids.map((id) => `child_id.eq.${id}`).join(",");
        const orParentQuery = ids.map((id) => `parent_id.eq.${id}`).join(",");

        const { data: depLinks } = await supabase
          .from("mod_dependencies")
          .select("parent_id, child_id")
          .or(orQuery);
        const { data: twinLinks } = await supabase
          .from("mod_relationships")
          .select("child_id")
          .or(orParentQuery)
          .eq("relationship_type", "twin");
        const { data: addonLinks } = await supabase
          .from("mod_relationships")
          .select("parent_id")
          .or(orQuery)
          .eq("relationship_type", "addon");

        const allIds = new Set<string>();
        if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
        if (twinLinks) twinLinks.forEach((l: any) => allIds.add(l.child_id));
        if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));

        if (allIds.size > 0) {
          const { data: depMods } = await supabase
            .from("mods")
            .select("name")
            .in("id", Array.from(allIds));
          if (depMods) depPaths = depMods.map((m: any) => m.name);
        }
      }

      const config: any = await invoke("get_saved_coordinates");
      await invoke("evacuate_to_shelter");

      const rawDeploySet = new Set([
        activeReport.physical_path || activeReport.name,
        ...dependencies.map((d) => d.physical_path || d.name),
        ...(conflictTarget
          ? [conflictTarget.physical_path || conflictTarget.name]
          : []),
        ...depPaths,
      ]);

      const deployMods = Array.from(rawDeploySet).map((modName: string) => {
        const modObj = (modList || []).find((m: any) => {
          if (m.isVirtual) return false;
          if (m.name === modName || m.displayName === modName) return true;
          const mBase = m.name
            .split(/[\\/]/)
            .pop()
            ?.replace(getExtensionRegex(activeGameSchema), "")
            .toLowerCase();
          const targetBase = modName
            .split(/[\\/]/)
            .pop()
            ?.replace(getExtensionRegex(activeGameSchema), "")
            .toLowerCase();
          return mBase && targetBase && mBase === targetBase;
        });
        return { path: modObj ? modObj.name : modName, allow_write: true };
      });

      await invoke("deploy_playset_bulk", {
        mods: deployMods,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });

      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      const targetHash =
        activeReport.dna_hash || activeReport.hash || activeReport.id;
      try {
        const initSt = await invoke<LabVerificationStatus>(
          "start_lab_verification_session",
          {
            dnaHash: String(targetHash),
            modName: activeReport.name || "Diagnostic Target",
            docsPath: dPath,
            vaultPath: config.vault_path || "",
          }
        );
        setDiagSessionStatus(initSt);
      } catch {}

      await invoke("launch_game", {
        livePath: config.live_path,
        modsPath: config.mods_path,
      });

      const interval = setInterval(async () => {
        try {
          const st = await invoke<LabVerificationStatus | null>(
            "poll_lab_verification_session"
          );
          if (st) {
            setDiagSessionStatus(st);
            if (st.stage === "VERIFIED" && st.certificate) {
              setIsDiagVerified(true);
              await recordVerifiedCertificate(st.certificate);
            } else if (st.stage === "FAILED") {
              setTestPassed(false);
              setTestLog(scrubLogUserData(st.error_log || "Simulation Failed"));
              setTestRun(true);
              setIsLoading(false);
              clearInterval(interval);
              setLogWatcher(null);
              await invoke("stop_lab_verification_session");
              await invoke("airgap_saves", { docsPath: dPath, enable: false });
              return;
            }
          }
        } catch {}

        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean") {
          setTestPassed(false);
          setTestLog(scrubLogUserData(res));
          setTestRun(true);
          setIsLoading(false);
          clearInterval(interval);
          setLogWatcher(null);
          await invoke("stop_lab_verification_session");
          await invoke("airgap_saves", { docsPath: dPath, enable: false });
        }
      }, 1000);
      setLogWatcher(interval);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const concludeTest = async (passed: boolean) => {
    if (logWatcher) clearInterval(logWatcher);
    setDiagSessionStatus(null);
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("stop_lab_verification_session");
      await invoke("airgap_saves", { docsPath: dPath, enable: false });
    } catch {}

    setTestPassed(passed);
    setTestRun(true);
    setIsLoading(false);

    const finalStatus = passed ? "verified" : "broken";
    await supabase
      .from("mods")
      .update({ status: finalStatus })
      .eq("id", activeReport.id);
    await supabase
      .from("homestead_lab_logs")
      .update({ status: finalStatus })
      .eq("mod_id", activeReport.id)
      .eq("status", "pending");

    setLabReports((prev) =>
      prev.map((r) => (r.id === activeReport.id ? { ...r, status: finalStatus } : r))
    );
    closePanel();

    const lastSet = localStorage.getItem(
      `sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`
    );
    if (lastSet) {
      const config: any = await invoke("get_saved_coordinates");
      const playsets = useStore.getState().playSets;
      if (playsets) {
        const activeSet = playsets.find((s: any) => s.name === lastSet);
        if (activeSet) {
          const deployMods: any[] = [];
          activeSet.mods.forEach((modName: string) => {
            const modObj = modList.find(
              (m: any) => m.name === modName || m.displayName === modName
            );

            let tPath = null;
            let virtualParent = modObj?.isVirtual ? modObj : null;
            let parsedStructure = virtualParent?.folder_structure;
            if (typeof parsedStructure === "string") {
              try {
                parsedStructure = JSON.parse(parsedStructure);
              } catch {}
            }

            if (!virtualParent) {
              const normalize = (s: string) =>
                s.replace(/[^a-z0-9]/gi, "").toLowerCase();
              const cleanModName =
                modName
                  .split(/[\\/]/)
                  .pop()
                  ?.replace(getExtensionRegex(activeGameSchema), "") || "";

              for (const m of modList || []) {
                if (m.isVirtual && m.folder_structure) {
                  let struct = m.folder_structure;
                  if (typeof struct === "string") {
                    try {
                      struct = JSON.parse(struct);
                    } catch {
                      continue;
                    }
                  }
                  if (Array.isArray(struct)) {
                    const getPath = (
                      structure: any[],
                      targetName: string,
                      currentPath = ""
                    ): string | null => {
                      for (const node of structure) {
                        const nodePath = currentPath
                          ? `${currentPath}/${node.name}`
                          : node.name;
                        if (node.type === "file") {
                          if (node.assignedModId === targetName) return nodePath;
                          if (
                            node.assignedModName &&
                            normalize(node.assignedModName) === normalize(targetName)
                          )
                            return nodePath;
                          if (normalize(node.name) === normalize(targetName))
                            return nodePath;
                          if (
                            normalize(
                              node.name.replace(/\.(package|ts4script|cfg|ini)$/i, "")
                            ) === normalize(targetName)
                          )
                            return nodePath;
                        }
                        if (node.children) {
                          const result = getPath(node.children, targetName, nodePath);
                          if (result) return result;
                        }
                      }
                      return null;
                    };

                    let foundPath =
                      getPath(struct, cleanModName) || getPath(struct, modName);
                    if (!foundPath && modObj?.dbId)
                      foundPath = getPath(struct, String(modObj.dbId));

                    if (foundPath) {
                      virtualParent = m;
                      parsedStructure = struct;
                      const ext = modName.includes(".")
                        ? modName.split(".").pop()
                        : "";
                      if (
                        ext &&
                        !foundPath.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
                      ) {
                        tPath = `${foundPath}.${ext}`;
                      } else {
                        tPath = foundPath;
                      }
                      break;
                    }
                  }
                }
              }

              if (!virtualParent) {
                virtualParent = (modList || []).find((m: any) => {
                  if (!m.isVirtual || !m.flavors) return false;
                  const targetBaseName = normalize(
                    modName
                      .split(/[\\/]/)
                      .pop()
                      ?.replace(/\.(package|ts4script|cfg|ini)$/i, "") || ""
                  );
                  return m.flavors.some((f: any) => {
                    const cleanF = normalize(
                      f.name
                        .split(/[\\/]/)
                        .pop()
                        ?.replace(/\.(package|ts4script|cfg|ini)$/i, "") || ""
                    );
                    return cleanF === targetBaseName;
                  });
                });
                if (virtualParent) {
                  parsedStructure = virtualParent.folder_structure;
                  if (typeof parsedStructure === "string") {
                    try {
                      parsedStructure = JSON.parse(parsedStructure);
                    } catch {}
                  }
                }
              }
            }

            if (modObj && modObj.isVirtual) {
              deployMods.push({
                path: modObj.name,
                allow_write: true,
                folder_structure: parsedStructure || null,
                target_path: null,
              });
            } else {
              deployMods.push({
                path: virtualParent
                  ? `${virtualParent.name}/${modName}`
                  : modName,
                allow_write: true,
                target_path: tPath || modName,
              });
            }
          });
          await invoke("deploy_playset_bulk", {
            mods: deployMods,
            modsPath: config.mods_path,
            vaultPath: config.vault_path,
          });
          return;
        }
      }
    }
    await invoke("evacuate_to_shelter");
  };

  const submitToNexus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport || !conflictTarget) return;
    setIsSubmitting(true);
    await supabase.from("logical_conflicts").insert([
      {
        mod_a_id: activeReport.id,
        mod_b_id: conflictTarget.id,
        severity_rank: severity,
        resolution_note: resolution,
      },
    ]);
    setIsSubmitting(false);
    setTestRun(false);
    setTestLog("");
    setResolution("");
  };

  let filteredReports = labReports.filter(
    (mod) =>
      (mod.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (mod.master_author || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const seenLabNames = new Set();
  filteredReports = filteredReports.filter((mod) => {
    if (!mod.name) return true;
    const lowerName = mod.name.toLowerCase();
    if (seenLabNames.has(lowerName)) return false;
    seenLabNames.add(lowerName);
    return true;
  });

  const pendingReports = filteredReports.filter(
    (mod: any) => mod.status === "under_review"
  );
  const completedReports = filteredReports.filter(
    (mod: any) => mod.status !== "under_review"
  );

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: filteredReports.length.toString(),
    },
    {
      id: "pending",
      label: t("pending") || "Pending",
      icon: "schedule",
      number: pendingReports.length.toString(),
    },
    {
      id: "completed",
      label: t("status_completed") || "Completed",
      icon: "check_circle",
      number: completedReports.length.toString(),
    },
    {
      id: "known_errors",
      label: t("exc_rules_user_tab_title", "Known Errors"),
      icon: t("icon_rule_settings", "rule_settings"),
      number: getExceptionRules(activeGameSchema).length.toString(),
    },
  ];

  const renderDiagnosticCard = (mod: any) => {
    const isVerified = mod.status === "verified";
    const isBroken = mod.status === "broken";
    const modExt = getModExtensionLabel(mod, activeGameSchema, modList);
    const modVer = getModVersionLabel(mod, modList);
    const reportDate = mod.last_report_at || mod.updated_at;

    return (
      <div
        key={mod.id}
        onClick={() => setActiveReport(mod)}
        className="relative glass-panel p-5 rounded-2xl flex flex-col gap-3.5 shadow-xl overflow-hidden group cursor-pointer border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] transition-all duration-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={`w-10 h-10 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
              isBroken
                ? "text-rose-400 border-rose-500/35"
                : isVerified
                  ? "text-emerald-400 border-emerald-500/35"
                  : "text-amber-400 border-amber-500/35"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isBroken ? "warning" : isVerified ? "check_circle" : "schedule"}
            </span>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase border bg-transparent flex items-center gap-1 shrink-0 ${
              isBroken
                ? "text-rose-400 border-rose-500/45"
                : isVerified
                  ? "text-emerald-400 border-emerald-500/45"
                  : "text-amber-400 border-amber-500/45"
            }`}
          >
            {isBroken
              ? t("status_broken")
              : isVerified
                ? t("verified")
                : t("status_pending_review")}
          </span>
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-black font-mono uppercase tracking-[0.18em] text-[var(--accent)]">
            {modExt}
          </span>
          <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug truncate">
            {getCleanModBaseName(mod)}
          </h3>
          <p className="text-xs font-semibold text-[var(--subtext)] truncate">
            {mod.master_author || t("target_engine_core")}
          </p>
        </div>

        <div className="mt-auto pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--subtext)] opacity-75">
          <span className="font-mono truncate">
            {`v${modVer} • ${selectedVersion || t("vlocal")}`}
          </span>
          {reportDate ? (
            <span className="shrink-0">
              {new Date(reportDate).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}{" "}
              &bull;{" "}
              {new Date(reportDate).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="shrink-0 font-mono uppercase tracking-wider text-[10px] text-[var(--accent)]">
              {t("btn_view") || "View"}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="schedule"
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending") || "Recent Pending"}
        isEmpty={pendingReports.length === 0}
        emptyIcon="check_circle"
        emptyTitle={t("no_pending") || "No Pending Reports"}
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {pendingReports.slice(0, 4).map((mod: any) => renderDiagnosticCard(mod))}
      </HubOverviewSection>

      <HubOverviewSection
        icon="check_circle"
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed") || "Recent Completed"}
        isEmpty={completedReports.length === 0}
        emptyIcon="history"
        emptyTitle={t("no_history") || "No History"}
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {completedReports.slice(0, 4).map((mod: any) => renderDiagnosticCard(mod))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  const activeRawLog = scrubLogUserData(testLog || submittedLog || "");
  const activeExceptionRules = getExceptionRules(activeGameSchema);
  const activeMatchedRules = matchExceptionRules(activeRawLog, activeExceptionRules);
  const formattedDiagReportText = activeReport
    ? buildFormattedLabReportText({
        reportNumber: 1,
        date: activeReportDate
          ? new Date(activeReportDate).toLocaleString()
          : new Date().toLocaleString(),
        gameVersion: selectedVersion || "Local",
        targetMod: activeReport,
        conflictTarget,
        stagedExtras: dependencies,
        matchedRules: activeMatchedRules,
        rawLogText: activeRawLog,
        errorFound: activeReport.status !== "verified" && Boolean(activeRawLog || !testPassed),
        verified: activeReport.status === "verified" || (testRun && testPassed),
        activeGameSchema,
        modList,
      })
    : "";
  const realEngineLogContent = formatHumanReadableLogText(
    extractCleanRealLogContent(activeRawLog)
  );
  const inferredLogFileName = inferRealLogFileName(activeRawLog);
  const activeTextToCopy =
    diagLogViewTab === "REAL_LOG"
      ? realEngineLogContent
      : formattedDiagReportText || formatHumanReadableLogText(activeRawLog);

  const handleDownloadDiagReport = async () => {
    if (!activeReport) return;
    try {
      const defaultFileName = `Lab_Report_1.txt`;
      const path = await save({
        defaultPath: defaultFileName,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (path) {
        await writeTextFile(path, formattedDiagReportText);
        if (activeRawLog.trim().length > 0) {
          const lastSepIdx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
          const dirPath = lastSepIdx >= 0 ? path.slice(0, lastSepIdx + 1) : "";
          const baseFileName = (
            lastSepIdx >= 0 ? path.slice(lastSepIdx + 1) : path
          ).replace(/\.txt$/i, "");
          const companionPath = `${dirPath}${baseFileName}_${inferredLogFileName}`;
          await writeTextFile(
            companionPath,
            extractCleanRealLogContent(activeRawLog)
          );
        }
        setDownloadState("done");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("tab_diagnostics") || "Lab"}
        headerSubtitle={
          t("lab_diagnostics_desc") || "Automated lab testing and diagnostics"
        }
        headerIcon="science"
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={(t("search_ph") || "Search diagnostics...") as string}
        hideSearch={filterTab === "overview"}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
        actions={
          filterTab === "known_errors"
            ? [
                {
                  id: "add_game_bug",
                  icon: t("icon_bug_report", "bug_report"),
                  label: t("exc_rules_btn_add_game_bug", "Add Normal Game Bug"),
                  onClick: () => setTriggerCreateGameBug((v) => v + 1),
                },
                {
                  id: "add_rule",
                  icon: t("icon_add", "add"),
                  label: t("exc_rules_btn_add_rule", "Add Known Error Rule"),
                  onClick: () => setTriggerCreateRule((v) => v + 1),
                },
              ]
            : undefined
        }
      >
        {filterTab === "overview" && renderLanding()}

        {filterTab === "pending" && (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pendingReports.length === 0 ? (
                <EmptyState
                  icon={
                    searchTerm
                      ? "search_off"
                      : t("icon_monitor_heart") || "monitor_heart"
                  }
                  title={
                    searchTerm
                      ? t("no_matches") || "No matches"
                      : t("no_diagnostics") || "No diagnostics"
                  }
                  className="col-span-full py-16"
                />
              ) : (
                pendingReports
                  .slice(0, visibleCount)
                  .map((mod: any) => renderDiagnosticCard(mod))
              )}
            </div>
            {pendingReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((v) => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} /{" "}
                {pendingReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === "completed" && completedReports.length > 0 && (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {completedReports
                .slice(0, visibleCount)
                .map((mod: any) => renderDiagnosticCard(mod))}
            </div>
            {completedReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((v) => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} /{" "}
                {completedReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === "completed" && completedReports.length === 0 && (
          <EmptyState
            icon={
              searchTerm
                ? "search_off"
                : t("icon_monitor_heart") || "monitor_heart"
            }
            title={
              searchTerm
                ? t("no_matches") || "No matches"
                : t("no_completed_reports") || "No completed reports"
            }
            className="py-16 mt-10"
          />
        )}

        {filterTab === "known_errors" && (
          <div className="flex flex-col gap-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <KnownErrorRulesManager
              searchQuery={searchTerm}
              canEdit={true}
              externalTriggerCreate={triggerCreateRule}
              externalTriggerCreateGameBug={triggerCreateGameBug}
              hideTopBarButton={true}
              severityFilter={knownErrorFilter}
              onSeverityFilterChange={setKnownErrorFilter}
            />
          </div>
        )}
      </ElevatedHubLayout>

      {activeReport &&
        (() => {
          const isVerified =
            activeReport.status === "verified" || (testRun && testPassed);
          const isBroken =
            activeReport.status === "broken" || (testRun && !testPassed);
          const modExt = getModExtensionLabel(
            activeReport,
            activeGameSchema,
            modList,
            dependencies
          );
          const modVer = getModVersionLabel(
            activeReport,
            modList,
            dependencies
          );

          return (
            <SidePanel
              isOpen={!!activeReport}
              onClose={closePanel}
              title={t("diagnostic_panel_title") || "Diagnostic Report"}
              icon="monitor_heart"
              iconColorClass="text-[var(--accent)]"
              subtitle={`${
                isBroken
                  ? t("status_broken")
                  : isVerified
                    ? t("verified")
                    : t("status_pending_review")
              } • UUID: ${String(activeReport.id).slice(0, 8)}`}
              widthClass="w-[90vw] md:w-[820px]"
              headerActions={
                <PanelHeaderGroup>
                  {isLoading ? (
                    <>
                      <PanelHeaderButton
                        icon={isDiagVerified ? "check" : "lock"}
                        variant="success"
                        disabled={!isDiagVerified}
                        tooltip={
                          isDiagVerified
                            ? t("auto_conclude_pass") || "Conclude Pass"
                            : t(
                                "lab_tooltip_approve_locked",
                                "Approval Locked (Lab Test Required)"
                              )
                        }
                        onClick={() => concludeTest(true)}
                      />
                      <PanelHeaderButton
                        icon="block"
                        variant="danger"
                        tooltip={t("auto_conclude_fail") || "Conclude Fail"}
                        onClick={() => concludeTest(false)}
                      />
                    </>
                  ) : !testRun ? (
                    isModMissingLocally(activeReport.name) ? (
                      <PanelHeaderButton
                        icon="download"
                        variant="warning"
                        tooltip={t("missing_artifacts") || "Missing Artifacts"}
                        onClick={() => setIsMissingArtifactPanelOpen(true)}
                      />
                    ) : (
                      <PanelHeaderButton
                        icon="play_arrow"
                        variant="accent"
                        tooltip={t("btn_run_diagnostic") || "Run Diagnostic"}
                        onClick={runSimulation}
                      />
                    )
                  ) : null}
                  <PanelHeaderButton
                    icon={
                      downloadState === "done"
                        ? "check_circle"
                        : t("icon_download", "download")
                    }
                    variant={downloadState === "done" ? "success" : "accent"}
                    tooltip={
                      downloadState === "done"
                        ? (t(
                            "lab_action_download_done_title",
                            "Report Saved Locally"
                          ) as string)
                        : (t(
                            "lab_action_download_title",
                            "Download Report"
                          ) as string)
                    }
                    onClick={handleDownloadDiagReport}
                  />
                </PanelHeaderGroup>
              }
            >
              <div className="flex flex-col gap-4 mt-2 w-full pb-8">
                {/* Tested Mod Banner on Panel Body */}
                <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                        isBroken
                          ? "text-rose-400 border-rose-500/35"
                          : isVerified
                            ? "text-emerald-400 border-emerald-500/35"
                            : "text-amber-400 border-amber-500/35"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[22px]">
                        {isBroken
                          ? "warning"
                          : isVerified
                            ? "check_circle"
                            : "schedule"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                        {t("subject_isolation")}
                      </span>
                      <h3 className="text-base md:text-lg font-black text-[var(--text)] tracking-tight truncate">
                        {getCleanModBaseName(activeReport)}
                      </h3>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase border bg-transparent flex items-center gap-1 ${
                        isBroken
                          ? "text-rose-400 border-rose-500/45"
                          : isVerified
                            ? "text-emerald-400 border-emerald-500/45"
                            : "text-amber-400 border-amber-500/45"
                      }`}
                    >
                      {isBroken
                        ? t("status_broken")
                        : isVerified
                          ? t("verified")
                          : t("status_pending_review")}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[var(--subtext)]">
                      {modExt} &bull; v{modVer}
                    </span>
                  </div>
                </div>

                {/* 3-Column Telemetry StatBoxes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <StatBox
                    icon={t("icon_sell", "sell")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("game_version") || "Game Version"}
                    value={selectedVersion || t("vlocal")}
                  />
                  <StatBox
                    icon={t("icon_memory", "memory")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("mod_version") || "Mod Version"}
                    value={modVer}
                  />
                  <StatBox
                    icon={t("icon_schedule", "schedule")}
                    iconColorClass="text-[var(--accent)]"
                    label={t("date_created") || "Time"}
                    tooltipSubtitle={
                      activeReportDate
                        ? new Date(activeReportDate).toLocaleString()
                        : undefined
                    }
                    value={
                      <span className="text-xs md:text-sm font-black tracking-tight">
                        {new Date(activeReportDate || Date.now()).toLocaleDateString(
                          [],
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}{" "}
                        &bull;{" "}
                        {new Date(activeReportDate || Date.now()).toLocaleTimeString(
                          [],
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          }
                        )}
                      </span>
                    }
                  />
                </div>

                {/* Timed Lab Verification Gate (hideErrorLog avoids duplicate raw log box) */}
                <LabVerificationGate
                  dnaHash={
                    activeReport?.dna_hash ||
                    activeReport?.hash ||
                    activeReport?.id
                  }
                  modName={activeReport?.name || "Diagnostic Target"}
                  physicalPath={activeReport?.physical_path || activeReport?.name}
                  roleContext="lab"
                  isGateRequired={true}
                  externalStatus={diagSessionStatus}
                  hideErrorLog={true}
                  onStatusChange={(st) => setIsDiagVerified(st.verified)}
                />

                {/* Side-by-Side Dependencies & Conflict Matrix Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                          extension
                        </span>
                        {t("section_deps_title") || "Dependencies"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--accent)]">
                        {dependencies.length}
                      </span>
                    </div>
                    <ModSearchDropdown
                      selectedItem={null}
                      onSelect={handleSelectDependency}
                      onClear={() => {}}
                      placeholder={t("search_dep_ph") || "Search dependency..."}
                      modList={allMods.filter(
                        (m) =>
                          m.id !== activeReport.id &&
                          !dependencies.some((d) => d.id === m.id)
                      )}
                    />
                    {dependencies.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {dependencies.map((d) => (
                          <div
                            key={d.id}
                            className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                extension
                              </span>
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {getCleanModBaseName(d)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono font-bold text-[var(--subtext)]">
                                {getModExtensionLabel(
                                  d,
                                  activeGameSchema,
                                  modList,
                                  dependencies
                                )}{" "}
                                &bull; v{getModVersionLabel(d, modList, dependencies)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveDependency(d.id)}
                                className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_close") || "close"}
                                </span>
                              </button>
                            </div>
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
                        {t("diagnostic_conflict_target") || "Conflict Target"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--warning)]">
                        {conflictTarget ? 1 : 0}
                      </span>
                    </div>
                    <ModSearchDropdown
                      selectedItem={null}
                      onSelect={(m: any) => setConflictTarget(m)}
                      onClear={() => {}}
                      placeholder={
                        t("search_conflict_ph") || "Search conflict target..."
                      }
                      modList={allMods.filter(
                        (m) =>
                          m.id !== activeReport.id &&
                          !dependencies.some((d) => d.id === m.id)
                      )}
                    />
                    {conflictTarget ? (
                      <div className="w-full rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)] shrink-0">
                            warning
                          </span>
                          <span className="text-xs font-bold text-[var(--text)] truncate">
                            {getCleanModBaseName(conflictTarget)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono font-bold text-[var(--warning)]">
                            {getModExtensionLabel(
                              conflictTarget,
                              activeGameSchema,
                              modList
                            )}{" "}
                            &bull; v{getModVersionLabel(conflictTarget, modList)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setConflictTarget(null)}
                            className="w-6 h-6 rounded-lg hover:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close") || "close"}
                            </span>
                          </button>
                        </div>
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

                {/* Community Known Error Diagnosis Banner */}
                {activeRawLog && (
                  <KnownErrorDiagnosisBanner
                    logText={activeRawLog}
                    canEdit={true}
                    reportFailed={!isVerified}
                  />
                )}

                {/* 2-Column StatTile Log Switcher */}
                {activeRawLog && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={t("icon_description", "description")}
                      label={t("lab_report_tab_summary", "Lab Report Log")}
                      number="Lab_Report_1.txt"
                      isActive={diagLogViewTab === "REPORT"}
                      onClick={() => setDiagLogViewTab("REPORT")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      className="!w-full"
                      icon={t("icon_terminal", "terminal")}
                      label={t("lab_report_tab_real_log", "Real Game Log (Scrubbed)")}
                      number={inferredLogFileName}
                      isActive={diagLogViewTab === "REAL_LOG"}
                      onClick={() => setDiagLogViewTab("REAL_LOG")}
                    />
                  </div>
                )}

                {/* Unified Log Terminal with Privacy Scrubber Badge & Copy Telemetry */}
                <div className="flex-1 min-h-[360px] glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl overflow-hidden shadow-inner relative flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[var(--accent)] !text-[16px]">
                        {diagLogViewTab === "REAL_LOG"
                          ? t("icon_terminal", "terminal")
                          : t("icon_description", "description")}
                      </span>
                      <span className="text-xs font-black font-mono text-[var(--text)]">
                        {diagLogViewTab === "REAL_LOG"
                          ? inferredLogFileName
                          : "Lab_Report_1.txt"}
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
                          if (!activeTextToCopy) return;
                          navigator.clipboard?.writeText(activeTextToCopy);
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
                          ? t("lab_report_copied_btn", "Copied")
                          : t("lab_report_copy_btn", "Copy Log")}
                      </button>
                    </div>
                  </div>

                  <pre className="p-5 font-mono text-[12px] text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed flex-1 max-h-[480px] overflow-y-auto custom-scrollbar opacity-90">
                    {diagLogViewTab === "REAL_LOG"
                      ? realEngineLogContent || t("no_logs")
                      : formattedDiagReportText ||
                        formatHumanReadableLogText(activeRawLog) ||
                        t("no_logs")}
                  </pre>
                </div>

                {testRun && !testPassed && conflictTarget && (
                  <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex flex-col gap-3">
                    <h3 className="text-xs font-black text-[var(--accent)] uppercase tracking-widest">
                      {t("btn_add_to_nexus") || "Add Conflict Rule"}
                    </h3>
                    <form onSubmit={submitToNexus} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                          {t("resolution_suggestion") || "Resolution Suggestion"}
                        </label>
                        <input
                          required
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          placeholder={
                            (t("auto_e_g_load_31") || "e.g. Load after...") as string
                          }
                          className="glass-surface rounded-xl px-4 py-2.5 text-[var(--text)] text-xs font-bold focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">
                          {t("severity") || "Severity"}
                        </label>
                        <CustomTierDropdown
                          value={severity}
                          onChange={(val: any) => setSeverity(val)}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-transparent text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting
                          ? t("btn_saving") || "Saving..."
                          : t("btn_save_conflict_rule") || "Save Conflict Rule"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </SidePanel>
          );
        })()}

      <SidePanel
        isOpen={isMissingArtifactPanelOpen}
        onClose={() => setIsMissingArtifactPanelOpen(false)}
        title={t("missing_artifacts") || "Missing Artifacts"}
        icon="download"
        widthClass="w-[450px]"
        headerActions={
          <PanelHeaderGroup>
            {activeReport?.download_url ? (
              <PanelHeaderButton
                icon="download"
                tooltip={t("download_source") || "Download Source"}
                onClick={() => window.open(activeReport.download_url, "_blank")}
              />
            ) : null}
            <PanelHeaderButton
              icon="search"
              tooltip={t("search_web") || "Search Web"}
              onClick={() =>
                window.open(
                  `https://www.google.com/search?q=${encodeURIComponent(
                    (useStore.getState().activeGameSchema?.display_name || "Mod") +
                      " " +
                      cleanSearchName(
                        activeReport?.name || "",
                        useStore.getState().activeGameSchema
                      )
                  )}`,
                  "_blank"
                )
              }
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-4">
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--warning)]">
              {t("missing_dependency_desc") || "Missing Local Artifact"}
            </span>
            <h3 className="text-base font-black text-[var(--text)]">
              {getCleanModBaseName(activeReport)}
            </h3>
          </div>
          <div className="p-6 glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined !text-[48px] text-[var(--warning)] opacity-80">
              {t("icon_extension_off") || "extension_off"}
            </span>
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">
              {t("missing_dependency_desc") ||
                "Artifact is missing from local storage."}
            </span>
          </div>
        </div>
      </SidePanel>
    </>
  );
}
