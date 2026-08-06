import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, ModSearchDropdown, HubTabButton, CustomDropdown, ActionButton, FilterTabs, FilterTabButton, SidePanel, SidePanelActionFooter } from "./shared";
import { CommandScreenLayout, DashboardStatTile, CommandScreenStats, CommandScreenQuickLink, CommandScreenSectionHeading, CommandScreenBody, CommandScreenMain, CommandScreenSidebar } from "./hub-components/SharedCommandScreenLayout";
import { save } from "@tauri-apps/plugin-dialog";
import { useStore } from "./store";
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
  const [missingDeps, setMissingDeps] = useState<string[]>([]);
  const [showTestPanel, setShowTestPanel] = useState(false);
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
    let missing: string[] = [];
    
    if (activeLabMod && activeLabMod.dependencies) {
      let rawDeps: string[] = [];
      if (typeof activeLabMod.dependencies === 'string') {
        rawDeps = activeLabMod.dependencies.split(',').map((s: string) => s.trim()).filter(Boolean);
      } else if (Array.isArray(activeLabMod.dependencies)) {
        rawDeps = [...activeLabMod.dependencies].filter(Boolean);
      }
      
      const cleanName = (name: string) => name ? name.replace(/_/g, " ").replace(/(\.| |-)*(\(|\[)?(package|ts4scripts?|scripts?|zip)(\)|\])?/gi, "").trim().toUpperCase() : "";

      const foundDeps = rawDeps
        .map(depName => {
          const found = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m === activeLabMod) return false;
            if (m.hash && activeLabMod.hash && m.hash === activeLabMod.hash) return false;
            if (m.name && activeLabMod.name && m.name === activeLabMod.name) return false;
            
            if (!m.name) return false;
            
            const isDBScript = depName.toLowerCase().includes("script");
            const isLocalScript = m.name.toLowerCase().includes("script");
            if (isDBScript !== isLocalScript) return false;

            return (cleanName(m.name) === cleanName(depName) || cleanName(m.displayName) === cleanName(depName) || (m.path && m.path.includes(depName) && depName.length > 3));
          });
          
          if (!found) missing.push(depName);
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
          });
          
          if (!found) missing.push(am.displayName || am.name || "Unknown Mod");
          return found;
        })
        .filter(Boolean);
      
      depsToStage = [...depsToStage, ...extraDeps];
    }
    
    if (activeLabMod) {
      const uniqueDeps = Array.from(new Map(depsToStage.map(item => [item.hash || item.name, item])).values());
      setStagedExtras(uniqueDeps);
      setMissingDeps(missing);
    } else {
      setStagedExtras([]);
      setMissingDeps([]);
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
    setShowTestPanel(true);
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

        <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500 w-full mb-6 shrink-0">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full shrink-0">
            <HubTabButton id="DASHBOARD" icon="dashboard" label={t("overview")} activeTab={activeTab} setTab={setActiveTab} />
            <HubTabButton id="BUILDER" icon="science" label={t("tab_lab_builder")} activeTab={activeTab} setTab={setActiveTab} />
            <HubTabButton id="REPORTS" icon="terminal" label={t("tab_lab_reports")} activeTab={activeTab} setTab={setActiveTab} />
          </div>
        </div>

      {activeTab === "DASHBOARD" && (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
          <div className="flex flex-col gap-10 w-full">
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">help</span>} number={realStats.untested} label={t("stat_mods_untested")} colorClass="border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">play_circle</span>} number={realStats.totalRan} label={t("stat_total_tests")} colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">check_circle</span>} number={realStats.passed} label={t("stat_tests_passed")} colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" />
              <DashboardStatTile icon={<span className="material-symbols-outlined !text-4xl">warning</span>} number={realStats.failed} label={t("stat_tests_failed")} colorClass="border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading title={t("recent_tests_title") || "RECENT TELEMETRY"} icon="history" />
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4">
                  {testHistory.length > 0 ? (
                    testHistory.slice(0, 10).map((test: any, index: number) => (
                      <div key={test.id || index} onClick={() => setSelectedReport(test)} className={`theme-glass-panel rounded-2xl p-5 border shadow-md transition-colors flex flex-col gap-3 relative overflow-hidden group cursor-pointer ${test.errorFound ? 'border-[var(--danger)]/30 hover:border-[var(--danger)]/50 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : 'border-[var(--success)]/30 hover:border-[var(--success)]/50'}`}>
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
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links") || "QUICK LINKS"} icon="bolt">
                <div className="flex flex-col gap-3">
                  <CommandScreenQuickLink
                    icon="science"
                    title={t("tab_lab_builder") || "Run Test"}
                    subtitle={testHistory.length > 0 ? `Last scan: ${new Date(testHistory[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Ecosystem Forge"}
                    onClick={() => setActiveTab("BUILDER")}
                  />
                  <CommandScreenQuickLink
                    icon="terminal"
                    title={t("tab_lab_reports") || "View Past Tests"}
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
                  />
                  <CommandScreenQuickLink
                    icon="warning"
                    title="Recent Failed Tests"
                    subtitle="Filter by Fatal"
                    onClick={() => { setActiveTab("REPORTS"); setLogFilter("errors"); }}
                    textColorClass="text-[var(--danger)]"
                    hoverTextColorClass="group-hover:text-[var(--danger)]"
                    iconBorderHoverClass="group-hover:border-[var(--danger)]/50 group-hover:bg-[var(--danger)]/10"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </div>
        </div>
      )}

      {activeTab === "BUILDER" && (
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full mt-2 pb-32">

          <CommandScreenSectionHeading
            shape="square"
            title={t("tab_lab_builder") || "ECOSYSTEM FORGE"}
            icon="science"
            className="py-3 border-b border-white/5 w-full mb-6 relative z-20 shrink-0"
            rightContent={activeLabMod && (
              <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                <div className="hidden lg:flex flex-col items-end gap-1 px-4 border-r border-white/10">
                  <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("payload") || "PAYLOAD"}</span>
                  <span className="text-xs font-black text-[var(--text)] tracking-widest uppercase">
                    {t("core_plus") || "1 CORE + "}{stagedExtras.length + (conflictTarget ? 1 : 0) + conflictExtras.length}{t("injected") || " INJECTED"}
                  </span>
                </div>

                <div className="flex items-center gap-4 pl-2">
                  {!shelterActive ? (
                    <ActionButton icon="bolt" label={t("btn_initiate_swap") || "CONDUCT EXPERIMENT"} onClick={runCombinedHotSwap} />
                  ) : (
                    <ActionButton icon="science" label={t("btn_view_test") || "VIEW ACTIVE TEST"} onClick={() => setShowTestPanel(true)} className="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[var(--success)]/30 !text-[var(--success)] hover:!bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" />
                  )}
                </div>
              </div>
            )}
          />

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
                        <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] py-1 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-max mx-auto px-4">{t("subject_isolation")}</span>
                        <span className="text-2xl font-black uppercase text-[var(--text)] break-words mt-4">{getModName(activeLabMod)}</span>
                      </div>

                      <div className="mt-8 relative z-10">
                        <ActionButton
                          icon="close"
                          label={t("lab_btn_abort")}
                          onClick={abortLab}
                          className="!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] !border-[var(--danger)]/30 !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MODIFIERS */}
            <div className="flex flex-col gap-8 pb-10">

              {/* SYMBIOTIC GRID */}
              <div className={`theme-glass-panel p-8 rounded-[var(--radius)] border shadow-xl relative flex flex-col h-max min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-white/5 grayscale' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <CommandScreenSectionHeading 
                  shape="circle"
                  title={t("symbiotic_deps")} 
                  subtitle={t("symbiotic_desc")} 
                  icon="folder"
                  colorClass="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  iconColorClass="text-[var(--text)] opacity-80"
                  className="mb-6 border-b border-white/5 pb-4 relative z-10 w-full"
                />

                <div className="relative z-20 mb-6">
                  {missingDeps.length > 0 && (
                    <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-4 mb-6 flex flex-col gap-2 shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_10%,transparent)]">
                      <div className="flex items-center gap-2 text-[var(--danger)] font-black text-xs uppercase tracking-widest">
                        <span className="material-symbols-outlined !text-[16px]">warning</span>
                        {t("missing_symbiotic_deps")}
                      </div>
                      <div className="text-[10px] text-[var(--danger)]/80 uppercase font-bold">
                        {t("missing_deps_warning_desc")}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {missingDeps.map(dep => (
                          <span key={dep} onClick={() => { useStore.getState().setMarketSearchQuery(dep); useStore.getState().setView("nexus"); }} className="text-[10px] bg-[var(--danger)]/20 px-2 py-1 rounded font-mono text-[var(--danger)] cursor-pointer hover:bg-[var(--danger)]/40 hover:text-white transition-all">{dep}</span>
                        ))}
                      </div>
                    </div>
                  )}
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
                  <div className="w-full py-10 mt-2 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-black/20 text-[var(--subtext)] opacity-50 font-black text-[10px] uppercase tracking-widest">
                    NO SYMBIOTIC ENTITIES LOADED
                  </div>
                )}
              </div>

              {/* ADVERSARIAL GRID */}
              <div className={`theme-glass-panel p-8 rounded-[var(--radius)] border shadow-xl relative flex flex-col h-max min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-white/5 grayscale' : 'border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--warning)]/5 to-transparent opacity-50 rounded-[inherit] pointer-events-none" />
                <CommandScreenSectionHeading 
                  shape="circle"
                  title={t("adversarial_entities")} 
                  subtitle={t("adversarial_desc")} 
                  icon="warning"
                  colorClass="bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)]"
                  iconColorClass="theme-text-warning opacity-90 animate-pulse"
                  className="mb-6 border-b border-white/5 pb-4 relative z-10 w-full"
                />

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
                    <div className="w-full py-10 mt-4 flex items-center justify-center border-2 border-dashed border-[var(--warning)]/20 rounded-xl bg-[var(--warning)]/5 text-[var(--warning)] opacity-70 font-black text-[10px] uppercase tracking-widest">
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

          <CommandScreenSectionHeading 
            shape="square"
            title={t("tab_lab_reports") || "TELEMETRY LOGS"}
            icon="terminal"
            className="py-3 border-b border-white/5 w-full mb-6 relative z-20 shrink-0"
            rightContent={
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
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-32">
            {filteredReports.map((report: any) => {
              const isError = report.errorFound;
              return (
                <div key={report.id} onClick={() => setSelectedReport(report)} className={`theme-glass-panel rounded-2xl p-5 border shadow-md transition-all flex flex-col gap-3 relative overflow-hidden group cursor-pointer hover:-translate-y-1 hover:shadow-xl ${isError ? 'border-[var(--danger)]/30 hover:border-[var(--danger)]/50 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]' : 'border-[var(--success)]/30 hover:border-[var(--success)]/50'}`}>
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
              selectedReport.isConcluding && shelterActive ? (
                <div className="flex flex-wrap items-center gap-4 mt-4 lg:mt-0">
                  <button
                    onClick={handleConcludeTest}
                    className={`py-2.5 px-6 rounded-[var(--radius)] font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 border shadow-sm ${isError ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:border-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)]'}`}
                  >
                    <span className="material-symbols-outlined !text-[16px]">{isError ? 'shield' : 'verified_user'}</span>
                    {isError ? (t("secure_broken")) : (t("secure_verified"))}
                  </button>
                </div>
              ) : null
            }
            footer={
              <div className="flex flex-wrap items-center justify-center gap-4 w-full">
                 <ActionButton label={t("btn_close") || "CLOSE"} onClick={() => setSelectedReport(null)} />
                 <ActionButton icon="download" label={t("export_logs") || "EXPORT LOGS"} onClick={handleExportLogs} />
                 
                 {isError && submitLabReport && (
                   <ActionButton
                     icon="send"
                     label={t("submit_diagnostics") || "SUBMIT TO DIAGNOSTICS"}
                     onClick={() => { setSelectedReport(null); submitLabReport(selectedReport); }}
                     className="!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] !border-[var(--danger)]/30 !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                   />
                 )}
              </div>
            }
          >
            <div className="flex flex-col gap-6 mt-6 w-full">
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("payload_composition") || "PAYLOAD COMPOSITION"}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="theme-glass-panel rounded-xl p-3 border border-[var(--accent)]/30 flex items-center gap-3 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 to-transparent opacity-50" />
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[18px] relative z-10">science</span>
                    <span className="text-[var(--text)] text-xs font-bold uppercase tracking-widest truncate relative z-10">{getModName(selectedReport.mod)}</span>
                    <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--accent)] uppercase tracking-widest relative z-10">{t("payload_core") || "CORE"}</span>
                  </div>
                  
                  {selectedReport.conflictTarget && (
                    <div className="theme-glass-panel rounded-xl p-3 border border-[var(--danger)]/30 flex items-center gap-3 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-[var(--danger)]/10 to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--danger)] !text-[18px] relative z-10">warning</span>
                      <span className="text-[var(--text)] text-xs font-bold uppercase tracking-widest truncate relative z-10">{getModName(selectedReport.conflictTarget)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--danger)] uppercase tracking-widest relative z-10">{t("payload_adversary") || "ADVERSARY"}</span>
                    </div>
                  )}
                  
                  {selectedReport.stagedExtras?.map((m: any) => (
                    <div key={m.hash || m.name} className="theme-glass-panel rounded-xl p-3 border border-white/10 flex items-center gap-3 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--subtext)] !text-[18px] relative z-10">extension</span>
                      <span className="text-[var(--text)] text-xs font-bold uppercase tracking-widest truncate relative z-10">{getModName(m)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-50 text-[var(--text)] uppercase tracking-widest relative z-10">{t("payload_injected") || "INJECTED"}</span>
                    </div>
                  ))}
                  
                  {selectedReport.conflictExtras?.map((m: any) => (
                    <div key={m.hash || m.name} className="theme-glass-panel rounded-xl p-3 border border-[var(--warning)]/30 flex items-center gap-3 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-[var(--warning)]/10 to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--warning)] !text-[18px] relative z-10">extension</span>
                      <span className="text-[var(--text)] text-xs font-bold uppercase tracking-widest truncate relative z-10">{getModName(m)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--warning)] uppercase tracking-widest relative z-10">{t("payload_injected") || "INJECTED"}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 min-h-[400px] theme-glass-panel backdrop-blur-xl border border-white/5 rounded-2xl p-6 font-mono text-[13px] text-[var(--text)] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col mb-10">
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
            </div>
          </SidePanel>
        );
      })()}

      {showTestPanel && (
        <SidePanel
          isOpen={showTestPanel}
          onClose={() => setShowTestPanel(false)}
          title={t("test_underway_title") || "EXPERIMENT UNDERWAY"}
          subtitle={t("test_underway_desc") || "Monitoring simulation for anomalies..."}
          icon="science"
          iconColorClass="text-[var(--accent)]"
          footer={
            <SidePanelActionFooter
              onCancel={() => { abortLab(); setShowTestPanel(false); }}
              cancelLabel={t("lab_btn_abort") || "ABORT"}
              onAction={() => { handleConcludeTest(); setShowTestPanel(false); }}
              actionLabel={t("btn_conclude_experiment") || "CONCLUDE TEST"}
              actionVariant="success"
              actionIcon="science"
            />
          }
        >
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 opacity-90 p-8">
             <div className="relative flex items-center justify-center">
               <div className="absolute inset-0 border-[6px] border-[var(--accent)] rounded-full border-t-transparent animate-[spin_3s_linear_infinite] opacity-30 blur-[4px] scale-150"></div>
               <div className="absolute inset-0 border-[2px] border-[var(--accent)] rounded-full border-b-transparent animate-[spin_2s_linear_infinite_reverse] opacity-50 scale-125"></div>
               <div className="w-32 h-32 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_20%,transparent)] relative z-10">
                  <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] animate-pulse drop-shadow-lg">radar</span>
               </div>
             </div>
             
             <div className="text-center flex flex-col gap-2 mt-4">
               <div className="text-2xl font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">
                 {t("monitoring_subject") || "MONITORING SUBJECT"}
               </div>
               <div className="text-sm font-bold uppercase tracking-widest text-[var(--accent)] px-6 py-2 bg-[var(--accent)]/10 rounded-full border border-[var(--accent)]/20 mx-auto w-max mt-2 shadow-[inset_0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
                 {getModName(activeLabMod)}
               </div>
               <div className="text-[10px] uppercase font-bold text-[var(--subtext)] tracking-widest mt-4">
                 {t("test_running_wait") || "DO NOT DISCONNECT UNTIL SIMULATION CONCLUDES"}
               </div>
             </div>
          </div>
        </SidePanel>
      )}

    </div>
  );
}
