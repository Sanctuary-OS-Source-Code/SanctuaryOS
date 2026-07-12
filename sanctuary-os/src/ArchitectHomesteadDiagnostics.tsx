import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DashboardStatTile, fetchAllPaginated, CustomTierDropdown, getExtensionRegex } from "./shared";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import {
  ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion
} from "./shared";
import { ArtifactCard, VaultCard } from "./Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "./ArchitectHub";
import { MasonStatusDropdown } from "./MasonHub";
import { logArchitectAction } from "./lib/audit";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import MarkdownRenderer from "./MarkdownRenderer";


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

  const [severity, setSeverity] = useState(4);
  const [resolution, setResolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState<'pending' | 'completed'>('pending');
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    const fetchData = async () => {
      const { data: logsData } = await supabase
        .from('homestead_lab_logs')
        .select('*, mods(*), mod_versions(dna_hash)')
        .order('created_at', { ascending: false });

      if (logsData) {
        const uniqueModsMap = new Map();
        logsData.forEach((log: any) => {
          let mod = log.mods;
          if (Array.isArray(mod)) mod = mod[0];
          if (!mod) return;
          if (!['under_review', 'verified', 'broken'].includes(mod.status)) return;
          
          let hash = mod.id;
          if (log.mod_versions) {
            hash = Array.isArray(log.mod_versions) ? log.mod_versions[0]?.dna_hash : log.mod_versions.dna_hash;
          }
          hash = hash || mod.id;

          if (!uniqueModsMap.has(hash)) {
            uniqueModsMap.set(hash, mod);
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
    if (activeReport && allMods.length > 0) {
      supabase.from("homestead_lab_logs")
        .select("tester_note")
        .eq("mod_id", activeReport.id)
        .limit(1)
        .then(({ data, error }) => {
          if (error) {
            console.warn("Could not fetch homestead_lab_logs:", error);
            return;
          }
          if (data && data.length > 0 && data[0].tester_note) {
            try {
              const ctx = JSON.parse(data[0].tester_note);
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
        });
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
      await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });

      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean") {
          setTestPassed(false);
          setTestLog(res);
          setTestRun(true);
          setIsLoading(false);
          clearInterval(interval);
          setLogWatcher(null);
          await invoke("airgap_saves", { docsPath: dPath, enable: false });
        }
      }, 5000);
      setLogWatcher(interval);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const concludeTest = async (passed: boolean) => {
    if (logWatcher) clearInterval(logWatcher);
    try {
      const config: any = await invoke("get_saved_coordinates");
      const dPath = config.mods_path.split(/[\\/]Mods/i)[0];
      await invoke("airgap_saves", { docsPath: dPath, enable: false });
    } catch (e) { }

    setTestPassed(passed);
    setTestRun(true);
    setIsLoading(false);

    const finalStatus = passed ? "verified" : "broken";
    await supabase.from('mods').update({ status: finalStatus }).eq('id', activeReport.id);

    setLabReports(prev => prev.map(r => r.id === activeReport.id ? { ...r, status: finalStatus } : r));
    closePanel();

    const lastSet = localStorage.getItem("sanctuary_active_set");
    if (lastSet) {
      const config: any = await invoke("get_saved_coordinates");
      const playsetsStr = localStorage.getItem("sanctuary_playsets");
      if (playsetsStr) {
        const sets = JSON.parse(playsetsStr);
        const activeSet = sets.find((s: any) => s.name === lastSet);
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

  const pendingReports = filteredReports.filter(mod => mod.status === 'under_review');
  const completedReports = filteredReports.filter(mod => mod.status !== 'under_review');

  return (
    <div className="flex flex-col w-full relative">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_monitor_heart")}</span>
          </div>
          <span className="truncate">{t("tab_lab") || "Homestead DIAGNOSTICS"?.replace("🧪 ", "") || "Homestead Diagnostics"}</span>
        </h2>
        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t("search_ph")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>
          <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 shadow-inner h-12 shrink-0 hidden md:flex">
            <button onClick={() => setFilterTab('pending')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_pending")}</button>
            <button onClick={() => setFilterTab('completed')} className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'completed' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("status_completed")}</button>
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-10 pb-32">
        {filterTab === 'pending' && pendingReports.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {pendingReports.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : t("icon_monitor_heart") || "healing"} title={searchTerm ? t("no_matches") : t("no_diagnostics") || "No Pending Diagnostics"} className="col-span-full py-16" />
              ) : pendingReports.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view")} />
              ))}
            </div>
            {pendingReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] font-black uppercase tracking-widest transition-all"
              >
                {t("ui_btn_load_more")} ({visibleCount} / {pendingReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'pending' && pendingReports.length === 0 && (
          <EmptyState icon={searchTerm ? "search_off" : t("icon_monitor_heart") || "healing"} title={searchTerm ? t("no_matches") : t("no_pending_reports") || "No Pending Reports"} className="py-16 mt-10" />
        )}

        {filterTab === 'completed' && completedReports.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {completedReports.length === 0 ? (
                <EmptyState icon={searchTerm ? "search_off" : t("icon_monitor_heart") || "healing"} title={searchTerm ? t("no_matches") : t("no_diagnostics") || "No Completed Diagnostics"} className="col-span-full py-16" />
              ) : completedReports.slice(0, visibleCount).map((mod: any) => (
                <ArtifactCard key={mod.id} mod={mod} onClick={() => setActiveReport(mod)} masonsList={allMasons} overrideActionLabel={t("btn_view")} />
              ))}
            </div>
            {completedReports.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 100)}
                className="w-full py-4 mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] font-black uppercase tracking-widest transition-all"
              >
                {t("ui_btn_load_more")} ({visibleCount} / {completedReports.length})
              </button>
            )}
          </div>
        )}

        {filterTab === 'completed' && completedReports.length === 0 && (
          <EmptyState icon={searchTerm ? "search_off" : t("icon_monitor_heart") || "healing"} title={searchTerm ? t("no_matches") : t("no_completed_reports") || "No Completed Reports"} className="py-16 mt-10" />
        )}
      </div>

      {activeReport && (
        <SidePanel
          isOpen={!!activeReport}
          onClose={closePanel}
          title={t("diagnostic_panel_title")}
          icon="monitor_heart"
          footer={
            (!testRun || isLoading) ? (
              <div className="flex flex-col w-full gap-4">
                {isLoading && (
                  <div className="flex gap-4">
                    <button onClick={() => concludeTest(true)} className="flex-1 py-4 bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/20 hover:theme-text-success transition-all shadow-lg border border-white/5 hover:border-green-500/50">
                      {t("auto_conclude_pass")}
                    </button>
                    <button onClick={() => concludeTest(false)} className="flex-1 py-4 bg-white/10 text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/20 hover:theme-text-danger transition-all shadow-lg border border-white/5 hover:border-red-500/50">
                      {t("auto_conclude_fail")}
                    </button>
                  </div>
                )}

                {!testRun && (
                  <div className="w-full">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center p-6 theme-glass-inner rounded-xl gap-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]">
                        <div className="w-8 h-8 border-4 border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-t-[var(--accent)] rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse mt-1 theme-text-accent">{t("diagnostic_running")}</span>
                      </div>
                    ) : isModMissingLocally(activeReport.name) ? (
                      <button
                        onClick={() => setIsMissingArtifactPanelOpen(true)}
                        className="w-full h-14 theme-glass-panel border border-[var(--warning)]/50 text-[var(--warning)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--warning)]/10 transition-all shadow-[0_0_20px_rgba(var(--warning-rgb),0.15)] flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_download")}</span>
                        {t("missing_artifacts")}
                      </button>
                    ) : (
                      <button
                        onClick={runSimulation}
                        className="w-full h-14 theme-glass-panel border border-[var(--accent)]/50 text-[var(--accent)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--accent)]/10 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_play_arrow")}</span>
                        {t("btn_run_diagnostic")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">

              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_my_location")}</span>
                  {t("target_artifact")}
                </h4>
                <div className="flex flex-col gap-2 relative z-10">
                  <span className="theme-glass-inner rounded-xl px-5 h-12 flex items-center text-[var(--text)] text-sm font-bold bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{activeReport?.name}</span>
                </div>
              </div>

              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <div className="flex flex-col gap-1 border-b border-white/5 pb-4 mb-2">
                  <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_account_tree")}</span>
                    {t("section_deps_title")}
                  </h4>
                  <p className="text-[9px] text-[var(--subtext)] opacity-60 ml-6 uppercase tracking-widest">{t("diagnostic_dependencies_desc")}</p>
                </div>

                <div className="flex flex-col gap-4 relative z-10">
                  <ModSearchDropdown
                    selectedItem={null}
                    onSelect={handleSelectDependency}
                    onClear={() => { }}
                    placeholder={t("search_dep_ph")}
                    modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
                  />
                  {dependencies.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2">
                      {dependencies.map(d => (
                        <div key={d.id} className="flex justify-between items-center px-5 h-12 theme-glass-inner rounded-xl bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-sm font-bold">
                          <span className="truncate pr-4">{d.name}</span>
                          <button onClick={() => handleRemoveDependency(d.id)} className="w-8 h-8 rounded-lg hover:bg-white/10 text-[var(--danger)] flex items-center justify-center shrink-0 transition-colors">
                            <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--warning)]/5 to-transparent pointer-events-none rounded-2xl" />
                <div className="flex flex-col gap-1 border-b border-white/5 pb-4 mb-2">
                  <h4 className="text-[10px] font-black text-[var(--warning)] uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_warning")}</span>
                    {t("diagnostic_conflict_target")}
                  </h4>
                  <p className="text-[9px] text-[var(--subtext)] opacity-60 ml-6 uppercase tracking-widest">{t("diagnostic_conflict_target_desc")}</p>
                </div>

                <div className="flex flex-col gap-4 relative z-10">
                  {conflictTarget ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center px-5 h-16 theme-glass-inner rounded-xl border border-[var(--warning)]/30 text-[var(--text)] bg-[var(--warning)]/5 shadow-[0_0_15px_rgba(var(--warning-rgb),0.1)]">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--warning)] mb-0.5">{t("auto_testing_conflict_with")}</span>
                          <span className="text-sm font-bold truncate">{conflictTarget.name}</span>
                        </div>
                        <button onClick={() => setConflictTarget(null)} className="w-8 h-8 rounded-lg hover:bg-[var(--warning)]/20 text-[var(--warning)] flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ModSearchDropdown
                      selectedItem={null}
                      onSelect={(m: any) => setConflictTarget(m)}
                      onClear={() => { }}
                      placeholder={t("search_conflict_ph")}
                      modList={allMods.filter(m => m.id !== activeReport.id && !dependencies.some(d => d.id === m.id))}
                    />
                  )}
                </div>
              </div>

              {testRun && (
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative animate-in slide-in-from-bottom-4">
                  <div className={`absolute inset-0 bg-gradient-to-br ${testPassed ? 'from-[var(--success)]/10' : 'from-[var(--danger)]/10'} to-transparent pointer-events-none rounded-2xl`} />
                  <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2 ${testPassed ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_science")}</span>
                    {t("diagnostic_results")}
                  </h4>

                  <div className="flex flex-col relative z-10">
                    <div className={`p-5 theme-glass-inner rounded-xl flex items-center gap-4 border ${testPassed ? 'border-[var(--success)]/30 bg-[var(--success)]/5 shadow-[0_0_20px_rgba(var(--success-rgb),0.1)]' : 'border-[var(--danger)]/30 bg-[var(--danger)]/5 shadow-[0_0_20px_rgba(var(--danger-rgb),0.1)]'}`}>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${testPassed ? 'border-[var(--success)]/50 bg-[var(--success)]/20 text-[var(--success)]' : 'border-[var(--danger)]/50 bg-[var(--danger)]/20 text-[var(--danger)]'}`}>
                        <span className="material-symbols-outlined !text-[24px]">{testPassed ? 'check_circle' : 'error'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-lg font-black uppercase tracking-widest ${testPassed ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {testPassed ? t("test_passed") : t("test_failed")}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text)] opacity-60">
                          {t("injection_sim")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 w-full theme-glass-panel rounded-xl p-4 border border-white/5 font-mono text-[10px] text-[var(--subtext)] max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed">
                      {testLog || "No logs generated."}
                    </div>

                    {!testPassed && conflictTarget && (
                      <div className="mt-4 border-t border-[var(--danger)]/20 pt-6">
                        <h3 className="text-sm font-black theme-text-accent uppercase tracking-widest">{t("btn_add_to_nexus")}</h3>
                        <form onSubmit={submitToNexus} className="flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("resolution_suggestion")}</label>
                            <input required value={resolution} onChange={e => setResolution(e.target.value)} placeholder={t("auto_e_g_load_mod_a_after_mod_b")} className="theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent" />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("severity")}</label>
                            <CustomTierDropdown value={severity} onChange={(val) => setSeverity(val)} />
                          </div>
                          <button type="submit" disabled={isSubmitting} className="w-full py-4 theme-bg-success text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 mt-2">
                            {isSubmitting ? "Saving..." : "Save Conflict Rule"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </SidePanel>
      )}

      <SidePanel
        isOpen={isMissingArtifactPanelOpen}
        onClose={() => setIsMissingArtifactPanelOpen(false)}
        title={t("missing_artifacts")}
        icon="download"
        widthClass="w-[450px]"
        footer={
          <div className="flex flex-col gap-4 mt-4 w-full">
            {activeReport?.download_url ? (
              <button onClick={() => window.open(activeReport.download_url, "_blank")} className="w-full h-14 theme-glass-panel border border-[var(--warning)]/50 text-[var(--warning)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--warning)]/10 transition-all shadow-[0_0_20px_rgba(var(--warning-rgb),0.15)] flex items-center justify-center gap-2">
                <span className="material-symbols-outlined !text-[16px]">{t("auto_download")}</span> {t("download_source")}
              </button>
            ) : null}
            <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent((activeReport?.name || '') + ' mod download')}`, "_blank")} className="w-full h-14 theme-glass-panel border border-[var(--accent)]/50 text-[var(--accent)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--accent)]/10 transition-all shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] flex items-center justify-center gap-2">
              <span className="material-symbols-outlined !text-[16px]">{t("icon_search")}</span> {t("search_web")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col p-8 gap-6">
          <div className="p-6 theme-glass-panel border border-[var(--warning)]/30 rounded-[var(--radius)] flex flex-col items-center justify-center gap-4 text-center mt-8">
            <span className="material-symbols-outlined !text-[48px] text-[var(--warning)] opacity-80">{t("icon_extension_off")}</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-black text-[var(--text)] uppercase tracking-widest">{activeReport?.name}</span>
              <span className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest">{t("missing_dependency_desc")}</span>
            </div>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}


