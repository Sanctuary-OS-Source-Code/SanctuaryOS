import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, ModSearchDropdown, HoverTabDrawer, VerticalTabButton, CustomDropdown, ActionButton, FilterTabs, FilterTabButton, SidePanel, SidePanelActionFooter, getExtensionRegex, SearchBar, ScreenUtilityBar } from "./shared";
import { CommandScreenLayout, DashboardStatTile, CommandScreenStats, CommandScreenQuickLink, CommandScreenSectionHeading, CommandScreenBody, CommandScreenMain, CommandScreenSidebar } from "./hub-components/SharedCommandScreenLayout";
import { UniversalCard } from "./components/universal/UniversalCard";
import { useStore } from "./store";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { supabase } from "./supabase";

export default function Lab({
  activeLabMod, setActiveLabMod, modList = [], onOpenDossier,
  concludeTest, executeHotSwap, shelterActive, conflictTarget, setConflictTarget,
  testErrorFound, testLogSnippet, isSubmittingReport, submitLabReport,
  labQueue = [], labVerificationQueue = [], labConflicts = [],
  associatedMods = []
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore(s => s.activeGameSchema);

  const [stagedExtras, setStagedExtras] = useState<any[]>([]);
  const [conflictExtras, setConflictExtras] = useState<any[]>([]);
  const [missingDeps, setMissingDeps] = useState<any[]>([]);
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
    let missing: any[] = [];
    
    const cleanName = (name: string) => name ? name.replace(/['"]/g, "").replace(/_/g, " ").replace(getExtensionRegex(activeGameSchema), "").trim().toUpperCase() : "";

    if (activeLabMod && activeLabMod.dependencies) {
      let rawDeps: string[] = [];
      if (typeof activeLabMod.dependencies === 'string') {
        rawDeps = activeLabMod.dependencies.split(',').map((s: string) => s.trim()).filter(Boolean);
      } else if (Array.isArray(activeLabMod.dependencies)) {
        rawDeps = [...activeLabMod.dependencies].map(s => typeof s === 'string' ? s.trim() : s).filter(Boolean);
      }
      

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
          
          if (!found) missing.push(am);
          return found;
        })
        .filter(Boolean);
      
      depsToStage = [...depsToStage, ...extraDeps];
    }
    
    if (activeLabMod) {
      const uniqueDeps = Array.from(new Map(depsToStage.map(item => [item.hash || item.name, item])).values());
      setStagedExtras(uniqueDeps);
      
      const groupedMissing = new Map<string, any[]>();
      missing.forEach(item => {
        let nameToClean = typeof item === 'string' ? item : (item.displayName || item.name || "");
        let key = cleanName(nameToClean);
        if (!groupedMissing.has(key)) groupedMissing.set(key, []);
        groupedMissing.get(key)!.push(item);
      });

      const uniqueMissing: any[] = [];
      groupedMissing.forEach((items) => {
        const withId = items.filter(i => typeof i !== 'string' && i.id);
        if (withId.length > 0) {
          const uniqueById = Array.from(new Map(withId.map(i => [i.id, i])).values());
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
    lastTest: testHistory.length > 0 ? (t("time_just_now")) : "--"
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
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        breadcrumb={activeTab !== "DASHBOARD" ? (t(`tab_lab_${activeTab.toLowerCase()}`) || activeTab) : undefined}
        onTitleClick={() => setActiveTab("DASHBOARD")}
      >
        {activeTab === "BUILDER" && activeLabMod && (
          <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="hidden lg:flex flex-col items-end gap-1 px-4 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="text-[9px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("payload")}</span>
              <span className="text-xs font-black text-[var(--text)] tracking-widest capitalize">
                {t("core_plus")}{stagedExtras.length + (conflictTarget ? 1 : 0) + conflictExtras.length}{t("injected")}
              </span>
            </div>
            {!shelterActive ? (
              <ActionButton icon="bolt" label={t("btn_initiate_swap")} onClick={runCombinedHotSwap} />
            ) : (
              <ActionButton icon="science" label={t("btn_view_test")} onClick={() => setShowTestPanel(true)} className="!bg-[color-mix(in_srgb,var(--success)_10%,transparent)] !border-[color-mix(in_srgb,var(--success)_30%,transparent)] !text-[var(--success)] hover:!bg-[color-mix(in_srgb,var(--success)_20%,transparent)]" />
            )}
          </div>
        )}
        
        {activeTab === "REPORTS" && (
          <div className="flex items-center gap-3 h-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <SearchBar
              value={searchLogs}
              onChange={setSearchLogs}
              placeholder={t("search_logs") as string}
              className="h-full rounded-xl min-w-[200px]"
            />
            <FilterTabs className="h-full shrink-0">
              <FilterTabButton id="all" label={t("all_logs")} activeTab={logFilter} setTab={setLogFilter} />
              <FilterTabButton id="verified" label={t("verified")} activeTab={logFilter} setTab={setLogFilter} />
              <FilterTabButton id="fatal" label={t("fatal")} activeTab={logFilter} setTab={setLogFilter} />
            </FilterTabs>
          </div>
        )}
      </ViewHeader>

      <HoverTabDrawer title="Lab Navigation" activeTab={activeTab} setTab={setActiveTab}>
        <VerticalTabButton id="DASHBOARD" icon="dashboard" label={t("overview")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="BUILDER" icon="science" label={t("tab_lab_builder")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="REPORTS" icon="terminal" label={t("tab_lab_reports")} activeTab={activeTab} setTab={setActiveTab} />
      </HoverTabDrawer>

      {activeTab === "DASHBOARD" && (
        <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
          <div className="flex flex-col gap-10 w-full">
            <CommandScreenStats>
              <DashboardStatTile icon={<span className="material-symbols-outlined">help</span>} number={realStats.untested} label={t("stat_mods_untested")} colorClass="text-amber-500" />
              <DashboardStatTile icon={<span className="material-symbols-outlined">play_circle</span>} number={realStats.totalRan} label={t("stat_total_tests")} colorClass="text-purple-500" />
              <DashboardStatTile icon={<span className="material-symbols-outlined">check_circle</span>} number={realStats.passed} label={t("stat_tests_passed")} colorClass="text-emerald-500" />
              <DashboardStatTile icon={<span className="material-symbols-outlined">warning</span>} number={realStats.failed} label={t("stat_tests_failed")} colorClass="text-red-500" />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading title={t("recent_tests_title")} icon="history" />
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4">
                  {testHistory.length > 0 ? (
                    testHistory.slice(0, 10).map((test: any, index: number) => (
                      <UniversalCard
                        key={test.id || index}
                        onClick={() => setSelectedReport(test)}
                        layout="vertical"
                        icon={test.errorFound ? "warning" : "check_circle"}
                        statusColor={test.errorFound ? "border-rose-500" : "border-emerald-500"}
                        title={test.mod ? getModName(test.mod) : (t("ecosystem_forge"))}
                        subtitle={test.conflictTarget ? `vs ${getModName(test.conflictTarget)}` : t("target_engine_core")}
                        badges={[
                          <span key="status" className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner ${test.errorFound ? 'text-rose-500 border-rose-500/30 bg-rose-500/10' : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'}`}>
                            {test.errorFound ? t("fatal_collision") : t("successful_injection")}
                          </span>,
                          <span key="time" className="ml-auto text-[10px] font-bold opacity-50">
                            {new Date(test.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ]}
                      />
                    ))
                  ) : (
                    <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col items-center justify-center opacity-50 space-y-4 shadow-inner">
                      <span className="material-symbols-outlined !text-[48px] text-[var(--subtext)]">history</span>
                      <div className="text-sm font-black capitalize tracking-widest text-[var(--text)]">{t("no_recent_telemetry")}</div>
                    </div>
                  )}
                </div>
              </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("wf_quick_links")} icon="bolt">
                <div className="flex flex-col gap-3">
                  <CommandScreenQuickLink
                    icon="science"
                    title={t("tab_lab_builder")}
                    subtitle={testHistory.length > 0 ? `Last scan: ${new Date(testHistory[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Ecosystem Forge"}
                    onClick={() => setActiveTab("BUILDER")}
                  />
                  <CommandScreenQuickLink
                    icon="terminal"
                    title={t("tab_lab_reports")}
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
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                  />
                  <CommandScreenQuickLink
                    icon="warning"
                    title="Recent Failed Tests"
                    subtitle="Filter by Fatal"
                    onClick={() => { setActiveTab("REPORTS"); setLogFilter("errors"); }}
                    textColorClass="text-[var(--danger)]"
                    hoverTextColorClass="group-hover:text-[var(--danger)]"
                    iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                  />
                </div>
              </CommandScreenSidebar>
            </CommandScreenBody>
          </div>
        </div>
      )}

      {activeTab === "BUILDER" && (
        <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-8 duration-700 w-full mt-2 pb-32">


          <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-8 w-full max-w-[1600px] mx-auto">

            {/* LEFT COLUMN: THE CORE (SUBJECT) */}
            <div className="flex flex-col gap-6 h-full">
       <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl relative flex flex-col h-full min-h-[500px] group">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-50 pointer-events-none" />

                <div className="flex flex-col items-center justify-center text-center p-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10">
                  <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shrink-0 mb-4 shadow-md">
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[40px] animate-pulse">{t("icon_science")}</span>
                  </div>
                  <h3 className="text-2xl font-black text-[var(--text)] capitalize tracking-[0.2em]">{t("mount_subject")}</h3>
                  <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-80 mt-2">{t("mount_desc")}</p>
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
                    <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-2xl shadow-md flex flex-col items-center text-center group/core h-full justify-center">
                      <div className="absolute inset-0 rounded-[inherit] border-[2px] border-dashed border-[var(--accent)] opacity-20  animate-[spin_20s_linear_infinite] pointer-events-none scale-150" />
                      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-10 blur-[50px] rounded-full pointer-events-none" />

                      <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] drop-shadow-md mb-6">view_in_ar</span>

                      <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                        <span className="text-[10px] font-black text-[var(--accent)] capitalize tracking-[0.3em] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] py-1 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-max mx-auto px-4">{t("subject_isolation")}</span>
                        <span className="text-2xl font-black capitalize text-[var(--text)] break-words mt-4">{getModName(activeLabMod)}</span>
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
            <div className="flex flex-col gap-8 pb-10">

              {/* SYMBIOTIC GRID */}
              <div className={`glass-panel p-8 rounded-2xl border shadow-xl relative flex flex-col h-max min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-[color-mix(in_srgb,var(--text)_5%,transparent)] grayscale' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                <CommandScreenSectionHeading 
                  shape="circle"
                  title={t("symbiotic_deps")} 
                  subtitle={t("symbiotic_desc")} 
                  icon="folder"
                  colorClass=""
                  iconColorClass="text-[var(--text)] opacity-80"
                  className="mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 relative z-10 w-full"
                />

                <div className="relative z-20 mb-6">
                  {missingDeps.length > 0 && (
                    <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl p-4 mb-6 flex flex-col gap-2 shadow-md">
                      <div className="flex items-center gap-2 text-[var(--danger)] font-black text-xs capitalize tracking-widest">
                        <span className="material-symbols-outlined !text-[16px]">warning</span>
                        {t("missing_symbiotic_deps")}
                      </div>
                      <div className="text-[10px] text-[color-mix(in_srgb,var(--danger)_80%,transparent)] capitalize font-bold">
                        {t("missing_deps_warning_desc")}
                      </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {missingDeps.map((depObj, idx) => {
                            const depName = typeof depObj === 'string' ? depObj : (depObj.displayName || depObj.name || "Unknown Mod");
                            const depId = typeof depObj === 'string' ? null : depObj.id;
                            return (
                              <span key={depId || idx} onClick={async () => { 
                                let data = null;
                                if (depId) {
                                  const { data: d } = await supabase.from('mods').select('*').eq('id', depId).single();
                                  data = d;
                                } else {
                                  const searchTerms = depName.split(' ').map((t: string) => t.trim()).filter(Boolean).join('%');
                                  const { data: d } = await supabase.from('mods').select('*').ilike('name', `%${searchTerms}%`).limit(1).maybeSingle();
                                  data = d;
                                }

                                if (data) {
                                  onOpenDossier({ ...data, isNexusView: true });
                                } else {
                                  onOpenDossier({ name: depName, displayName: depName, isNexusView: true, description: "Artifact not found in the global registry." });
                                }
                              }} className="text-[10px] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-2 py-1 rounded font-mono text-[var(--danger)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-white transition-all">{depName}</span>
                            );
                          })}
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
                      <div key={m.hash} className="flex justify-start items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all group/item shadow-sm h-[60px]">
                        <span className="text-[11px] font-black capitalize text-[var(--text)] truncate pr-4">{getModName(m)}</span>
                        <button onClick={() => setStagedExtras(stagedExtras.filter(e => e.hash !== m.hash))} className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[16px]'>{t("icon_close")}</span></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full py-10 mt-2 flex items-center justify-center border-2 border-dashed border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl bg-black/20 text-[var(--subtext)] opacity-50 font-black text-[10px] capitalize tracking-widest">
                    NO SYMBIOTIC ENTITIES LOADED
                  </div>
                )}
              </div>

              {/* ADVERSARIAL GRID */}
              <div className={`glass-panel p-8 rounded-2xl border shadow-xl relative flex flex-col h-max min-h-[300px] transition-all ${!activeLabMod ? 'opacity-30 pointer-events-none border-[color-mix(in_srgb,var(--text)_5%,transparent)] grayscale' : 'border-[color-mix(in_srgb,var(--warning)_20%,transparent)]'}`}>
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--warning)_5%,transparent)] to-transparent opacity-50  pointer-events-none" />
                <CommandScreenSectionHeading 
                  shape="circle"
                  title={t("adversarial_entities")} 
                  subtitle={t("adversarial_desc")} 
                  icon="warning"
                  colorClass=""
                  iconColorClass="theme-text-warning opacity-90 animate-pulse"
                  className="mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 relative z-10 w-full"
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
                      <div className="relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] p-4 rounded-xl shadow-md flex justify-start items-center group md:col-span-2 h-[80px]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--warning)] opacity-10 blur-[30px] rounded-full pointer-events-none" />
                        <div className="flex flex-col gap-1 relative z-10 min-w-0 pr-4">
                          <span className="text-[9px] font-black theme-text-warning capitalize tracking-[0.3em]">{t("primary_adversary")}</span>
                          <span className="text-sm font-black capitalize text-[var(--text)] truncate">{getModName(conflictTarget)}</span>
                        </div>
                        <button onClick={() => { setConflictTarget(null); setConflictExtras([]); }} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[var(--danger)] text-[var(--text)] hover:text-white transition-all shadow-md relative z-10"><span className='material-symbols-outlined !text-[20px]'>{t("icon_close")}</span></button>
                      </div>

                      {conflictExtras.map((m: any) => (
                        <div key={m.hash} className="flex justify-start items-center bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] border border-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-4 rounded-xl hover:border-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] transition-all group/item shadow-sm h-[60px]">
                          <span className="text-[11px] font-black capitalize text-[var(--text)] truncate pr-4">{getModName(m)}</span>
                          <button onClick={() => setConflictExtras(conflictExtras.filter(e => e.hash !== m.hash))} className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[16px]'>{t("icon_close")}</span></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full py-10 mt-4 flex items-center justify-center border-2 border-dashed border-[color-mix(in_srgb,var(--warning)_20%,transparent)] rounded-xl bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] text-[var(--warning)] opacity-70 font-black text-[10px] capitalize tracking-widest">
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
              return (
                <UniversalCard
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  layout="vertical"
                  icon={isError ? "warning" : "check_circle"}
                  statusColor={isError ? "border-rose-500" : "border-emerald-500"}
                  title={getModName(report.mod)}
                  subtitle={report.conflictTarget ? `vs ${getModName(report.conflictTarget)}` : t("target_engine_core")}
                  badges={[
                    <span key="status" className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner ${isError ? 'text-rose-500 border-rose-500/30 bg-rose-500/10' : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'}`}>
                      {isError ? t("fatal_collision") : t("successful_injection")}
                    </span>,
                    report.isConcluding && (
                      <span key="pending" className="ml-auto text-[10px] font-bold opacity-50 text-amber-400 animate-pulse">
                        {t("status_pending_review")}
                      </span>
                    )
                  ]}
                />
              );
            })}
            
            {filteredReports.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center space-y-6 mt-10">
                <div className="opacity-50 flex flex-col items-center justify-center space-y-6">
                  <span className="material-symbols-outlined !text-[80px] text-[var(--subtext)]">terminal</span>
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-black capitalize tracking-widest text-[var(--text)]">{t("lab_reports_empty")}</h2>
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
                    className={`py-2.5 px-6 rounded-2xl font-black text-[10px] capitalize tracking-[0.2em] transition-all flex items-center justify-center gap-2 border shadow-sm ${isError ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:border-[var(--danger)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)]'}`}
                  >
                    <span className="material-symbols-outlined !text-[16px]">{isError ? 'shield' : 'verified_user'}</span>
                    {isError ? (t("secure_broken")) : (t("secure_verified"))}
                  </button>
                </div>
              ) : null
            }
            footer={
              <div className="flex flex-wrap items-center justify-center gap-4 w-full">
                 <ActionButton label={t("btn_close")} onClick={() => setSelectedReport(null)} />
                 <ActionButton icon="download" label={t("export_logs")} onClick={handleExportLogs} />
                 
                 {isError && submitLabReport && (
                   <ActionButton
                     icon="send"
                     label={t("submit_diagnostics")}
                     onClick={() => { setSelectedReport(null); submitLabReport(selectedReport); }}
                     className="!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] !border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                   />
                 )}
              </div>
            }
          >
            <div className="flex flex-col gap-6 mt-6 w-full">
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)]">{t("payload_composition")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
         <div className="glass-panel rounded-xl p-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center gap-3 relative group">
                    <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-50" />
                    <span className="material-symbols-outlined text-[var(--accent)] !text-[18px] relative z-10">science</span>
                    <span className="text-[var(--text)] text-xs font-bold capitalize tracking-widest truncate relative z-10">{getModName(selectedReport.mod)}</span>
                    <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--accent)] capitalize tracking-widest relative z-10">{t("payload_core")}</span>
                  </div>
                  
                  {selectedReport.conflictTarget && (
          <div className="glass-panel rounded-xl p-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center gap-3 relative group">
                      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-[color-mix(in_srgb,var(--danger)_10%,transparent)] to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--danger)] !text-[18px] relative z-10">warning</span>
                      <span className="text-[var(--text)] text-xs font-bold capitalize tracking-widest truncate relative z-10">{getModName(selectedReport.conflictTarget)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--danger)] capitalize tracking-widest relative z-10">{t("payload_adversary")}</span>
                    </div>
                  )}
                  
                  {selectedReport.stagedExtras?.map((m: any) => (
          <div key={m.hash || m.name} className="glass-panel rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3 relative group">
                      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--subtext)] !text-[18px] relative z-10">extension</span>
                      <span className="text-[var(--text)] text-xs font-bold capitalize tracking-widest truncate relative z-10">{getModName(m)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-50 text-[var(--text)] capitalize tracking-widest relative z-10">{t("payload_injected")}</span>
                    </div>
                  ))}
                  
                  {selectedReport.conflictExtras?.map((m: any) => (
          <div key={m.hash || m.name} className="glass-panel rounded-xl p-3 border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center gap-3 relative group">
                      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-[color-mix(in_srgb,var(--warning)_10%,transparent)] to-transparent opacity-50" />
                      <span className="material-symbols-outlined text-[var(--warning)] !text-[18px] relative z-10">extension</span>
                      <span className="text-[var(--text)] text-xs font-bold capitalize tracking-widest truncate relative z-10">{getModName(m)}</span>
                      <span className="ml-auto text-[9px] font-black opacity-80 text-[var(--warning)] capitalize tracking-widest relative z-10">{t("payload_injected")}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 min-h-[400px] glass-panel backdrop-blur-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-6 font-mono text-[13px] text-[var(--text)] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col mb-10">
              <div className="flex items-center gap-3 mb-6 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-4 shrink-0">
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-50 !text-[18px]">{t("icon_terminal")}</span>
                <span className="text-[var(--subtext)] opacity-70 capitalize tracking-widest text-[11px] font-black">
                   {t("execution_logs")} // {t("system_stdout")}
                </span>
                
                {isError && (
                  <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-[var(--danger)] capitalize tracking-widest bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-3 py-1.5 rounded-lg">
                    <span className="material-symbols-outlined !text-[14px]">warning</span>
                    CRITICAL FAILURE
                  </div>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-all leading-relaxed flex-1 opacity-80 font-mono">
                {logData || t("no_logs")}
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
          footer={
            <SidePanelActionFooter
              onCancel={() => { abortLab(); setShowTestPanel(false); }}
              cancelLabel={t("lab_btn_abort")}
              onAction={() => { handleConcludeTest(); setShowTestPanel(false); }}
              actionLabel={t("btn_conclude_experiment")}
              actionVariant="success"
              actionIcon="science"
            />
          }
        >
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 opacity-90 p-8">
             <div className="relative flex items-center justify-center">
               <div className="absolute inset-0 rounded-[inherit] border-[6px] border-[var(--accent)]  border-t-transparent animate-[spin_3s_linear_infinite] opacity-30 blur-[4px] scale-150"></div>
               <div className="absolute inset-0 rounded-[inherit] border-[2px] border-[var(--accent)]  border-b-transparent animate-[spin_2s_linear_infinite_reverse] opacity-50 scale-125"></div>
               <div className="w-32 h-32 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-md relative z-10">
                  <span className="material-symbols-outlined !text-[64px] text-[var(--accent)] animate-pulse drop-shadow-lg">radar</span>
               </div>
             </div>
             
             <div className="text-center flex flex-col gap-2 mt-4">
               <div className="text-2xl font-black capitalize tracking-[0.2em] text-[var(--text)] drop-shadow-md">
                 {t("monitoring_subject")}
               </div>
               <div className="text-sm font-bold capitalize tracking-widest text-[var(--accent)] px-6 py-2 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] mx-auto w-max mt-2 shadow-md">
                 {getModName(activeLabMod)}
               </div>
               <div className="text-[10px] capitalize font-bold text-[var(--subtext)] tracking-widest mt-4">
                 {t("test_running_wait")}
               </div>
             </div>
          </div>
        </SidePanel>
      )}

    </div>
  );
}




