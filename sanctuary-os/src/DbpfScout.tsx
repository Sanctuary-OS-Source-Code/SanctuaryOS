import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, HoverTooltip, EmptyState, SidePanel, SidebarActionButton, ActionButton, HubTabButton, DashboardStatTile } from "./shared";
import { getExtensionRegex, formatDisplayName, getFileLabel } from "./shared";
import { useLexicon } from "./LexiconContext";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { useStore } from "./store";
import ConflictCard from "./ConflictCard";
import ConflictResolutionSidebar from "./side-panels/ConflictResolutionSidebar";
import UndoWinnersPanel from "./side-panels/UndoWinnersPanel";
import { CommandScreenLayout, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, CommandScreenStats } from "./hub-components/SharedCommandScreenLayout";

const isCloneConflict = (modA: string, modB: string) => {
  if (!modA || !modB) return false;
  const clean = (s: string) => {
    const file = s.split(/[\\/]/).pop() || s;
    const extMatch = file.match(getExtensionRegex(useStore.getState().activeGameSchema));
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const cleaned = file.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\\.[a-zA-Z0-9]+)/g, '').replace(/[^a-z0-9]/g, '');
    return cleaned + "_" + ext;
  };
  return clean(modA) === clean(modB);
};

export const DbpfScout = () => {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const { t } = useLexicon();
  const { applyConflictOverride } = usePlaySetLogic();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [showUndoPanel, setShowUndoPanel] = useState(false);
  const [stats, setStats] = useState({ packages: 0, totalClashes: 0 });

  const { playSets, setPlaySets, activePlaySetIndex, activeGameSchema } = useStore();
  const defaultScope = playSets && playSets.length > 0 ? (playSets[activePlaySetIndex]?.name || playSets[0].name) : "";
  const [scanScope, setScanScope] = useState(defaultScope);

  useEffect(() => {
    if (!scanScope && playSets && playSets.length > 0) {
      setScanScope(playSets[activePlaySetIndex]?.name || playSets[0].name);
    }
  }, [playSets, activePlaySetIndex, scanScope]);

  const ignoredPairs = useStore((state) => state.ignoredGlobal);
  const setIgnoredPairs = useStore((state) => state.setIgnoredGlobal);

  const [fatalConflicts, setFatalConflicts] = useState<any[]>([]);
  const [tuningConflicts, setTuningConflicts] = useState<any[]>([]);
  const [cloneConflicts, setCloneConflicts] = useState<any[]>([]);
  const [softConflicts, setSoftConflicts] = useState<any[]>([]);

  const [visibleFatal, setVisibleFatal] = useState(50);
  const [visibleTuning, setVisibleTuning] = useState(50);
  const [visibleClone, setVisibleClone] = useState(50);
  const [visibleSoft, setVisibleSoft] = useState(50);
  const [activeTab, setActiveTab] = useState<string>("COMMAND");
  const [overrideTab, setOverrideTab] = useState<"ACTIVE" | "IGNORED">("ACTIVE");
  const [conflictSearch, setConflictSearch] = useState("");
  const [overrideSearch, setOverrideSearch] = useState("");
  const [blueprintSearch, setBlueprintSearch] = useState("");
  const [activeConflictSeverity, setActiveConflictSeverity] = useState<number | null>(null);
  const [activeOverrideSeverity, setActiveOverrideSeverity] = useState<number | null>(null);

  useEffect(() => {
    if (hasScanned) {
      try {
        localStorage.setItem("sanctuary_local_conflicts", JSON.stringify([...fatalConflicts, ...tuningConflicts]));
        localStorage.setItem(`radar_stats_${scanScope}`, JSON.stringify({ fatal: fatalConflicts.length, tuning: tuningConflicts.length, clone: cloneConflicts.length, soft: softConflicts.length }));
      } catch (e) { }
    }
  }, [fatalConflicts, tuningConflicts, cloneConflicts, softConflicts, hasScanned, scanScope]);

  const [selectedForVault, setSelectedForVault] = useState<string[]>([]);
  const [resolvingScript, setResolvingScript] = useState<string | null>(null);
  const [confirmMassVault, setConfirmMassVault] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [activeConflictRes, setActiveConflictRes] = useState<any>(null);

  const runRadar = async (targetScope?: string) => {
    setIsSidePanelOpen(false);
    setLoading(true);
    setError(null);
    setHasScanned(false);
    setSelectedForVault([]);
    setResolvingScript(null);
    setConfirmMassVault(false);
    setStats({ packages: 0, totalClashes: 0 });
    setFatalConflicts([]);
    setTuningConflicts([]);
    setCloneConflicts([]);
    setSoftConflicts([]);
    setVisibleFatal(50);
    setVisibleTuning(50);
    setVisibleClone(50);
    setVisibleSoft(50);
    setActiveTab("DASHBOARD");

    try {
      const config: any = await invoke("get_saved_coordinates");
      let targetPath = `${config.vault_path}/Mods`;
      let targetFiles: string[] | null = null;

      const scopeToUse = targetScope || scanScope || (playSets.length > 0 ? playSets[0].name : "");
      const set = playSets.find((s: any) => s.name === scopeToUse);
      if (set) {
        targetFiles = set.mods.map((m: any) => typeof m === 'string' ? m : (m.name || m.path || '')).filter(Boolean);
      }

      const report = await invoke<any>("run_conflict_radar", { modsPath: targetPath, targetFiles });

      let actionableClashes = 0;
      const fatal: any[] = [];
      const tuning: any[] = [];
      const clone: any[] = [];
      const soft: any[] = [];

      report.conflicts.forEach((c: any) => {
        if (ignoredPairs.includes(c.mod_pair)) return;

        const parts = c.mod_pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
        const modA = parts[0];
        const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
        const enrichedConflict = { ...c, modA, modB };

        if (isCloneConflict(modA, modB)) { clone.push(enrichedConflict); actionableClashes++; }
        else if (c.severity_rank == 4) { fatal.push(enrichedConflict); actionableClashes++; }
        else if (c.severity_rank == 3) { tuning.push(enrichedConflict); actionableClashes++; }
        else { soft.push(enrichedConflict); }
      });

      if (report.installed_mods) {
        const nameGroups: Record<string, string[]> = {};
        const cleanForGroup = (s: string) => {
          const file = s.split(/[\\/]/).pop() || s;
          const extMatch = file.match(getExtensionRegex(activeGameSchema));
          const ext = extMatch ? extMatch[1].toLowerCase() : '';
          const cleaned = file.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\\.[a-zA-Z0-9]+)/g, '').replace(/[^a-z0-9]/g, '');
          return cleaned + "_" + ext;
        };
        report.installed_mods.forEach((m: string) => {
          const c = cleanForGroup(m);
          if (!nameGroups[c]) nameGroups[c] = [];
          nameGroups[c].push(m);
        });
        Object.values(nameGroups).forEach(group => {
          if (group.length > 1) {
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                const modA = group[i];
                const modB = group[j];
                const pairKey = `${modA}  ⚔️  ${modB}`;
                const pairKeyRev = `${modB}  ⚔️  ${modA}`;
                if (!ignoredPairs.includes(pairKey) && !ignoredPairs.includes(pairKeyRev) && !clone.some((c: any) => c.mod_pair === pairKey || c.mod_pair === pairKeyRev)) {
                  actionableClashes++;
                  clone.push({ mod_pair: pairKey, modA, modB, is_ghost: false, severity_rank: 4, shared_assets: 0 });
                }
              }
            }
          }
        });

        const { data: hitList, error: dbError } = await supabase.from('logical_conflicts').select(`
          *,
          mod_a_rel:mods!logical_conflicts_mod_a_id_fkey(name),
          mod_b_rel:mods!logical_conflicts_mod_b_id_fkey(name)
        `);
        if (hitList && !dbError) {
          hitList.forEach((hit: any) => {
            const modAName = hit.mod_a_rel?.name || hit.mod_a;
            const modBName = hit.mod_b_rel?.name || hit.mod_b;

            if (!modAName || !modBName) return;

            const actualA = report.installed_mods.find((m: string) => m && m.toLowerCase().includes(modAName.toLowerCase()));
            const actualB = report.installed_mods.find((m: string) => m && m.toLowerCase().includes(modBName.toLowerCase()));

            if (actualA && actualB) {
              const ghostPair = `${actualA} 👻 ${actualB}`;
              if (!ignoredPairs.includes(ghostPair)) {
                actionableClashes++;
                const ghostConflict = { mod_pair: ghostPair, modA: actualA, modB: actualB, is_ghost: true, resolution_note: hit.resolution_note, severity_rank: hit.severity_rank };
                if (Number(hit.severity_rank) === 4) fatal.push(ghostConflict);
                else if (Number(hit.severity_rank) === 3) tuning.push(ghostConflict);
              }
            }
          });
        }
      }

      setStats({ packages: report.total_packages, totalClashes: actionableClashes });
      setFatalConflicts(fatal);
      setTuningConflicts(tuning);
      setCloneConflicts(clone);
      setSoftConflicts(soft);

      if (actionableClashes > 0) {
        setActiveTab("CONFLICTS");
      } else {
        setActiveTab("COMMAND");
      }
    } catch (err) {
      setError(String(err));
    }
    setHasScanned(true);
    setLoading(false);
  };

  const ignoreConflict = (modPair: string) => {
    const updated = [...ignoredPairs, modPair];
    setIgnoredPairs(updated);
    localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updated));
    setFatalConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setTuningConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setCloneConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setSoftConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setStats((prev) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
  };

  const unignoreConflict = async (modPair: string) => {
    const updated = ignoredPairs.filter(p => p !== modPair);
    setIgnoredPairs(updated);
    if (updated.length === 0) {
      localStorage.removeItem("sanctuary_ignored_conflicts");
    } else {
      localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updated));
    }
  };

  const resetIgnored = () => {
    setIgnoredPairs([]);
    localStorage.removeItem("sanctuary_ignored_conflicts");
    if (hasScanned) runRadar();
  };

  const targetHq = () => {
    let newTargets: string[] = [...selectedForVault];
    cloneConflicts.forEach((c: any) => {
      const aIsHq = /_hq/i.test(c.modA);
      const bIsHq = /_hq/i.test(c.modB);
      let target = null;
      let nonTarget = null;
      if (aIsHq && !bIsHq) { target = c.modA; nonTarget = c.modB; }
      else if (bIsHq && !aIsHq) { target = c.modB; nonTarget = c.modA; }

      if (target) {
        newTargets = newTargets.filter(m => m !== nonTarget);
        if (!newTargets.includes(target)) newTargets.push(target);
      }
    });
    setSelectedForVault(newTargets);
    setConfirmMassVault(false);
  };

  const targetNonHq = () => {
    let newTargets: string[] = [...selectedForVault];
    cloneConflicts.forEach((c: any) => {
      const aIsHq = /_hq/i.test(c.modA);
      const bIsHq = /_hq/i.test(c.modB);
      const aIsNonHq = /_nonhq/i.test(c.modA);
      const bIsNonHq = /_nonhq/i.test(c.modB);

      let target = null;
      let nonTarget = null;
      if (aIsNonHq && !bIsNonHq) { target = c.modA; nonTarget = c.modB; }
      else if (bIsNonHq && !aIsNonHq) { target = c.modB; nonTarget = c.modA; }
      else if (!aIsHq && bIsHq) { target = c.modA; nonTarget = c.modB; }
      else if (!bIsHq && aIsHq) { target = c.modB; nonTarget = c.modA; }

      if (target) {
        newTargets = newTargets.filter(m => m !== nonTarget);
        if (!newTargets.includes(target)) newTargets.push(target);
      }
    });
    setSelectedForVault(newTargets);
    setConfirmMassVault(false);
  };

  const toggleTarget = (selectedMod: string, otherMod: string) => {
    setSelectedForVault((prev: string[]) => {
      let newSelected = [...prev];
      if (!newSelected.includes(selectedMod)) {
        newSelected = newSelected.filter(m => m !== otherMod);
        newSelected.push(selectedMod);
      } else {
        newSelected = newSelected.filter(m => m !== selectedMod);
      }
      return newSelected;
    });
    setConfirmMassVault(false);
  };

  const executeMassVault = async () => {
    if (selectedForVault.length === 0) return;
    setLoading(true);
    setConfirmMassVault(false);
    try {
      const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
      if (playSetIndex !== -1) {
        const updatedSets = [...playSets];
        const currentSet = updatedSets[playSetIndex];

        currentSet.mods = currentSet.mods.filter((m: string) => {
          const cleanM = m.replace(getExtensionRegex(activeGameSchema), "");
          return !selectedForVault.some((target: string) => {
            const cleanTarget = target.replace(getExtensionRegex(activeGameSchema), "");
            return cleanM === cleanTarget || cleanM.endsWith(`/${cleanTarget}`) || cleanM.endsWith(`\\${cleanTarget}`);
          });
        });

        setPlaySets(updatedSets);

      }
      setSelectedForVault([]);
      setIsBulkMode(false);
      await runRadar();
    } catch (err) { useStore.getState().pushStatus(`Mass Yeet Error: ${err}`); setLoading(false); }
  };

  const vaultSingleScript = async (modName: string) => {
    try {
      if (activeConflictRes) {
        const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
        if (playSetIndex !== -1) {
          const updatedSets = [...playSets];
          const currentSet = updatedSets[playSetIndex];
          const cleanMod = modName.replace(getExtensionRegex(activeGameSchema), "");
          currentSet.mods = currentSet.mods.filter((m: string) => {
            const cleanM = m.replace(getExtensionRegex(activeGameSchema), "");
            return cleanM !== cleanMod && !cleanM.endsWith(`/${cleanMod}`) && !cleanM.endsWith(`\\${cleanMod}`);
          });
          setPlaySets(updatedSets);

        }

        setFatalConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
        setTuningConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
        setCloneConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
        setSoftConflicts((prev) => prev.filter((c) => c.modA !== modName && c.modB !== modName));
        setStats((prev: any) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
        setActiveConflictRes(null);
      }
    } catch (err) { useStore.getState().pushStatus(`Error: ${err}`); }
  };

  const applyOverride = async (winnerName: string, modPair: string) => {
    try {
      if (activeConflictRes) {
        applyConflictOverride(winnerName, modPair, scanScope);
      }

      const updatedIgnored = [...ignoredPairs, modPair];
      setIgnoredPairs(updatedIgnored);

      setTuningConflicts((prev: any[]) => prev.filter((c: any) => c.mod_pair !== modPair));
      setStats((prev: any) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
      setActiveConflictRes(null);
    } catch (err) { useStore.getState().pushStatus(`Error: ${err}`); }
  };

  const undoOverride = async (winnerName: string) => {
    try {
      const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
      const cleanWinner = winnerName.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();

      if (playSetIndex !== -1) {
        const updatedSets = [...playSets];
        const currentSet = { ...updatedSets[playSetIndex] };
        currentSet.mods = currentSet.mods.map((m: any) => {
          const strM = typeof m === 'string' ? m : (m.name || m.path || '');
          const cleanM = strM.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();
          if (strM.toLowerCase().startsWith("sanctuary") && (cleanM === `sanctuary/${cleanWinner}` || cleanM === `sanctuary\\${cleanWinner}` || cleanM.endsWith(`/${cleanWinner}`) || cleanM.endsWith(`\\${cleanWinner}`))) {
            if (typeof m === 'string') return strM.replace(/^Sanctuary[/\\]/i, "");
            return { ...m, name: strM.replace(/^Sanctuary[/\\]/i, ""), path: (m.path || '').replace(/^Sanctuary[/\\]/i, "") };
          }
          return m;
        });
        updatedSets[playSetIndex] = currentSet;
        setPlaySets(updatedSets);

        window.dispatchEvent(new Event("storage"));
      }

      const updatedIgnored = ignoredPairs.filter(pair => !pair.toLowerCase().includes(cleanWinner));
      setIgnoredPairs(updatedIgnored);
      if (updatedIgnored.length > 0) {
        localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updatedIgnored));
      } else {
        localStorage.removeItem("sanctuary_ignored_conflicts");
      }

      await runRadar();
      setActiveConflictRes(null);
    } catch (err) { useStore.getState().pushStatus(`Undo Error: ${err}`); }
  };

  const clearAllOverrides = async () => {
    try {
      const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
      if (playSetIndex !== -1) {
        const updatedSets = [...playSets];
        const currentSet = { ...updatedSets[playSetIndex] };
        currentSet.mods = currentSet.mods.map((m: any) => {
          if (typeof m === 'string') return m.replace(/^Sanctuary[/\\]/i, "");
          return { ...m, name: (m.name || '').replace(/^Sanctuary[/\\]/i, ""), path: (m.path || '').replace(/^Sanctuary[/\\]/i, "") };
        });
        updatedSets[playSetIndex] = currentSet;
        setPlaySets(updatedSets);

        window.dispatchEvent(new Event("storage"));
      }
    } catch (err) { useStore.getState().pushStatus(`Undo Error: ${err}`); }
  };

  const searchFilter = (c: any, searchStr: string) => {
    if (!searchStr) return true;
    const term = searchStr.toLowerCase();
    const modA = (c.modA || '').toLowerCase();
    const modB = (c.modB || '').toLowerCase();
    const pair = (c.mod_pair || '').toLowerCase();
    return modA.includes(term) || modB.includes(term) || pair.includes(term);
  };

  const filteredFatal = fatalConflicts.filter(c => searchFilter(c, conflictSearch));
  const filteredTuning = tuningConflicts.filter(c => searchFilter(c, conflictSearch));
  const filteredClone = cloneConflicts.filter(c => searchFilter(c, conflictSearch));
  const filteredSoft = softConflicts.filter(c => searchFilter(c, conflictSearch));

  return (
    <>
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] blur-[150px] rounded-full" />
      </div>

      <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full relative z-10">
        <ViewHeader title={t("radar_title")} subtitle={t("radar_subtitle")} icon={t("icon_track_changes")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" />

        <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500 w-full mb-6">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full shrink-0">
            <HubTabButton id="COMMAND" icon="dashboard" label={t("overview")} activeTab={activeTab} setTab={setActiveTab} />
            <HubTabButton id="CONFLICTS" icon="warning" label={t("conflicts")} activeTab={activeTab} setTab={setActiveTab} badge={(fatalConflicts.length + tuningConflicts.length) > 0 ? (fatalConflicts.length + tuningConflicts.length) : null} />
            <HubTabButton id="OVERRIDES" icon="rule" label={t("overrides")} activeTab={activeTab} setTab={setActiveTab} badge={ignoredPairs.length > 0 ? ignoredPairs.length : null} />
          </div>
        </div>

        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">

          {activeTab === "COMMAND" && (
            <CommandScreenLayout>
              <CommandScreenStats>
                <DashboardStatTile
                  label={t("total_severity_4") || "TOTAL FATAL"}
                  number={playSets.reduce((acc: number, bp: any) => {
                    const cachedStatsStr = localStorage.getItem(`radar_stats_${bp.name}`);
                    const cachedStats = cachedStatsStr ? JSON.parse(cachedStatsStr) : { fatal: 0 };
                    return acc + (scanScope === bp.name && hasScanned ? fatalConflicts.length : cachedStats.fatal);
                  }, 0).toString()}
                  icon={<span className="material-symbols-outlined !text-[32px]">skull</span>}
                  colorClass="text-[var(--danger)]"
                />
                <DashboardStatTile
                  label={t("total_severity_3") || "TOTAL TUNING"}
                  number={playSets.reduce((acc: number, bp: any) => {
                    const cachedStatsStr = localStorage.getItem(`radar_stats_${bp.name}`);
                    const cachedStats = cachedStatsStr ? JSON.parse(cachedStatsStr) : { tuning: 0 };
                    return acc + (scanScope === bp.name && hasScanned ? tuningConflicts.length : cachedStats.tuning);
                  }, 0).toString()}
                  icon={<span className="material-symbols-outlined !text-[32px]">warning</span>}
                  colorClass="text-[var(--warning)]"
                />
                <DashboardStatTile
                  label={t("total_overrides") || "TOTAL OVERRIDES"}
                  number={playSets.reduce((acc: number, bp: any) => {
                    return acc + bp.mods.filter((m: any) => (typeof m === 'string' ? m : (m.name || m.path || '')).toLowerCase().startsWith("sanctuary")).length;
                  }, 0).toString()}
                  icon={<span className="material-symbols-outlined !text-[32px]">rule</span>}
                  colorClass="text-[var(--accent)]"
                />
                <DashboardStatTile
                  label={t("total_ignores") || "TOTAL IGNORED"}
                  number={ignoredPairs.length.toString()}
                  icon={<span className="material-symbols-outlined !text-[32px]">visibility_off</span>}
                  colorClass="text-[var(--subtext)]"
                />
              </CommandScreenStats>

              <CommandScreenBody>
                <CommandScreenMain>
                  <div className="flex flex-col gap-6 w-full">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl theme-glass-inner flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] shrink-0">
                          <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-90 drop-shadow-lg">map</span>
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)]">{t("target_blueprints")}</h2>
                      </div>
                      <div className="relative w-full md:w-64">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
                        <input
                          type="text"
                          placeholder={t("search_blueprints") || "SEARCH..."}
                          value={blueprintSearch}
                          onChange={(e) => setBlueprintSearch(e.target.value)}
                          className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                        />
                        {blueprintSearch && (
                          <button onClick={() => setBlueprintSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {playSets.filter((bp: any) => !blueprintSearch || bp.name.toLowerCase().includes(blueprintSearch.toLowerCase())).map((blueprint: any) => {
                        const cachedStatsStr = localStorage.getItem(`radar_stats_${blueprint.name}`);
                        const cachedStats = cachedStatsStr ? JSON.parse(cachedStatsStr) : { fatal: 0, tuning: 0, clone: 0, soft: 0 };
                        const fCount = scanScope === blueprint.name && hasScanned ? fatalConflicts.length : cachedStats.fatal;
                        const tCount = scanScope === blueprint.name && hasScanned ? tuningConflicts.length : cachedStats.tuning;
                        const cCount = scanScope === blueprint.name && hasScanned ? cloneConflicts.length : cachedStats.clone;
                        const sCount = scanScope === blueprint.name && hasScanned ? softConflicts.length : cachedStats.soft;

                        return (
                          <div key={blueprint.name} className={`theme-glass-panel rounded-2xl p-6 border ${scanScope === blueprint.name ? 'border-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'border-white/5'} shadow-lg flex flex-col gap-4 group transition-all hover:border-[var(--accent)]/30 hover:-translate-y-1`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl ${scanScope === blueprint.name ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[var(--accent)]/20'} border flex items-center justify-center transition-colors relative`}>
                                  <span className={`material-symbols-outlined !text-[18px] text-[var(--accent)]`}>account_tree</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-black uppercase tracking-widest text-[var(--text)]">{blueprint.name}</h3>
                                    {scanScope === blueprint.name && (
                                      <span className="px-1.5 py-0.5 rounded border border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[8px] font-black uppercase tracking-widest">{t("shared_selected") || "SELECTED"}</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{blueprint.mods.length} {t("items") || "ARTIFACTS"}</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2 mt-2">
                              <div className="bg-black/20 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 group-hover:border-[var(--danger)]/20 transition-colors">
                                <span className="text-xl font-black text-[var(--danger)]">{fCount}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--danger)] opacity-80">{t("stat_fatal")}</span>
                              </div>
                              <div className="bg-black/20 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 group-hover:border-[var(--warning)]/20 transition-colors">
                                <span className="text-xl font-black text-[var(--warning)]">{tCount}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--warning)] opacity-80">{t("stat_tuning")}</span>
                              </div>
                              <div className="bg-black/20 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 group-hover:border-[var(--accent)]/20 transition-colors">
                                <span className="text-xl font-black text-[var(--accent)]">{cCount}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)] opacity-80">{t("stat_clones")}</span>
                              </div>
                              <div className="bg-black/20 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 group-hover:border-blue-400/20 transition-colors">
                                <span className="text-xl font-black text-blue-400">{sCount}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 opacity-80">{t("stat_soft")}</span>
                              </div>
                            </div>
                            <ActionButton
                              label={t("btn_sweep_sidebar")}
                              icon="track_changes"
                              onClick={() => { setScanScope(blueprint.name); runRadar(blueprint.name); }}
                              className="w-full mt-4"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CommandScreenMain>

                <CommandScreenSidebar title={t("quick_actions")}>
                  <div className="mb-4">
                    <CustomDropdown
                      disableTint={true}
                      options={(playSets || []).map((s: any) => ({ id: s.name, label: s.name }))}
                      value={scanScope}
                      onChange={(val: any) => { setScanScope(val); runRadar(val); }}
                      icon="map"
                    />
                  </div>
                  <CommandScreenQuickLink
                    icon={loading ? "sync" : "track_changes"}
                    title={t("btn_sweep")}
                    subtitle={t("analyze_blueprint_desc")}
                    onClick={runRadar}
                    dotColorClass="bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
                    textColorClass="text-[var(--accent)]"
                    hoverTextColorClass="group-hover:text-[var(--accent)]"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
                    iconBorderHoverClass="group-hover:border-[var(--accent)]/30"
                  />
                  <CommandScreenQuickLink
                    icon="undo"
                    title={t("revert")}
                    subtitle={t("undo_overrides_desc")}
                    onClick={() => setShowUndoPanel(true)}
                    dotColorClass="bg-white/50 shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                    textColorClass="text-[var(--text)]"
                    hoverTextColorClass="group-hover:text-white"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                    iconBorderHoverClass="group-hover:border-white/30"
                  />
                </CommandScreenSidebar>
              </CommandScreenBody>
            </CommandScreenLayout>
          )}

          {activeTab === "CONFLICTS" && (
            <>
              <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-4 hidden xl:flex shrink-0">
                  <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3 shrink-0">
                    <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">warning</span>
                    </div>
                    <span className="truncate">{t("conflict_telemetry") || "CONFLICT TELEMETRY"}</span>
                  </h2>
                  <div className="w-64">
                    <CustomDropdown
                      disableTint={true}
                      options={(playSets || []).map((s: any) => ({ id: s.name, label: s.name }))}
                      value={scanScope}
                      onChange={(val: any) => { setScanScope(val); runRadar(val); }}
                      icon="map"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                  <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
                    <input
                      type="text"
                      placeholder={t("radar_search_conflicts") || "SEARCH CONFLICTS..."}
                      value={conflictSearch}
                      onChange={(e) => setConflictSearch(e.target.value)}
                      className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                    />
                    {conflictSearch && (
                      <button onClick={() => setConflictSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/10 shadow-inner h-12 shrink-0">
                    <button onClick={() => setActiveConflictSeverity(activeConflictSeverity === 4 ? null : 4)} className={`h-full px-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${activeConflictSeverity === 4 ? 'bg-[var(--danger)]/20 text-[var(--danger)]' : 'text-[var(--danger)] hover:bg-white/5'}`}>S4</button>
                    <button onClick={() => setActiveConflictSeverity(activeConflictSeverity === 3 ? null : 3)} className={`h-full px-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${activeConflictSeverity === 3 ? 'bg-[var(--warning)]/20 text-[var(--warning)]' : 'text-[var(--warning)] hover:bg-white/5'}`}>S3</button>
                    <button onClick={() => setActiveConflictSeverity(activeConflictSeverity === 2 ? null : 2)} className={`h-full px-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${activeConflictSeverity === 2 ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--accent)] hover:bg-white/5'}`}>S2</button>
                    <button onClick={() => setActiveConflictSeverity(activeConflictSeverity === 1 ? null : 1)} className={`h-full px-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${activeConflictSeverity === 1 ? 'bg-blue-400/20 text-blue-400' : 'text-blue-400 hover:bg-white/5'}`}>S1</button>
                  </div>
                </div>
              </div>

              {!hasScanned && !loading && !error && (
                <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
                  <div className="w-56 h-56 rounded-full border border-white/5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center relative group cursor-pointer" onClick={() => runRadar()}>
                    <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[var(--accent)] opacity-20 animate-[spin_20s_linear_infinite]" />
                    <div className="absolute inset-4 rounded-full border border-[var(--text)] opacity-10 animate-[spin_15s_linear_infinite_reverse]" />
                    <div className="absolute inset-10 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-10 animate-[spin_25s_linear_infinite]" />
                    <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
                      {t("icon_track_changes")}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-6 relative z-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="text-center space-y-2 mb-4">
                      <h2 className="text-2xl font-black uppercase tracking-widest text-white/90">
                        {t("landing_title") || "SYSTEM STANDBY"}
                      </h2>
                      <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80 max-w-lg">
                        {t("landing_desc") || "Select a blueprint from the dropdown and click SCAN to analyze for conflicts."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
                  <div className="w-56 h-56 rounded-full border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center relative group">
                    <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[var(--accent)] opacity-80 animate-[spin_3s_linear_infinite]" />
                    <div className="absolute inset-4 rounded-full border-[4px] border-solid border-transparent border-t-[var(--accent)] opacity-60 animate-[spin_1s_linear_infinite_reverse]" />
                    <div className="absolute inset-8 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-40 animate-[spin_5s_linear_infinite]" />
                    <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] animate-pulse drop-shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_80%,transparent)]">
                      {t("icon_track_changes")}
                    </span>
                  </div>
                  <div className="space-y-4 max-w-xl relative z-10">
                    <h2 className="text-4xl font-black text-[var(--accent)] uppercase tracking-tighter drop-shadow-lg animate-pulse">
                      {t("scanning_title") || "SCANNING..."}
                    </h2>
                    <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80">
                      {t("scanning_desc") || "Analyzing load order..."}
                    </p>
                  </div>
                </div>
              )}

              {hasScanned && stats.totalClashes === 0 && !loading && (
                <div className="py-24 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-700 relative">
                  <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] blur-[100px] rounded-full pointer-events-none" />
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center justify-center relative backdrop-blur-md">
                      <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[color-mix(in_srgb,var(--success)_50%,transparent)] animate-[spin_10s_linear_infinite]" />
                      <div className="absolute inset-2 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[spin_15s_linear_infinite_reverse]" />
                      <span className="material-symbols-outlined !text-[64px] text-[var(--success)] animate-pulse drop-shadow-[0_0_15px_color-mix(in_srgb,var(--success)_80%,transparent)]">
                        {t("icon_check")}
                      </span>
                    </div>
                  </div>
                  <div className="relative z-10 max-w-lg">
                    <h2 className="text-4xl font-black text-[var(--success)] uppercase tracking-tighter mb-4 drop-shadow-[0_0_10px_color-mix(in_srgb,var(--success)_30%,transparent)]">
                      {t("clear_title")}
                    </h2>
                    <p className="text-xs font-bold leading-relaxed uppercase tracking-[0.2em] text-[var(--subtext)] opacity-90 border-t border-[color-mix(in_srgb,var(--success)_20%,transparent)] pt-4">
                      {t("clear_desc")}
                    </p>
                  </div>
                </div>
              )}

              {hasScanned && filteredFatal.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 4) && (
                <section className="space-y-6">
                  <div className="flex items-center justify-between border-b theme-border-danger pb-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--danger)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                        <span className="material-symbols-outlined !text-2xl theme-text-danger drop-shadow-[0_0_8px_rgba(var(--danger-rgb),0.5)]">{t("icon_warning_amber")}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-2xl font-black theme-text-danger uppercase tracking-tighter italic drop-shadow-md">{t("tier4_title") || "FATAL ENGINE CLASHES"}</h2>
                        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("tier4_desc")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                    {filteredFatal.slice(0, visibleFatal).map((c: any) => (
                      <ConflictCard key={c.mod_pair} conflict={c} tier={4} onClick={() => setActiveConflictRes(c)} />
                    ))}
                  </div>
                  {fatalConflicts.length > visibleFatal && (
                    <div className="flex justify-center mt-8">
                      <button onClick={() => setVisibleFatal(v => v + 100)} className="px-6 py-3 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-1">
                        {t("nav_load_more") || "Load More"} ({fatalConflicts.length - visibleFatal})
                      </button>
                    </div>
                  )}
                </section>
              )}

              {hasScanned && filteredTuning.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 3) && (
                <section className="space-y-6 mt-12">
                  <div className="flex items-center justify-between border-b theme-border-warning pb-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--warning)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
                        <span className="material-symbols-outlined !text-2xl theme-text-warning drop-shadow-[0_0_8px_rgba(var(--warning-rgb),0.5)]">{t("icon_tune")}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-2xl font-black theme-text-warning uppercase tracking-tighter italic drop-shadow-md">{t("tier3_title")}</h2>
                        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("tier3_desc")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                    {filteredTuning.slice(0, visibleTuning).map((c: any) => (
                      <ConflictCard key={c.mod_pair} conflict={c} tier={3} onClick={() => setActiveConflictRes(c)} />
                    ))}
                  </div>
                  {tuningConflicts.length > visibleTuning && (
                    <div className="flex justify-center mt-8">
                      <button onClick={() => setVisibleTuning(v => v + 100)} className="px-6 py-3 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-1">
                        {t("nav_load_more") || "Load More"} ({tuningConflicts.length - visibleTuning})
                      </button>
                    </div>
                  )}
                </section>
              )}

              {hasScanned && filteredClone.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 2) && (
                <section className="space-y-6 mt-12">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b theme-border-accent pb-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--accent)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
                        <span className="material-symbols-outlined lowercase !text-2xl theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("icon_all_inclusive")}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-2xl font-black theme-text-accent uppercase tracking-tighter italic drop-shadow-md">{t("duplicate_clones")}</h2>
                        <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("identical_assets")}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isBulkMode && (
                        <>
                          <button onClick={targetHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] backdrop-blur-md hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all">
                            {t("btn_select_hq")}
                          </button>
                          <button onClick={targetNonHq} className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] backdrop-blur-md hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all">
                            {t("btn_select_nonhq")}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          if (!isBulkMode) setIsBulkMode(true);
                          else if (selectedForVault.length > 0) setConfirmMassVault(true);
                          else setIsBulkMode(false);
                        }}
                        className={`h-[42px] px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center border ${isBulkMode
                          ? (selectedForVault.length > 0 ? "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] shadow-lg" : "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-lg")
                          : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-white/10 text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5"
                          }`}
                      >
                        {isBulkMode ? (selectedForVault.length > 0 ? `${t("purge")} (${selectedForVault.length})` : t("btn_cancel_selection")) : "✓ " + (t("btn_select_assets"))}
                      </button>
                    </div>
                  </div>

                  {confirmMassVault && (
                    <div className="animate-in slide-in-from-top-2 p-6 theme-glass-panel border-white/10 rounded-[var(--radius)] flex flex-col md:flex-row gap-6 items-center justify-between shadow-xl mb-6">
                      <p className="text-sm font-black theme-text-danger uppercase tracking-widest">
                        {t("secure_quarantine") || `Yeet ${selectedForVault.length} duplicates to the Vault?`}
                      </p>
                      <div className="flex gap-4">
                        <button onClick={executeMassVault} className="px-8 py-3 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] transition-all text-[10px] tracking-widest font-black rounded-xl">
                          {t("confirm_purge")}
                        </button>
                        <button onClick={() => setConfirmMassVault(false)} className="px-8 py-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] hover:bg-white/10 transition-all text-[10px] tracking-widest font-black rounded-xl">
                          {t("nav_cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                    {filteredClone.slice(0, visibleClone).map((c: any) => (
                      <ConflictCard key={c.mod_pair} conflict={c} tier={2} isSelectedA={selectedForVault.includes(c.modA)} isSelectedB={selectedForVault.includes(c.modB)} onKeepA={() => toggleTarget(c.modA, c.modB)} onKeepB={() => toggleTarget(c.modB, c.modA)} onClick={() => setActiveConflictRes(c)} />
                    ))}
                  </div>
                  {cloneConflicts.length > visibleClone && (
                    <div className="flex justify-center mt-8">
                      <button onClick={() => setVisibleClone(v => v + 100)} className="px-6 py-3 rounded-2xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-1">
                        {t("nav_load_more") || "Load More"} ({cloneConflicts.length - visibleClone})
                      </button>
                    </div>
                  )}
                </section>
              )}

              {hasScanned && filteredSoft.length > 0 && (activeConflictSeverity === null || activeConflictSeverity === 1) && (
                <details className="group space-y-6 theme-glass-inner p-6 rounded-[var(--radius)] border border-white/5 cursor-pointer mt-12 mb-32 transition-all hover:border-white/10">
                  <summary className="flex flex-col gap-1 list-none outline-none">
                    <div className="flex justify-between items-center w-full">
                      <h3 className="text-sm font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest flex items-center gap-3 group-open:text-[var(--text)] transition-colors">
                        <span className="material-symbols-outlined !text-xl">{t("icon_info")}</span> {t("tier1_title") || "Collision Severity 1 ({count})".replace("{count}", String(softConflicts.length))}
                      </h3>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--subtext)] opacity-60 group-open:rotate-180 transition-transform shrink-0">
                        <span className="material-symbols-outlined !text-[20px]">{t("icon_expand_more")}</span>
                      </div>
                    </div>
                    <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest ml-9">{t("safe_textures")}</p>
                  </summary>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 pt-6 border-t border-white/5 mt-4">
                    {filteredSoft.slice(0, visibleSoft).map((c: any) => (
                      <ConflictCard key={c.mod_pair} conflict={c} tier={1} onClick={() => setActiveConflictRes(c)} onIgnore={() => ignoreConflict(c.mod_pair)} />
                    ))}
                  </div>
                  {softConflicts.length > visibleSoft && (
                    <div className="flex justify-center mt-6">
                      <button onClick={() => setVisibleSoft(v => v + 100)} className="px-6 py-3 rounded-2xl theme-glass-panel border border-white/10 text-[var(--text)] hover:bg-white/5 transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-1">
                        {t("nav_load_more") || "Load More"} ({softConflicts.length - visibleSoft})
                      </button>
                    </div>
                  )}
                </details>
              )}
            </>
          )}

          {activeTab === "OVERRIDES" && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-4 hidden xl:flex shrink-0">
                  <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3 shrink-0">
                    <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">rule</span>
                    </div>
                    <span className="truncate">{t("active_overrides") || "ACTIVE OVERRIDES"}</span>
                  </h2>
                  <div className="w-64">
                    <CustomDropdown
                      disableTint={true}
                      options={(playSets || []).map((s: any) => ({ id: s.name, label: s.name }))}
                      value={scanScope}
                      onChange={(val: any) => { setScanScope(val); runRadar(val); }}
                      icon="map"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
                  <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">search</span>
                    <input
                      type="text"
                      placeholder={t("radar_search_overrides") || "SEARCH OVERRIDES..."}
                      value={overrideSearch}
                      onChange={(e) => setOverrideSearch(e.target.value)}
                      className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                    />
                    {overrideSearch && (
                      <button onClick={() => setOverrideSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center overflow-hidden theme-glass-panel rounded-xl border border-white/10 shadow-inner h-12 shrink-0">
                    <button onClick={() => setOverrideTab("ACTIVE")} className={`h-full px-4 flex items-center justify-center font-black text-[10px] uppercase tracking-widest transition-all ${overrideTab === "ACTIVE" ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("active") || "ACTIVE"}</button>
                    <button onClick={() => setOverrideTab("IGNORED")} className={`h-full px-4 flex items-center justify-center font-black text-[10px] uppercase tracking-widest transition-all ${overrideTab === "IGNORED" ? 'bg-white/10 text-[var(--text)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}>{t("ignored") || "IGNORED"}</button>
                  </div>

                </div>
              </div>
              {(() => {
                const activeSetMods = playSets.find((s: any) => s.name === scanScope)?.mods || [];
                const manualOverrides = activeSetMods.filter((m: any) => (typeof m === 'string' ? m : (m.name || m.path || '')).toLowerCase().startsWith("sanctuary")).map((m: any) => typeof m === 'string' ? m : (m.name || m.path || ''));

                const resolvedOverrides = ignoredPairs.map((pair: string) => {
                  const parts = pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                  const left = parts[0] || pair;
                  const right = parts[1];
                  if (!right) return null;

                  const leftClean = left.replace(/^Sanctuary[/\\]/i, "").toLowerCase();
                  const rightClean = right.replace(/^Sanctuary[/\\]/i, "").toLowerCase();

                  const leftIsWinner = manualOverrides.some((m: string) => {
                    const p = m.replace(/^Sanctuary[/\\]/i, "").toLowerCase();
                    return p === leftClean || p.endsWith(`/${leftClean}`) || p.endsWith(`\\${leftClean}`);
                  });

                  const rightIsWinner = manualOverrides.some((m: string) => {
                    const p = m.replace(/^Sanctuary[/\\]/i, "").toLowerCase();
                    return p === rightClean || p.endsWith(`/${rightClean}`) || p.endsWith(`\\${rightClean}`);
                  });

                  if (leftIsWinner || rightIsWinner) {
                    return {
                      pair,
                      winnerPath: leftIsWinner ? left : right,
                      loserPath: leftIsWinner ? right : left,
                      isManual: false
                    };
                  }
                  return null;
                }).filter(Boolean) as any[];

                const manualOverridesOnly = manualOverrides.filter((m: string) => {
                  const cleanName = m.replace(/^Sanctuary[/\\]/i, "").toLowerCase();
                  return !resolvedOverrides.some(res => res.winnerPath.toLowerCase().replace(/^sanctuary[/\\]/i, "").endsWith(cleanName));
                }).map((m: string) => ({
                  pair: m,
                  winnerPath: m,
                  loserPath: t("unknown_file") || "UNKNOWN FILE",
                  isManual: true
                }));

                const allActiveOverrides = [...resolvedOverrides, ...manualOverridesOnly].filter(o => !overrideSearch || o.winnerPath.toLowerCase().includes(overrideSearch.toLowerCase()));
                const trueIgnoredPairs = ignoredPairs.filter((pair: string) => !resolvedOverrides.some(res => res.pair === pair));

                return (
                  <>
                    {allActiveOverrides.length === 0 && trueIgnoredPairs.length === 0 && (
                      <EmptyState icon="rule" title="NO OVERRIDES" subtitle="No conflicts have been resolved or ignored for this blueprint." />
                    )}

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
                      {overrideTab === "ACTIVE" && allActiveOverrides.map((override: any, idx: number) => {
                        const cleanWinnerPath = override.winnerPath.replace(/^Sanctuary[/\\]/i, "");
                        const displayWinnerName = formatDisplayName(cleanWinnerPath, activeGameSchema);

                        const cleanLoserPath = override.loserPath.replace(/^Sanctuary[/\\]/i, "");
                        const displayLoserName = override.isManual ? cleanLoserPath : formatDisplayName(cleanLoserPath, activeGameSchema);

                        return (
                          <div key={`active_${idx}`} className="p-3 rounded-2xl border border-white/5 theme-glass-panel flex flex-col gap-2 group relative">
                            <div className="p-3 rounded-2xl border shadow-inner flex flex-col relative transition-colors bg-white/5 border-[var(--accent)]/30">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-100 text-[var(--accent)]">
                                  <span className="material-symbols-outlined !text-[12px]">verified</span> {t("active_override") || "ACTIVE OVERRIDE"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
                                  {displayWinnerName}
                                </span>
                              </div>
                              <p className="text-[9px] font-mono opacity-50 mt-1 truncate w-full" title={override.winnerPath}>{override.winnerPath}</p>
                            </div>

                            <div className="flex items-center justify-center -my-3 relative z-20 pointer-events-none">
                              <div className="w-6 h-6 rounded-full border shadow-lg flex items-center justify-center bg-[var(--bg)] border-white/10 text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[14px]">arrow_downward</span>
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl border shadow-inner flex flex-col relative transition-colors bg-black/40 border-white/5 opacity-50">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                  <span className="material-symbols-outlined !text-[12px]">visibility_off</span> {t("overridden_file") || "OVERRIDDEN FILE"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
                                  {displayLoserName}
                                </span>
                              </div>
                              <p className="text-[9px] font-mono opacity-50 mt-1 truncate w-full" title={override.loserPath}>{override.loserPath}</p>
                            </div>

                            <button
                              onClick={() => override.isManual ? undoOverride(cleanWinnerPath).then(() => runRadar()) : unignoreConflict(override.pair).then(() => undoOverride(cleanWinnerPath).then(() => runRadar()))}
                              className="mt-1 w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[var(--danger)]/20 text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined !text-[14px]">undo</span> {t("revert_override") || "REVERT OVERRIDE"}
                            </button>
                          </div>
                        );
                      })}

                      {overrideTab === "IGNORED" && trueIgnoredPairs.map((pair: string, i: number) => {
                        const parts = pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
                        const left = parts[0] || pair;
                        const right = parts[1] || t("unknown_file") || "UNKNOWN FILE";
                        const leftName = left.split(/[/\\]/).pop();
                        const rightName = right.split(/[/\\]/).pop();

                        return (
                          <div key={`ignored_${i}`} className="p-3 rounded-2xl border border-white/5 theme-glass-panel flex flex-col gap-2 group relative opacity-50 hover:opacity-100 transition-opacity duration-300">

                            <div className="p-3 rounded-2xl border shadow-inner flex flex-col relative transition-colors bg-white/5 border-white/10">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                  <span className="material-symbols-outlined !text-[12px]">inventory_2</span> {t("ignored_file_a") || "ARTIFACT A"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
                                  {formatDisplayName(leftName || "", activeGameSchema)}
                                </span>
                              </div>
                              <p className="text-[9px] font-mono opacity-50 mt-1 truncate w-full" title={left}>{left}</p>
                            </div>

                            <div className="flex items-center justify-center -my-3 relative z-20 pointer-events-none">
                              <div className="w-6 h-6 rounded-full border shadow-lg flex items-center justify-center bg-[var(--bg)] border-white/10 text-[var(--subtext)]">
                                <span className="material-symbols-outlined !text-[14px]">visibility_off</span>
                              </div>
                            </div>

                            <div className="p-3 rounded-2xl border shadow-inner flex flex-col relative transition-colors bg-white/5 border-white/10">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-80 text-[var(--subtext)]">
                                  <span className="material-symbols-outlined !text-[12px]">inventory_2</span> {t("ignored_file_b") || "ARTIFACT B"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
                                  {formatDisplayName(rightName || "", activeGameSchema)}
                                </span>
                              </div>
                              <p className="text-[9px] font-mono opacity-50 mt-1 truncate w-full" title={right}>{right}</p>
                            </div>

                            <button
                              onClick={() => unignoreConflict(pair).then(() => runRadar())}
                              className="mt-1 w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[var(--accent)]/20 text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined !text-[14px]">undo</span> {t("unignore_conflict") || "UNIGNORE"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      {activeConflictRes && (
        <ConflictResolutionSidebar
          conflict={activeConflictRes}
          onClose={() => setActiveConflictRes(null)}
          onVault={vaultSingleScript}
          onOverride={applyOverride}
          onUndo={undoOverride}
        />
      )}

      <UndoWinnersPanel
        isOpen={showUndoPanel}
        onClose={() => setShowUndoPanel(false)}
        scanScope={scanScope}
        onUndoComplete={runRadar}
        onUndo={undoOverride}
        onClearAll={clearAllOverrides}
      />
    </>
  );
};
