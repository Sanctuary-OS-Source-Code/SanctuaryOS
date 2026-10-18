import { SidePanel, FilterTabs, FilterTabButton, ActionButton, CustomDropdown, ModSearchDropdown, EmptyState, ActionPill, PanelHeaderGroup, PanelHeaderButton, HeaderActionPortal } from "./shared";
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from "./components/layouts/ElevatedHubLayout";
import { UniversalGroup } from "./components/universal/UniversalLayout";
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetchAllPaginated, CustomTierDropdown, getExtensionRegex, cleanSearchName, } from "./shared";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  ViewHeader, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, DashboardStatTile,
  HubTabButton, standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MarkdownRenderer from "./MarkdownRenderer";
import { StatTileCarousel } from "./hub-components/SharedCommandScreenLayout";
import {
  LabVerificationGate,
  LabVerificationStatus,
  recordVerifiedCertificate,
} from "./components/LabVerificationGate";
import {
  KnownErrorDiagnosisBanner,
  KnownErrorRulesManager,
  getExceptionRules,
} from "./components/KnownExceptionRules";
import { scrubLogUserData, formatHumanReadableLogText } from "./utils/logScrubber";


export function HomesteadDiagnostics({ modList, setStatus }: { modList: any[], setStatus?: any }) {
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);

  const { t } = useLexicon();
  const [labReports, setLabReports] = useState<any[]>([]);
  const [allMods, setAllMods] = useState<any[]>([]);
  const [allMasons, setAllMasons] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [activeReport, setActiveReport] = useState<any | null>(null);
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
  const [filterTab, setFilterTab] = useState<'overview' | 'pending' | 'completed' | 'known_errors'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const [submittedLog, setSubmittedLog] = useState<string>("");
  const [triggerCreateRule, setTriggerCreateRule] = useState<number>(0);
  const [triggerCreateGameBug, setTriggerCreateGameBug] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      let { data: logsData, error: logsError } = await supabase
        .from('homestead_lab_logs')
        .select('*, mods(*), mod_versions(dna_hash)')
        .order('created_at', { ascending: false });

      if (logsError && !logsData) {
        const fallbackRes = await supabase
          .from('homestead_lab_logs')
          .select('*, mods(*)')
          .order('created_at', { ascending: false });
        logsData = fallbackRes.data as any;
      }

      if (logsData) {
        const uniqueModsMap = new Map();
        logsData.forEach((log: any) => {
          let mod = log.mods;
          if (Array.isArray(mod)) mod = mod[0];
          if (!mod) return;

          const effectiveStatus =
            log.status === 'pending' && mod.status !== 'verified' && mod.status !== 'broken'
              ? 'under_review'
              : ['under_review', 'verified', 'broken'].includes(mod.status)
                ? mod.status
                : 'under_review';

          let hash = mod.id;
          if (log.mod_versions) {
            hash = Array.isArray(log.mod_versions) ? log.mod_versions[0]?.dna_hash : log.mod_versions.dna_hash;
          }
          hash = hash || mod.id;

          if (!uniqueModsMap.has(hash)) {
            uniqueModsMap.set(hash, {
              ...mod,
              status: effectiveStatus,
              dna_hash: hash !== mod.id ? hash : mod.dna_hash,
            });
          }
        });
        const reports = Array.from(uniqueModsMap.values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        setLabReports(reports);
      }

      const { data: mData } = await fetchAllPaginated(() => supabase.from('mods').select('id, name, master_author, latest_version, url').order('name'));
      if (mData) setAllMods(mData);

      const { data: masonData } = await supabase.from('masons').select('id, name').order('name');
      if (masonData) setAllMasons(masonData);
    };
    fetchData();
    return () => { if (logWatcher) clearInterval(logWatcher); };
  }, [logWatcher]);

  useEffect(() => {
    if (activeReport) {
      supabase.from("homestead_lab_logs")
        .select("tester_note, log_snippet, log_text, created_at")
        .eq("mod_id", activeReport.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data, error }) => {
          if (error) {
            console.warn("Could not fetch homestead_lab_logs:", error);
            return;
          }
          if (data && data.length > 0) {
            const logRow = data[0];
            setSubmittedLog(
              scrubLogUserData(logRow.log_text || logRow.log_snippet || "")
            );
            if (logRow.tester_note && allMods.length > 0) {
              try {
                const ctx = JSON.parse(logRow.tester_note);
                if (ctx.conflictTarget) {
                  const t = allMods.find(m => m.name === ctx.conflictTarget);
                  if (t) setConflictTarget(t);
                }
                if (ctx.dependencies) {
                  const deps = ctx.dependencies.map((name: string) => allMods.find(m => m.name === name)).filter(Boolean);
                  if (deps.length > 0) setDependencies(deps);
                }
              } catch (e) {
              }
            }
          } else {
            setSubmittedLog("");
          }
        });
    } else {
      setSubmittedLog("");
    }
  }, [activeReport, allMods]);

  useEffect(() => { setVisibleCount(100); }, [searchTerm, filterTab]);

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
    if (!dependencies.find(d => d.id === mod.id)) {
      setDependencies([...dependencies, mod]);
    }
  };

  const handleRemoveDependency = (id: string) => {
    setDependencies(dependencies.filter(d => d.id !== id));
  };

  const isModMissingLocally = (modName: string) => {
    return !modList.find(m =>
      m.name === modName ||
      m.displayName === modName ||
      (m.name || '').split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase() === (modName || '').toLowerCase()
    );
  };

  const downloadMissing = () => {
    if (activeReport && isModMissingLocally(activeReport.name)) {
      setIsMissingArtifactPanelOpen(true);
    }
  };

  const runSimulation = async () => {
    if (!activeReport) return;
    if (isModMissingLocally(activeReport.name)) return;
    setIsLoading(true);
    setTestRun(false);
    setTestLog("");

    try {
      let depPaths: string[] = [];
      const ids = [activeReport.id, ...dependencies.map(d => d.id), conflictTarget?.id].filter(Boolean);

      if (ids.length > 0) {
        const orQuery = ids.map(id => `child_id.eq.${id}`).join(',');
        const orParentQuery = ids.map(id => `parent_id.eq.${id}`).join(',');

        const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(orQuery);
        const { data: twinLinks } = await supabase.from('mod_relationships').select("child_id").or(orParentQuery).eq('relationship_type', 'twin');
        const { data: addonLinks } = await supabase.from('mod_relationships').select("parent_id").or(orQuery).eq('relationship_type', 'addon');

        let allIds = new Set<string>();
        if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
        if (twinLinks) twinLinks.forEach((l: any) => allIds.add(l.child_id));
        if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));

        if (allIds.size > 0) {
          const { data: depMods } = await supabase.from('mods').select("name").in('id', Array.from(allIds));
          if (depMods) depPaths = depMods.map((m: any) => m.name);
        }
      }

      const config: any = await invoke("get_saved_coordinates");
      await invoke("evacuate_to_shelter");

      const rawDeploySet = new Set([
        activeReport.physical_path || activeReport.name,
        ...dependencies.map(d => d.physical_path || d.name),
        ...(conflictTarget ? [conflictTarget.physical_path || conflictTarget.name] : []),
        ...depPaths
      ]);

      const deployMods = Array.from(rawDeploySet).map((modName: string) => {
        const modObj = (modList || []).find((m: any) => {
          if (m.isVirtual) return false;
          if (m.name === modName || m.displayName === modName) return true;
          const mBase = m.name.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
          const targetBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
          return mBase && targetBase && mBase === targetBase;
        });
        return { path: modObj ? modObj.name : modName, allow_write: true };
      });

      await invoke("deploy_playset_bulk", {
        mods: deployMods,
        modsPath: config.mods_path,
        vaultPath: config.vault_path
      });

      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      const targetHash = activeReport.dna_hash || activeReport.hash || activeReport.id;
      try {
        const initSt = await invoke<LabVerificationStatus>("start_lab_verification_session", {
          dnaHash: String(targetHash),
          modName: activeReport.name || "Diagnostic Target",
          docsPath: dPath,
          vaultPath: config.vault_path || "",
        });
        setDiagSessionStatus(initSt);
      } catch (e) {}

      await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });

      const interval = setInterval(async () => {
        try {
          const st = await invoke<LabVerificationStatus | null>("poll_lab_verification_session");
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
        } catch (e) {}

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
    } catch (e) { }

    setTestPassed(passed);
    setTestRun(true);
    setIsLoading(false);

    const finalStatus = passed ? "verified" : "broken";
    await supabase.from('mods').update({ status: finalStatus }).eq('id', activeReport.id);
    await supabase.from('homestead_lab_logs').update({ status: finalStatus }).eq('mod_id', activeReport.id).eq('status', 'pending');

    setLabReports(prev => prev.map(r => r.id === activeReport.id ? { ...r, status: finalStatus } : r));
    closePanel();

    const lastSet = localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`);
    if (lastSet) {
      const config: any = await invoke("get_saved_coordinates");
      const playsets = useStore.getState().playSets;
      if (playsets) {
        const activeSet = playsets.find((s: any) => s.name === lastSet);
        if (activeSet) {
          let deployMods: any[] = [];
          activeSet.mods.forEach((modName: string) => {
            let modObj = modList.find((m: any) => m.name === modName || m.displayName === modName);

            let tPath = null;
            let virtualParent = modObj?.isVirtual ? modObj : null;
            let parsedStructure = virtualParent?.folder_structure;
            if (typeof parsedStructure === 'string') {
              try { parsedStructure = JSON.parse(parsedStructure); } catch (e) { }
            }

            if (!virtualParent) {
              const normalize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
              const cleanModName = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "") || "";

              for (const m of (modList || [])) {
                if (m.isVirtual && m.folder_structure) {
                  let struct = m.folder_structure;
                  if (typeof struct === 'string') {
                    try { struct = JSON.parse(struct); } catch (e) { continue; }
                  }
                  if (Array.isArray(struct)) {
                    const getPath = (structure: any[], targetName: string, currentPath = ""): string | null => {
                      for (const node of structure) {
                        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
                        if (node.type === "file") {
                          if (node.assignedModId === targetName) return nodePath;
                          if (node.assignedModName && normalize(node.assignedModName) === normalize(targetName)) return nodePath;
                          if (normalize(node.name) === normalize(targetName)) return nodePath;
                          if (normalize(node.name.replace(/\.(package|ts4script|cfg|ini)$/i, "")) === normalize(targetName)) return nodePath;
                        }
                        if (node.children) {
                          const result = getPath(node.children, targetName, nodePath);
                          if (result) return result;
                        }
                      }
                      return null;
                    };

                    let foundPath = getPath(struct, cleanModName) || getPath(struct, modName);
                    if (!foundPath && modObj?.dbId) foundPath = getPath(struct, String(modObj.dbId));

                    if (foundPath) {
                      virtualParent = m;
                      parsedStructure = struct;
                      const ext = modName.includes('.') ? modName.split('.').pop() : '';
                      if (ext && !foundPath.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
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
                  const targetBaseName = normalize(modName.split(/[\\/]/).pop()?.replace(/\.(package|ts4script|cfg|ini)$/i, "") || "");
                  return m.flavors.some((f: any) => {
                    const cleanF = normalize(f.name.split(/[\\/]/).pop()?.replace(/\.(package|ts4script|cfg|ini)$/i, "") || "");
                    return cleanF === targetBaseName;
                  });
                });
                if (virtualParent) {
                  parsedStructure = virtualParent.folder_structure;
                  if (typeof parsedStructure === 'string') {
                    try { parsedStructure = JSON.parse(parsedStructure); } catch (e) { }
                  }
                }
              }
            }

            if (modObj && modObj.isVirtual) {
              deployMods.push({ path: modObj.name, allow_write: true, folder_structure: parsedStructure || null, target_path: null });
            } else {
              deployMods.push({ path: virtualParent ? `${virtualParent.name}/${modName}` : modName, allow_write: true, target_path: tPath || modName });
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
    await supabase.from('logical_conflicts').insert([{
      mod_a_id: activeReport.id,
      mod_b_id: conflictTarget.id,
      severity_rank: severity,
      resolution_note: resolution
    }]);
    setIsSubmitting(false);
    setTestRun(false);
    setTestLog("");
    setResolution("");
  };

  let filteredReports = labReports.filter(mod =>
    (mod.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (mod.master_author || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const seenLabNames = new Set();
  filteredReports = filteredReports.filter(mod => {
    if (!mod.name) return true;
    const lowerName = mod.name.toLowerCase();
    if (seenLabNames.has(lowerName)) return false;
    seenLabNames.add(lowerName);
    return true;
  });

  const pendingReports = filteredReports.filter((mod: any) => mod.status === 'under_review');
  const completedReports = filteredReports.filter((mod: any) => mod.status !== 'under_review');

  const tabs = [
    {
      id: "overview",
      label: t("landing_overview") || "Overview",
      icon: "dashboard",
      number: filteredReports.length.toString()
    },
    {
      id: "pending",
      label: t("pending") || "Pending",
      icon: "schedule",
      number: pendingReports.length.toString()
    },
    {
      id: "completed",
      label: t("status_completed") || "Completed",
      icon: "check_circle",
      number: completedReports.length.toString()
    },
    {
      id: "known_errors",
      label: t("exc_rules_user_tab_title", "Known Errors"),
      icon: t("icon_rule_settings", "rule_settings"),
      number: getExceptionRules(activeGameSchema).length.toString()
    }
  ];

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="schedule"
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending") || "Recent Pending"}
        isEmpty={pendingReports.length === 0}
        emptyIcon="check_circle"
        emptyTitle={t("no_pending") || "No Pending Reports"}
      >
        {pendingReports.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view") || "View"} />
        ))}
      </HubOverviewSection>

      <HubOverviewSection
        icon="check_circle"
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed") || "Recent Completed"}
        isEmpty={completedReports.length === 0}
        emptyIcon="history"
        emptyTitle={t("no_history") || "No History"}
      >
        {completedReports.slice(0, 4).map((mod: any) => (
          <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view") || "View"} />
        ))}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("tab_diagnostics") || "Lab"}
        headerSubtitle={t("lab_diagnostics_desc") || "Automated lab testing and diagnostics"}
        headerIcon="science"
        headerIconColorClass="theme-text-accent"
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={(t("search_ph") || "Search diagnostics...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={tabs}
        actions={
          filterTab === 'known_errors'
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
        {filterTab === 'overview' && renderLanding()}

        {filterTab === 'pending' && (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {pendingReports.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : (t("icon_monitor_heart") || "monitor_heart")} title={searchTerm ? (t("no_matches") || "No matches") : (t("no_diagnostics") || "No diagnostics")} className="col-span-full py-16" />
              ) : pendingReports.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view") || "View"} />
              ))}
            </div>
            {pendingReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} / {pendingReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'completed' && completedReports.length > 0 && (
          <div className="flex flex-col gap-4 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
              {completedReports.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view") || "View"} />
              ))}
            </div>
            {completedReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest transition-all"
              >
                {t("ui_btn_load_more") || "Load More"} ({visibleCount} / {completedReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'completed' && completedReports.length === 0 && (
          <EmptyState icon={searchTerm ? "search_off" : (t("icon_monitor_heart") || "monitor_heart")} title={searchTerm ? (t("no_matches") || "No matches") : (t("no_completed_reports") || "No completed reports")} className="py-16 mt-10" />
        )}

        {filterTab === 'known_errors' && (
          <div className="flex flex-col gap-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <KnownErrorRulesManager
              searchQuery={searchTerm}
              canEdit={true}
              externalTriggerCreate={triggerCreateRule}
              externalTriggerCreateGameBug={triggerCreateGameBug}
              hideTopBarButton={true}
            />
          </div>
        )}
      </ElevatedHubLayout>

      {activeReport && (
        <SidePanel
          isOpen={!!activeReport}
          onClose={closePanel}
          title={t("diagnostic_panel_title") || "Homestead Diagnostics"}
          icon="monitor_heart"
          subtitle={`UUID: ${activeReport.id}`}
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
                        ? (t("auto_conclude_pass") || "Conclude Pass")
                        : t("lab_tooltip_approve_locked", "Approval Locked (Lab Test Required)")
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
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col min-h-full gap-8">
            <SidePanelTitleInput
              value={activeReport?.name || ""}
              readOnly
              subtitle={t("target_artifact") || "Target Artifact"}
            />

            {submittedLog && (
              <UniversalGroup
                title={t("diag_submitted_log_title", "Submitted Crash Log & Telemetry")}
                icon={t("icon_terminal", "terminal")}
              >
                <KnownErrorDiagnosisBanner
                  logText={submittedLog}
                  canEdit={true}
                  reportFailed={true}
                />
                <pre className="w-full glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] font-mono text-[11px] text-[var(--text)] max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-all leading-relaxed">
                  {formatHumanReadableLogText(submittedLog)}
                </pre>
              </UniversalGroup>
            )}

            <LabVerificationGate
              dnaHash={activeReport?.dna_hash || activeReport?.hash || activeReport?.id}
              modName={activeReport?.name || "Diagnostic Target"}
              physicalPath={activeReport?.physical_path || activeReport?.name}
              roleContext="lab"
              isGateRequired={true}
              externalStatus={diagSessionStatus}
              onStatusChange={(st) => setIsDiagVerified(st.verified)}
            />

            <UniversalGroup title={t("section_deps_title") || "Dependencies"} icon={t("icon_account_tree") || "account_tree"}>
              <p className="text-[9px] text-[var(--subtext)] opacity-60 capitalize tracking-widest -mt-2">{t("diagnostic_dependencies_desc") || "Select dependencies required for testing"}</p>
              <ModSearchDropdown
                selectedItem={null}
                onSelect={handleSelectDependency}
                onClear={() => { }}
                placeholder={t("search_dep_ph") || "Search dependency..."}
                modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
              />
              {dependencies.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {dependencies.map(d => (
                    <div key={d.id} className="flex justify-between items-center px-5 h-12 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-sm font-bold">
                      <span className="truncate pr-4">{d.name}</span>
                      <button onClick={() => handleRemoveDependency(d.id)} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0 transition-colors">
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_close") || "close"}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </UniversalGroup>

            <UniversalGroup title={t("diagnostic_conflict_target") || "Conflict Target"} icon={t("icon_warning") || "warning"} headerColorClass="text-[var(--warning)]">
              <p className="text-[9px] text-[var(--subtext)] opacity-60 capitalize tracking-widest -mt-2">{t("diagnostic_conflict_target_desc") || "Optional artifact to test against"}</p>
              {conflictTarget ? (
                <div className="flex justify-between items-center px-5 h-16 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)]">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black capitalize tracking-widest text-[var(--warning)] mb-0.5">{t("auto_testing_conflict_with") || "Testing Conflict With"}</span>
                    <span className="text-sm font-bold truncate">{conflictTarget.name}</span>
                  </div>
                  <button onClick={() => setConflictTarget(null)} className="w-8 h-8 rounded-lg hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0 transition-colors">
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete") || "delete"}</span>
                  </button>
                </div>
              ) : (
                <ModSearchDropdown
                  selectedItem={null}
                  onSelect={(m: any) => setConflictTarget(m)}
                  onClear={() => { }}
                  placeholder={t("search_conflict_ph") || "Search conflict target..."}
                  modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
                />
              )}
            </UniversalGroup>

            {testRun && (
              <UniversalGroup
                title={t("diagnostic_results") || "Diagnostic Results"}
                icon={t("icon_science") || "science"}
                headerColorClass={testPassed ? 'text-[var(--success)]' : 'text-[var(--danger)]'}
                className="pb-24"
              >
                <div className={`p-5 glass-surface rounded-xl flex items-center gap-4 border ${testPassed ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]'}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${testPassed ? 'border-[color-mix(in_srgb,var(--success)_50%,transparent)] bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]' : 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)]'}`}>
                    <span className="material-symbols-outlined !text-[24px]">{testPassed ? 'check_circle' : 'error'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-lg font-black capitalize tracking-widest ${testPassed ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {testPassed ? (t("test_passed") || "Test Passed") : (t("test_failed") || "Test Failed")}
                    </span>
                    <span className="text-[10px] font-bold capitalize tracking-widest text-[var(--text)] opacity-60">
                      {t("injection_sim") || "Injection Simulation"}
                    </span>
                  </div>
                </div>

                {testLog && (
                  <div className="mt-4">
                    <KnownErrorDiagnosisBanner
                      logText={testLog}
                      canEdit={true}
                      reportFailed={!testPassed}
                    />
                  </div>
                )}

                <div className="mt-4 w-full glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] font-mono text-[10px] text-[var(--subtext)] max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed">
                  {testLog ? formatHumanReadableLogText(testLog) : (t("no_logs_generated") || "No logs generated.")}
                </div>

                {!testPassed && conflictTarget && (
                  <div className="mt-4 border-t border-[color-mix(in_srgb,var(--danger)_20%,transparent)] pt-6">
                    <h3 className="text-sm font-black theme-text-accent capitalize tracking-widest mb-4">{t("btn_add_to_nexus") || "Add Conflict Rule"}</h3>
                    <form onSubmit={submitToNexus} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("resolution_suggestion") || "Resolution Suggestion"}</label>
                        <input required value={resolution} onChange={e => setResolution(e.target.value)} placeholder={t("auto_e_g_load_31") || "e.g. Load after..."} className="glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("severity") || "Severity"}</label>
                        <CustomTierDropdown value={severity} onChange={(val: any) => setSeverity(val)} />
                      </div>
                      <button type="submit" disabled={isSubmitting} className="w-full py-4 theme-bg-success text-[var(--bg)] font-black text-[10px] capitalize tracking-widest rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 mt-2">
                        {isSubmitting ? (t("btn_saving") || "Saving...") : (t("btn_save_conflict_rule") || "Save Conflict Rule")}
                      </button>
                    </form>
                  </div>
                )}
              </UniversalGroup>
            )}
          </div>
        </SidePanel>
      )}

      <SidePanel
        isOpen={isMissingArtifactPanelOpen}
        onClose={() => setIsMissingArtifactPanelOpen(false)}
        title={t("missing_artifacts") || "Missing Artifacts"}
        icon="download"
        widthClass="w-[450px]"
        headerActions={
          <PanelHeaderGroup>
            {activeReport?.download_url ? (
              <PanelHeaderButton icon="download" tooltip={t("download_source") || "Download Source"} onClick={() => window.open(activeReport.download_url, "_blank")} />
            ) : null}
            <PanelHeaderButton icon="search" tooltip={t("search_web") || "Search Web"} onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((useStore.getState().activeGameSchema?.display_name || "Mod") + ' ' + cleanSearchName(activeReport?.name || '', useStore.getState().activeGameSchema))}`, "_blank")} />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col h-full gap-8">
          <SidePanelTitleInput
            value={activeReport?.name || ""}
            readOnly
            subtitle={t("missing_dependency_desc") || "Missing Local Artifact"}
          />
          <div className="p-6 glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined !text-[48px] text-[var(--warning)] opacity-80">{t("icon_extension_off") || "extension_off"}</span>
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest">{t("missing_dependency_desc") || "Artifact is missing from local storage."}</span>
          </div>
        </div>
      </SidePanel>
    </>
  );
}







