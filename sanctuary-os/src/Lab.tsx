import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, ModSearchDropdown, HubTabButton, CustomDropdown, ActionButton, FilterTabs, FilterTabButton, SidePanel } from "./shared";
import { CommandScreenLayout, DashboardStatTile, CommandScreenStats, CommandScreenQuickLink } from "./hub-components/SharedCommandScreenLayout";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

export default function Lab({
  activeLabMod, setActiveLabMod, modList = [],
  concludeTest, executeHotSwap, shelterActive, conflictTarget, setConflictTarget,
  testErrorFound, testLogSnippet, isSubmittingReport, submitLabReport,
  labQueue = [], labVerificationQueue = [], labConflicts = [],
  associatedMods = []
}: any) {
  const { t } = useLexicon();

  const [stagedExtras, setStagedExtras] = useState<any[]>([]);
  const [conflictExtras, setConflictExtras] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("DASHBOARD");
  const [lastTestResult, setLastTestResult] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sanctuary_test_history") || "[]");
    } catch {
      return [];
    }
  });

  const [searchLogs, setSearchLogs] = useState("");
  const [logFilter, setLogFilter] = useState("all");

  useEffect(() => {
    if (testLogSnippet) {
      setActiveTab("REPORTS");
      if (activeLabMod) {
        setSelectedReport({
          id: "concluding_test",
          mod: activeLabMod,
          errorFound: testErrorFound,
          time: new Date().toISOString(),
          logSnippet: testLogSnippet,
          conflictTarget: conflictTarget,
          stagedExtras: stagedExtras,
          conflictExtras: conflictExtras,
          isConcluding: true
        });
      }
    }
  }, [testLogSnippet, activeLabMod, testErrorFound, conflictTarget, stagedExtras, conflictExtras]);

  useEffect(() => {
    let depsToStage: any[] = [];
    
    if (activeLabMod && activeLabMod.dependencies) {
      let rawDeps: string[] = [];
      if (typeof activeLabMod.dependencies === 'string') {
        rawDeps = activeLabMod.dependencies.split(',').map((s: string) => s.trim()).filter(Boolean);
      } else if (Array.isArray(activeLabMod.dependencies)) {
        rawDeps = [...activeLabMod.dependencies].filter(Boolean);
      }
      
      const cleanName = (name: string) => name ? name.replace(/_/g, " ").replace(/(\.| |-)*(\(|\[)?(package|ts4scripts?|scripts?|zip)(\)|\])?/gi, "").trim().toUpperCase() : "";

      const foundDeps = rawDeps
        .map(depName => modList.find((m: any) => {
          if (m === activeLabMod) return false;
          if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash) return false;
          if (m.name && activeLabMod.name && m.name === activeLabMod.name) return false;
          
          if (!m.name) return false;
          
          const isDBScript = depName.toLowerCase().includes("script");
          const isLocalScript = m.name.toLowerCase().includes("script");
          if (isDBScript !== isLocalScript) return false;

          return (cleanName(m.name) === cleanName(depName) || cleanName(m.displayName) === cleanName(depName) || (m.path && m.path.includes(depName) && depName.length > 3));
        }))
        .filter(Boolean);
      
      depsToStage = [...depsToStage, ...foundDeps];
    }

    if (activeLabMod && associatedMods && associatedMods.length > 0) {
      const extraDeps = associatedMods
        .map((am: any) => modList.find((m: any) => {
          if (m === activeLabMod) return false;
          if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash) return false;
          if (m.name && activeLabMod.name && m.name === activeLabMod.name) return false;
          
          if (am.hash && m.hash === am.hash) return true;
          if (am.id && m.id === am.id) return true;
          
          if (!am.name || !m.name) return false;
          
          const isDBScript = (am.file_extension && am.file_extension.toLowerCase().includes("script")) || (am.name && am.name.toLowerCase().includes("script"));
          const isLocalScript = m.name && m.name.toLowerCase().includes("script");
          if (isDBScript !== isLocalScript) return false;
          
          const cleanName = (name: string) => name ? name.replace(/_/g, " ").replace(/(\.| |-)*(\(|\[)?(package|ts4scripts?|scripts?|zip)(\)|\])?/gi, "").trim().toUpperCase() : "";
          if (cleanName(m.displayName || m.name) === cleanName(am.name)) return true;
          
          return false;
        }))
        .filter(Boolean);
      
      depsToStage = [...depsToStage, ...extraDeps];
    }
    
    if (activeLabMod) {
      const uniqueDeps = Array.from(new Map(depsToStage.map(item => [item.hash || item.name, item])).values());
      setStagedExtras(uniqueDeps);
    } else {
      setStagedExtras([]);
    }
  }, [activeLabMod, associatedMods, modList]);

  const handleExportLogs = async () => {
    try {
      const path = await save({ defaultPath: 'Solder_Lab_Report.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (path) {
        await writeTextFile(path, testLogSnippet || "");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const runCombinedHotSwap = () => {
    const extraNames = [...stagedExtras, ...conflictExtras].map(m => m.name);
    executeHotSwap(extraNames);
  };

  const getModName = (mod: any) => {
    if (!mod) return "UNKNOWN";
    return mod.displayName || mod.name?.replace(/_/g, ' ') || "UNKNOWN SIGNATURE";
  };

  const abortLab = () => {
    setActiveLabMod(null);
    setConflictTarget(null);
    setStagedExtras([]);
    setConflictExtras([]);
    setActiveTab("DASHBOARD");
  };

  const handleConcludeTest = () => {
    const ctx = {
      conflictTarget: conflictTarget?.name,
      dependencies: [...stagedExtras.map(m => m.name), ...conflictExtras.map(m => m.name)]
    };
    
    const result = {
      id: crypto.randomUUID(),
      mod: activeLabMod,
      errorFound: testErrorFound,
      time: new Date().toISOString(),
      logSnippet: testLogSnippet,
      conflictTarget: conflictTarget,
      stagedExtras: stagedExtras,
      conflictExtras: conflictExtras
    };
    
    setLastTestResult(result);
    setTestHistory((prev: any[]) => {
      const newHistory = [result, ...prev].slice(0, 50);
      localStorage.setItem("sanctuary_test_history", JSON.stringify(newHistory));
      return newHistory;
    });
    
    concludeTest(ctx);
    setStagedExtras([]);
    setConflictExtras([]);
    setConflictTarget(null);
    setSelectedReport(null);
    setActiveTab("DASHBOARD");
  };

  const passedCount = testHistory.filter((m: any) => !m.errorFound).length;
  const failedCount = testHistory.filter((m: any) => m.errorFound).length;
  const totalRanCount = testHistory.length;
  const untestedCount = modList.length - (new Set(testHistory.map(t => t.mod?.hash)).size);

  const realStats = {
    tested: totalRanCount,
    untested: untestedCount,
    totalRan: totalRanCount,
    passed: passedCount,
    failed: failedCount,
    lastTest: testHistory.length > 0 ? (t("time_just_now") || "JUST NOW") : "--"
  };

  let reportsToList = [...testHistory];
  const isConcluding = testLogSnippet || testErrorFound;
  if (isConcluding && activeLabMod) {
    reportsToList.unshift({
      id: "concluding_test",
      mod: activeLabMod,
      errorFound: testErrorFound,
      time: new Date().toISOString(),
      logSnippet: testLogSnippet,
      conflictTarget: conflictTarget,
      stagedExtras: stagedExtras,
      conflictExtras: conflictExtras,
      isConcluding: true
    });
  }

  const filteredReports = reportsToList.filter((report: any) => {
     const m = report.mod;
     if (searchLogs && !m?.name?.toLowerCase().includes(searchLogs.toLowerCase()) && !m?.displayName?.toLowerCase().includes(searchLogs.toLowerCase())) return false;
     
     const isError = report.errorFound;
     const isPass = !report.errorFound;
     
     if (logFilter === 'pass' && !isPass) return false;
     if (logFilter === 'errors' && !isError) return false;
     return true;
  });

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full relative z-10">
      <ViewHeader
        title={t("lab_title")}
        subtitle={t("lab_subtitle")}
        icon={t("icon_science")}
        iconColorClass="text-lime-400 border-lime-500/30"
      />

      <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full animate-in slide-in-from-top-4 duration-500 mb-6 shrink-0">
        <HubTabButton id="DASHBOARD" icon="dashboard" label={t("overview")} activeTab={activeTab} setTab={setActiveTab} />
        <HubTabButton id="BUILDER" icon="science" label={t("tab_lab_builder")} activeTab={activeTab} setTab={setActiveTab} />
        <HubTabButton id="REPORTS" icon="terminal" label={t("tab_lab_reports")} activeTab={activeTab} setTab={setActiveTab} />
      </div>

      {activeTab === "DASHBOARD" && (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
          <div className="flex flex-col gap-10 w-full">
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">science</span>} number={realStats.tested} label={t("stat_mods_tested")} colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">help</span>} number={realStats.untested} label={t("stat_mods_untested")} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">play_circle</span>} number={realStats.totalRan} label={t("stat_total_tests")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">check_circle</span>} number={realStats.passed} label={t("stat_tests_passed")} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">warning</span>} number={realStats.failed} label={t("stat_tests_failed")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" />
            </CommandScreenStats>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full pb-16">
              <div className="xl:col-span-2 flex flex-col gap-6">
                <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] opacity-80">{t("recent_tests_title") || "RECENT TELEMETRY"}</h2>

                <div className="grid grid-cols-1 gap-4">
                  {testHistory.length > 0 ? (
                    testHistory.slice(0, 3).map((test: any, index: number) => (
                      <div key={test.id || index} onClick={() => { setActiveTab("REPORTS"); setSelectedReport(test); }} className={`theme-glass-panel rounded-2xl p-5 border shadow-md transition-colors flex flex-col gap-3 relative overflow-hidden group cursor-pointer ${test.errorFound ? 'border-[var(--danger)]/30 hover:border-[var(--danger)]/50 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : 'border-[var(--success)]/30 hover:border-[var(--success)]/50'}`}>
                        <div className={`absolute top-0 left-0 w-1 h-full opacity-50 group-hover:opacity-100 transition-opacity ${test.errorFound ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`} />
                        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[30px] pointer-events-none mix-blend-screen opacity-0 group-hover:opacity-100 transition-opacity ${test.errorFound ? 'bg-[var(--danger)]/10' : 'bg-[var(--success)]/10'}`} />

                        <div className="flex items-center gap-3 relative z-10">
                          <span className={`material-symbols-outlined !text-[20px] ${test.errorFound ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{test.errorFound ? 'warning' : 'check_circle'}</span>
                          <span className={`text-xs font-black uppercase tracking-widest ${test.errorFound ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>{test.errorFound ? t("fatal_collision") : t("successful_injection")}</span>
                          <span className="text-[10px] font-bold opacity-50 ml-auto">{new Date(test.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-sm font-bold text-[var(--text)] opacity-90 pl-8 line-clamp-1 relative z-10">
                          {test.mod ? getModName(test.mod) : (t("ecosystem_forge") || "ECOSYSTEM FORGE")}
                        </div>
                        <div className="pl-8 text-xs opacity-60 relative z-10 font-mono line-clamp-1">
                          {test.conflictTarget ? `vs ${getModName(test.conflictTarget)}` : t("target_engine_core") || "Target: Engine Core"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="theme-glass-panel rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center opacity-50 space-y-4 shadow-inner">
                      <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)]">history</span>
                      <div className="text-sm font-black uppercase tracking-widest text-[var(--text)]">{t("no_recent_telemetry") || "NO RECENT TELEMETRY"}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] opacity-80">{t("wf_quick_links") || "QUICK LINKS"}</h2>
                <div className="flex flex-col gap-3">
                  <CommandScreenQuickLink
                    icon="science"
                    title="Run Test"
                    subtitle={testHistory.length > 0 ? `Last scan: ${new Date(testHistory[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Ecosystem Forge"}
                    onClick={() => setActiveTab("BUILDER")}
                  />
                  <CommandScreenQuickLink
                    icon="terminal"
                    title="View Past Tests"
                    subtitle="All Telemetry Logs"
                    onClick={() => { setActiveTab("REPORTS"); setLogFilter("all"); }}
                  />
                  <CommandScreenQuickLink
                    icon="check_circle"
                    title="Recent Pass Tests"
                    subtitle="Filter by Stable"
                    onClick={() => { setActiveTab("REPORTS"); setLogFilter("pass"); }}
                    textColorClass="text-[var(--success)]"
                    hoverTextColorClass="group-hover:text-[var(--success)]"
                    iconBorderHoverClass="group-hover:border-[var(--success)]/50 group-hover:bg-[var(--success)]/10"
                    iconShadowClass="group-hover:drop-shadow-[0_0_15px_rgba(var(--success-rgb),0.5)]"
                  />
                  <CommandScreenQuickLink
                    icon="warning"
                    title="Recent Failed Tests"
                    subtitle="Filter by Fatal"
                    onClick={() => { setActiveTab("REPORTS"); setLogFilter("errors"); }}
                    isAlert={true}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "BUILDER" && (
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full mt-2 pb-32">

          <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-3 shrink-0 border-b border-white/5 w-full mb-6 relative z-20">
            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">science</span>
              </div>
              <span className="truncate">{t("tab_lab_builder") || "ECOSYSTEM FORGE"}</span>
            </h2>

            {activeLabMod && (
              <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                <div className="hidden lg:flex flex-col items-end gap-1 px-4 border-r border-white/10">
                  <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("payload") || "PAYLOAD"}</span>
                  <span className="text-xs font-black text-[var(--text)] tracking-widest uppercase">
                    {t("core_plus") || "1 CORE + "}{stagedExtras.length + (conflictTarget ? 1 : 0) + conflictExtras.length}{t("injected") || " INJECTED"}
                  </span>
                </div>

                <div className="flex items-center gap-4 pl-2">
                  <ActionButton
                    icon="close"
                    label={t("lab_btn_abort")}
                    onClick={abortLab}
                    className="!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] !border-[var(--danger)]/30 !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                  />
                  {!shelterActive ? (
                    <ActionButton icon="bolt" label={t("btn_initiate_swap") || "CONDUCT EXPERIMENT"} onClick={runCombinedHotSwap} />
                  ) : (
                    <ActionButton icon="science" label={t("btn_conclude_experiment") || "CONCLUDE TEST"} onClick={handleConcludeTest} className="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[var(--success)]/30 !text-[var(--success)] hover:!bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-8 w-full max-w-[1600px] mx-auto">

            {/* LEFT COLUMN: THE CORE (SUBJECT) */}
            <div className="flex flex-col gap-6 h-full">
              <div className="theme-glass-panel rounded-[var(--radius)] border border-white/5 shadow-xl relative flex flex-col h-full min-h-[500px] overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-50 pointer-events-none" />

                <div className="flex flex-col items-center justify-center text-center p-8 border-b border-white/5 relative z-10">
                  <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shrink-0 mb-4 shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[40px] animate-pulse">{t("icon_science")}</span>
                  </div>
                  <h3 className="text-2xl font-black text-[var(--text)] uppercase tracking-[0.2em]">{t("mount_subject")}</h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 mt-2">{t("mount_desc")}</p>
                </div>

                <div className="p-8 flex-1 flex flex-col justify-center relative z-10">
                  {!activeLabMod ? (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual)}
                      selectedItem={null}
                      onSelect={(m: any) => setActiveLabMod(m)}
                      onClear={() => { }}
                      placeholder={t("filter_dna")}
                    />
                  ) : (
                    <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-2xl shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_20%,transparent)] flex flex-col items-center text-center group/core h-full justify-center">
                      <div className="absolute inset-0 border-[2px] border-dashed border-[var(--accent)] opacity-20 rounded-2xl animate-[spin_20s_linear_infinite] pointer-events-none scale-150" />
                      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-10 blur-[50px] rounded-full pointer-events-none" />

                      <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_80%,transparent)] mb-6">view_in_ar</span>

                      <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                        <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em] bg-black/40 py-1 rounded-full border border-white/10 w-max mx-auto px-4">{t("subject_isolation")}</span>
                        <span className="text-2xl font-black uppercase text-[var(--text)] break-words mt-4">{getModName(activeLabMod)}</span>
                      </div>

                      <button onClick={() => { setActiveLabMod(null); setConflictTarget(null); setStagedExtras([]); setConflictExtras([]); }} className="mt-8 px-6 py-2 rounded-full flex items-center justify-center gap-2 bg-[var(--danger)]/20 hover:bg-[var(--danger)] text-[var(--danger)] hover:text-white transition-all shadow-md relative z-10 border border-[var(--danger)]/30 font-black text-[10px] uppercase tracking-widest"><span className='material-symbols-outlined !text-[16px]'>{t("icon_close")}</span> {t("lab_btn_abort")}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MODIFIERS */}
            <div className="flex flex-col gap-8 h-full">

              {/* SYMBIOTIC GRID */}
              <div className={`theme-glass-panel p-8 rounded-[var(--radius)] border shadow-xl relative flex flex-col flex-1 min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-white/5 grayscale' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                      <span className="material-symbols-outlined text-[var(--text)] opacity-80 !text-[24px]">{t("icon_folder")}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-[var(--text)] uppercase tracking-[0.2em]">{t("symbiotic_deps")}</h3>
                      <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80">{t("symbiotic_desc")}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-20 mb-6">
                  <ModSearchDropdown
                    modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod?.hash && !conflictExtras.find(e => e.hash === m.hash))}
                    selectedItem={null}
                    onSelect={(m: any) => { if (m && !stagedExtras.find(e => e.hash === m.hash)) setStagedExtras([...stagedExtras, m]); }}
                    onClear={() => { }}
                    placeholder={t("add_extra")}
                  />
                </div>

                {stagedExtras.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
                    {stagedExtras.map((m: any) => (
                      <div key={m.hash} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all group/item shadow-sm h-[60px]">
                        <span className="text-[11px] font-black uppercase text-[var(--text)] truncate pr-4">{getModName(m)}</span>
                        <button onClick={() => setStagedExtras(stagedExtras.filter(e => e.hash !== m.hash))} className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[16px]'>{t("icon_close")}</span></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-black/20 text-[var(--subtext)] opacity-50 font-black text-xs uppercase tracking-widest">
                    NO SYMBIOTIC ENTITIES LOADED
                  </div>
                )}
              </div>

              {/* ADVERSARIAL GRID */}
              <div className={`theme-glass-panel p-8 rounded-[var(--radius)] border shadow-xl relative flex flex-col flex-1 min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-white/5 grayscale' : 'border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--warning)]/5 to-transparent opacity-50 rounded-[inherit] pointer-events-none" />
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shrink-0 shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)]">
                      <span className="material-symbols-outlined theme-text-warning opacity-90 !text-[24px] animate-pulse">{t("icon_warning_amber")}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-black theme-text-warning uppercase tracking-[0.2em]">{t("adversarial_entities")}</h3>
                      <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80">{t("adversarial_desc")}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-20 mb-6">
                  {!conflictTarget ? (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod?.hash).map((m: any) => ({ ...m, displayName: getModName(m) }))}
                      selectedItem={conflictTarget}
                      onSelect={setConflictTarget}
                      onClear={() => setConflictTarget(null)}
                      placeholder={t("select_adversary")}
                    />
                  ) : (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod?.hash && m.hash !== conflictTarget?.hash && !stagedExtras.find(e => e.hash === m.hash))}
                      selectedItem={null}
                      onSelect={(m: any) => { if (m && !conflictExtras.find(e => e.hash === m.hash)) setConflictExtras([...conflictExtras, m]); }}
                      onClear={() => { }}
                      placeholder={t("add_extra")}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-4 relative z-10 flex-1">
                  {conflictTarget ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
                      <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] p-4 rounded-xl shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_10%,transparent)] flex justify-between items-center group md:col-span-2 h-[80px]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--warning)] opacity-10 blur-[30px] rounded-full pointer-events-none" />
                        <div className="flex flex-col gap-1 relative z-10 min-w-0 pr-4">
                          <span className="text-[9px] font-black theme-text-warning uppercase tracking-[0.3em]">{t("primary_adversary")}</span>
                          <span className="text-sm font-black uppercase text-[var(--text)] truncate">{getModName(conflictTarget)}</span>
                        </div>
                        <button onClick={() => { setConflictTarget(null); setConflictExtras([]); }} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-[var(--danger)] text-[var(--text)] hover:text-white transition-all shadow-md relative z-10"><span className='material-symbols-outlined !text-[20px]'>{t("icon_close")}</span></button>
                      </div>

                      {conflictExtras.map((m: any) => (
                        <div key={m.hash} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] border border-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] transition-all group/item shadow-sm h-[60px]">
                          <span className="text-[11px] font-black uppercase text-[var(--text)] truncate pr-4">{getModName(m)}</span>
                          <button onClick={() => setConflictExtras(conflictExtras.filter(e => e.hash !== m.hash))} className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[16px]'>{t("icon_close")}</span></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-[var(--warning)]/20 rounded-xl bg-[var(--warning)]/5 text-[var(--warning)] opacity-70 font-black text-xs uppercase tracking-widest">
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

          <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20">
            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-90 drop-shadow-lg">terminal</span>
              </div>
              <span className="truncate">{t("tab_lab_reports")}</span>
            </h2>

            <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
              <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
                <input
                  type="text"
                  placeholder={t("search_logs")}
                  value={searchLogs}
                  onChange={(e) => setSearchLogs(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--text)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--text)]/50 placeholder:opacity-40"
                />
                {searchLogs && (
                  <button onClick={() => setSearchLogs("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>

              <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[300px] shrink-0 relative z-50 h-12">
                <FilterTabs className="w-full">
                  <FilterTabButton id="all" label={t("all_logs") || "All Logs"} activeTab={logFilter} setTab={setLogFilter} />
                  <FilterTabButton id="pass" label={t("verified") || "Verified"} activeTab={logFilter} setTab={setLogFilter} />
                  <FilterTabButton id="errors" label={t("fatal") || "Fatal"} activeTab={logFilter} setTab={setLogFilter} />
                </FilterTabs>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-32">
            {filteredReports.map((report: any) => {
              const isError = report.errorFound;
              return (
                <div key={report.id} onClick={() => setSelectedReport(report)} className={`theme-glass-panel rounded-2xl p-5 border shadow-md transition-all flex flex-col gap-3 relative overflow-hidden group cursor-pointer hover:-translate-y-1 hover:shadow-xl ${isError ? 'border-[var(--danger)]/30 hover:border-[var(--danger)]/50 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : 'border-[var(--success)]/30 hover:border-[var(--success)]/50'}`}>
                  <div className={`absolute top-0 left-0 w-1 h-full opacity-50 group-hover:opacity-100 transition-opacity ${isError ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`} />
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[30px] pointer-events-none mix-blend-screen opacity-0 group-hover:opacity-100 transition-opacity ${isError ? 'bg-[var(--danger)]/10' : 'bg-[var(--success)]/10'}`} />

                  <div className="flex items-center gap-3 relative z-10">
                    <span className={`material-symbols-outlined !text-[20px] ${isError ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{isError ? 'warning' : 'check_circle'}</span>
                    <span className={`text-xs font-black uppercase tracking-widest ${isError ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>{isError ? t("fatal_collision") : t("successful_injection")}</span>
                    {report.isConcluding && <span className="text-[10px] font-bold opacity-50 ml-auto text-amber-400 animate-pulse">PENDING REVIEW</span>}
                  </div>
                  <div className="text-sm font-bold text-[var(--text)] opacity-90 pl-8 line-clamp-1 relative z-10">
                    {getModName(report.mod)}
                  </div>
                  <div className="pl-8 text-xs opacity-60 relative z-10 font-mono line-clamp-1">
                    {report.conflictTarget ? `vs ${getModName(report.conflictTarget)}` : t("target_engine_core") || "Target: Engine Core"}
                  </div>
                </div>
              );
            })}
            
            {filteredReports.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center space-y-6 mt-10">
                <div className="opacity-50 flex flex-col items-center justify-center space-y-6">
                  <span className="material-symbols-outlined !text-[80px] text-[var(--subtext)]">terminal</span>
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-black uppercase tracking-widest text-[var(--text)]">{t("lab_reports_empty")}</h2>
                    <p className="text-sm font-medium text-[var(--subtext)]">{t("lab_reports_empty_desc")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedReport && (() => {
        const isError = selectedReport.errorFound;
        const logData = selectedReport.logSnippet;
        
        return (
          <SidePanel
            isOpen={true}
            onClose={() => setSelectedReport(null)}
            title={getModName(selectedReport.mod)}
            subtitle={isError ? t("status_broken") : t("verified")}
            icon={isError ? "warning" : "science"}
            iconColorClass={isError ? "text-[var(--danger)]" : "text-[var(--success)]"}
            widthClass="w-[90vw] md:w-[800px]"
            headerActions={
              <div className="flex flex-wrap items-center gap-4 mt-4 lg:mt-0">
                  <button onClick={handleExportLogs} className="py-2.5 px-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[var(--radius)] font-black text-[10px] uppercase tracking-[0.2em] text-[var(--text)] transition-all flex items-center justify-center gap-2 shadow-sm">
                    <span className="material-symbols-outlined !text-[16px]">download</span>
                    {t("export_logs")}
                  </button>
                  {selectedReport.isConcluding && shelterActive && (
                    <button
                      onClick={handleConcludeTest}
                      className={`py-2.5 px-6 rounded-[var(--radius)] font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 border shadow-sm ${isError ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:border-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)]'}`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">{isError ? 'shield' : 'verified_user'}</span>
                      {isError ? (t("secure_broken")) : (t("secure_verified"))}
                    </button>
                  )}
              </div>
            }
          >
            <div className="flex-1 min-h-[400px] theme-glass-panel backdrop-blur-xl border border-white/5 rounded-2xl p-6 font-mono text-[13px] text-[var(--text)] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col mb-10 mt-6">
              <div className="flex items-center gap-3 mb-6 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4 shrink-0">
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-50 !text-[18px]">{t("icon_terminal") || "terminal"}</span>
                <span className="text-[var(--subtext)] opacity-70 uppercase tracking-widest text-[11px] font-black">
                   {t("execution_logs") || "EXECUTION LOGS"} // {t("system_stdout") || "SYSTEM_STDOUT"}
                </span>
                
                {isError && (
                  <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-[var(--danger)] uppercase tracking-widest bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-3 py-1.5 rounded-lg">
                    <span className="material-symbols-outlined !text-[14px]">warning</span>
                    CRITICAL FAILURE
                  </div>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-all leading-relaxed flex-1 opacity-80 font-mono">
                {logData || t("no_logs") || "No logs available for this session. System reports standard exit code."}
              </pre>
            </div>
          </SidePanel>
        );
      })()}




    </div>
  );
}
