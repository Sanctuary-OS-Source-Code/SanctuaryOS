import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, CustomDropdown, SidebarActionButton, standardDangerButtonClass, standardSuccessButtonClass, standardButtonClass, SidePanel } from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import ConflictCard from "./ConflictCard";
import ConflictResolutionSidebar from "./ConflictResolutionSidebar";
import UndoWinnersPanel from "./UndoWinnersPanel";

const isCloneConflict = (modA: string, modB: string) => {
  if (!modA || !modB) return false;
  const clean = (s: string) => {
    const file = s.split(/[\\/]/).pop() || s;
    const extMatch = file.match(/\.(package|ts4script)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const cleaned = file.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\.package|\.ts4script)/g, '').replace(/[^a-z0-9]/g, '');
    return cleaned + "_" + ext;
  };
  return clean(modA) === clean(modB);
};

export const DbpfScout = () => {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const { t } = useLexicon();
  const [loading, setLoading] = useState(false);
  const[error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [showUndoPanel, setShowUndoPanel] = useState(false);
  const [stats, setStats] = useState({ packages: 0, totalClashes: 0 });

  const { playSets, setPlaySets, activePlaySetIndex } = useStore();
  const defaultScope = playSets && playSets.length > 0 ? (playSets[activePlaySetIndex]?.name || playSets[0].name) : "";
  const [scanScope, setScanScope] = useState(defaultScope);
  
  useEffect(() => {
    if (!scanScope && playSets && playSets.length > 0) {
      setScanScope(playSets[activePlaySetIndex]?.name || playSets[0].name);
    }
  }, [playSets, activePlaySetIndex, scanScope]);

  const [ignoredPairs, setIgnoredPairs] = useState<string[]>(() => {
    const saved = localStorage.getItem("sanctuary_ignored_conflicts");
    return saved ? JSON.parse(saved) : [];
  });

  const [fatalConflicts, setFatalConflicts] = useState<any[]>([]);
  const [tuningConflicts, setTuningConflicts] = useState<any[]>([]);
  const[cloneConflicts, setCloneConflicts] = useState<any[]>([]);
  const [softConflicts, setSoftConflicts] = useState<any[]>([]);

  useEffect(() => {
    if (hasScanned) {
      try {
        localStorage.setItem("sanctuary_local_conflicts", JSON.stringify([...fatalConflicts, ...tuningConflicts]));
      } catch (e) {}
    }
  }, [fatalConflicts, tuningConflicts, hasScanned]);

  const [selectedForVault, setSelectedForVault] = useState<string[]>([]);
  const [resolvingScript, setResolvingScript] = useState<string | null>(null);
  const [confirmMassVault, setConfirmMassVault] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [activeConflictRes, setActiveConflictRes] = useState<any>(null);

  const runRadar = async () => {
    setIsSidePanelOpen(false);
    setLoading(true);
    setError(null);
    setHasScanned(false);
    setSelectedForVault([]);
    setResolvingScript(null);
    setConfirmMassVault(false);
    setStats({ packages: 0, totalClashes: 0 });

    try {
      const config: any = await invoke("get_saved_coordinates");
      let targetPath = `${config.vault_path}/Mods`;
      let targetFiles: string[] | null = null;

      const scopeToUse = scanScope || (playSets.length > 0 ? playSets[0].name : "");
      const set = playSets.find((s: any) => s.name === scopeToUse);
      if (set) {
        targetFiles = set.mods;
      }

      const report = await invoke<any>("run_conflict_radar", { modsPath: targetPath, targetFiles });

      let actionableClashes = 0;
      const fatal: any[] = [];
      const tuning: any[] = [];
      const clone: any[] =[];
      const soft: any[] =[];

      report.conflicts.forEach((c: any) => {
        if (ignoredPairs.includes(c.mod_pair)) return;

        const parts = c.mod_pair.split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
        const modA = parts[0];
        const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
        const enrichedConflict = { ...c, modA, modB };

        if (isCloneConflict(modA, modB)) { clone.push(enrichedConflict); actionableClashes++; }
        else if (c.severity_rank === 4) { fatal.push(enrichedConflict); actionableClashes++; }
        else if (c.severity_rank === 3) { tuning.push(enrichedConflict); actionableClashes++; }
        else { soft.push(enrichedConflict); }
      });

      if (report.installed_mods) {
        // Detect clones missed by Rust DBPF parser (like .ts4script files)
        const nameGroups: Record<string, string[]> = {};
        const cleanForGroup = (s: string) => {
          const file = s.split(/[\\/]/).pop() || s;
          const extMatch = file.match(/\.(package|ts4script)$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : '';
          const cleaned = file.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\.package|\.ts4script)/g, '').replace(/[^a-z0-9]/g, '');
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
    } catch (err) {
      setError(String(err));
    }
    setHasScanned(true);
    setLoading(false);
  };

  const ignoreConflict = (modPair: string) => {
    const updated =[...ignoredPairs, modPair];
    setIgnoredPairs(updated);
    localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updated));
    setFatalConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setTuningConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setCloneConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setSoftConflicts((prev) => prev.filter((c) => c.mod_pair !== modPair));
    setStats((prev) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
  };

  const resetIgnored = () => {
    setIgnoredPairs([]);
    localStorage.removeItem("sanctuary_ignored_conflicts");
    if (hasScanned) runRadar();
  };

  const targetHq = () => {
    const newTargets: string[] = [...selectedForVault];
    cloneConflicts.forEach((c: any) => {
      const aIsHq = /_hq/i.test(c.modA);
      const bIsHq = /_hq/i.test(c.modB);
      let target = null;
      if (aIsHq && !bIsHq) target = c.modA;
      else if (bIsHq && !aIsHq) target = c.modB;
      if (target && !newTargets.includes(target)) newTargets.push(target);
    });
    setSelectedForVault(newTargets);
    setConfirmMassVault(false);
  };

  const targetNonHq = () => {
    const newTargets: string[] = [...selectedForVault];
    cloneConflicts.forEach((c: any) => {
      const aIsHq = /_hq/i.test(c.modA);
      const bIsHq = /_hq/i.test(c.modB);
      const aIsNonHq = /_nonhq/i.test(c.modA);
      const bIsNonHq = /_nonhq/i.test(c.modB);

      let target = null;
      if (aIsNonHq && !bIsNonHq) target = c.modA;
      else if (bIsNonHq && !aIsNonHq) target = c.modB;
      else if (!aIsHq && bIsHq) target = c.modA;
      else if (!bIsHq && aIsHq) target = c.modB;

      if (target && !newTargets.includes(target)) newTargets.push(target);
    });
    setSelectedForVault(newTargets);
    setConfirmMassVault(false);
  };

  const toggleTarget = (modName: string) => {
    setSelectedForVault((prev: string[]) => prev.includes(modName) ? prev.filter(m => m !== modName) : [...prev, modName]);
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
            const cleanM = m.replace(/\.(package|ts4script)$/i, "");
            return !selectedForVault.some((target: string) => {
               const cleanTarget = target.replace(/\.(package|ts4script)$/i, "");
               return cleanM === cleanTarget || cleanM.endsWith(`/${cleanTarget}`) || cleanM.endsWith(`\\${cleanTarget}`);
            });
         });
         
         setPlaySets(updatedSets);
         localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
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
           const cleanMod = modName.replace(/\.(package|ts4script)$/i, "");
           currentSet.mods = currentSet.mods.filter((m: string) => {
              const cleanM = m.replace(/\.(package|ts4script)$/i, "");
              return cleanM !== cleanMod && !cleanM.endsWith(`/${cleanMod}`) && !cleanM.endsWith(`\\${cleanMod}`);
           });
           setPlaySets(updatedSets);
           localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
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
        const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
        if (playSetIndex !== -1) {
           const updatedSets = [...playSets];
           const currentSet = updatedSets[playSetIndex];
           const newMods = [...currentSet.mods];
           const cleanWinner = winnerName.replace(/\.(package|ts4script)$/i, "").toLowerCase();
           const index = newMods.findIndex((m: string) => {
              const cleanM = m.replace(/\.(package|ts4script)$/i, "").toLowerCase();
              return cleanM === cleanWinner || cleanM.endsWith(`/${cleanWinner}`) || cleanM.endsWith(`\\${cleanWinner}`);
           });
           if (index !== -1) {
              if (!newMods[index].startsWith("Sanctuary/")) {
                 newMods[index] = `Sanctuary/${winnerName}`;
              }
           } else {
              newMods.push(`Sanctuary/${winnerName}`);
           }
           currentSet.mods = newMods;
           setPlaySets(updatedSets);
           localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
        }
      }

      const updatedIgnored = [...ignoredPairs, modPair];
      setIgnoredPairs(updatedIgnored);
      localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updatedIgnored));

      setTuningConflicts((prev: any[]) => prev.filter((c: any) => c.mod_pair !== modPair));
      setStats((prev: any) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
      setResolvingScript(null);
      setActiveConflictRes(null);
    } catch (err) { useStore.getState().pushStatus(`Override Error: ${err}`); }
  };

  const undoOverride = async (winnerName: string) => {
    try {
      const playSetIndex = playSets.findIndex((p: any) => p.name.toLowerCase() === scanScope.toLowerCase());
      const cleanWinner = winnerName.replace(/\.(package|ts4script)$/i, "").toLowerCase();
      
      if (playSetIndex !== -1) {
         const updatedSets = [...playSets];
         const currentSet = { ...updatedSets[playSetIndex] };
         currentSet.mods = currentSet.mods.map((m: string) => {
            const cleanM = m.replace(/\.(package|ts4script)$/i, "").toLowerCase();
            if (m.toLowerCase().startsWith("sanctuary") && (cleanM === `sanctuary/${cleanWinner}` || cleanM === `sanctuary\\${cleanWinner}` || cleanM.endsWith(`/${cleanWinner}`) || cleanM.endsWith(`\\${cleanWinner}`))) {
               return m.replace(/^Sanctuary[/\\]/i, "");
            }
            return m;
         });
         updatedSets[playSetIndex] = currentSet;
         setPlaySets(updatedSets);
         localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
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
         currentSet.mods = currentSet.mods.map((m: string) => m.replace(/^Sanctuary[/\\]/i, ""));
         updatedSets[playSetIndex] = currentSet;
         setPlaySets(updatedSets);
         localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
         window.dispatchEvent(new Event("storage"));
      }
} catch (err) { useStore.getState().pushStatus(`Undo Error: ${err}`); }
  };

  return (
    <div className={`flex flex-col h-full relative items-start animate-in fade-in zoom-in-95 duration-500 ${hasScanned || loading || error ? 'pb-24' : ''}`}>
        {/* Subtle Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
          <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] blur-[150px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] blur-[150px] rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col gap-8 w-full h-full">
          <ViewHeader title={t("radar_title")} subtitle={t("radar_subtitle")} icon={t("ui_icon_radar")} iconColorClass="text-amber-400 border-amber-500/30">
            <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
              <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_tune")}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_operations")}</span>
              </button>
            </div>
          </ViewHeader>
          
          {!hasScanned && !loading && !error && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
              <div className="w-56 h-56 rounded-full border border-white/5 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center relative group cursor-pointer" onClick={runRadar}>
                <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[var(--accent)] opacity-20 animate-[spin_20s_linear_infinite]" />
                <div className="absolute inset-4 rounded-full border border-[var(--text)] opacity-10 animate-[spin_15s_linear_infinite_reverse]" />
                <div className="absolute inset-10 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-10 animate-[spin_25s_linear_infinite]" />
                <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-500 drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
                  {t("ui_icon_radar")}
                </span>
              </div>
              <div className="space-y-4 max-w-xl relative z-10">
                <h2 className="text-4xl font-black text-[var(--text)] uppercase tracking-tighter drop-shadow-lg">
                  {t("radar_landing_title")}
                </h2>
                <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80">
                  {t("radar_landing_desc")}
                </p>
              </div>
              <button
                onClick={runRadar}
                className="px-10 py-5 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_30%,transparent)] hover:scale-105 transition-all flex items-center gap-3 relative z-10"
              >
                <span className="material-symbols-outlined !text-xl animate-pulse">{t("ui_icon_radar")}</span>
                <span className="text-xs font-black uppercase tracking-widest">{t("radar_btn_sweep")}</span>
              </button>
            </div>
          )}

          {loading && (
            <div className="w-full flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in zoom-in-95 duration-1000 relative z-10 my-auto min-h-[calc(100vh-300px)]">
              <div className="w-56 h-56 rounded-full border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center relative group">
                 <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[var(--accent)] opacity-80 animate-[spin_3s_linear_infinite]" />
                 <div className="absolute inset-4 rounded-full border-[4px] border-solid border-transparent border-t-[var(--accent)] opacity-60 animate-[spin_1s_linear_infinite_reverse]" />
                 <div className="absolute inset-8 rounded-full border-[2px] border-dotted border-[var(--warning)] opacity-40 animate-[spin_5s_linear_infinite]" />
                 <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] animate-pulse drop-shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_80%,transparent)]">
                   {t("ui_icon_radar")}
                 </span>
              </div>
              <div className="space-y-4 max-w-xl relative z-10">
                <h2 className="text-4xl font-black text-[var(--accent)] uppercase tracking-tighter drop-shadow-lg animate-pulse">
                   {t("radar_scanning_title")}
                </h2>
                <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80">
                   {t("radar_scanning_desc")}
                </p>
              </div>
            </div>
          )}

      {stats.packages > 0 && !error && (
        <div className="space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Packages Card */}
              <div className="theme-glass-panel p-8 rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg relative overflow-hidden flex flex-col justify-center group transition-all hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:-translate-y-1">
                <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 pointer-events-none">
                  <span className="material-symbols-outlined !text-[160px]">{t("ui_icon_inventory")}</span>
                </div>
                
                <div className="relative z-10">
                  <div className="text-6xl md:text-[80px] leading-none font-black text-[var(--text)] tracking-tighter mb-2">
                    {stats.packages}
                  </div>
                  <p className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-[0.2em]">
                    {t("radar_stat_packages")}
                  </p>
                </div>
              </div>

              {/* Clashes Card */}
              <div className={`theme-glass-panel p-8 rounded-3xl relative overflow-hidden flex flex-col justify-center group transition-all hover:-translate-y-1 ${stats.totalClashes > 0 ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[0_10px_40px_color-mix(in_srgb,var(--danger)_10%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:shadow-[0_15px_50px_color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' : 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
                {stats.totalClashes > 0 && <div className="absolute inset-0 bg-gradient-to-br from-[var(--danger)]/5 to-transparent pointer-events-none" />}
                
                <div className={`absolute right-[-20px] top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none ${stats.totalClashes > 0 ? 'text-[var(--danger)] opacity-[0.05] group-hover:opacity-[0.08]' : 'text-[var(--text)] opacity-[0.03] group-hover:opacity-[0.06]'} group-hover:scale-110`}>
                  <span className="material-symbols-outlined !text-[160px]">{stats.totalClashes > 0 ? 'warning' : 'check_circle'}</span>
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-start gap-4">
                    <div className={`text-6xl md:text-[80px] leading-none font-black tracking-tighter mb-2 ${stats.totalClashes > 0 ? 'text-[var(--danger)] drop-shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'text-[var(--text)]'}`}>
                      {stats.totalClashes}
                    </div>
                    {stats.totalClashes > 0 && (
                      <span className="flex h-3 w-3 relative mt-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--danger)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--danger)] shadow-[0_0_10px_var(--danger)]"></span>
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${stats.totalClashes > 0 ? 'text-[var(--danger)] drop-shadow-sm' : 'text-[var(--subtext)] opacity-60'}`}>
                    {t("radar_stat_clashes")}
                  </p>
                </div>
              </div>
            </div>
             {fatalConflicts.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b theme-border-danger pb-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--danger)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                    <span className="material-symbols-outlined !text-2xl theme-text-danger drop-shadow-[0_0_8px_rgba(var(--danger-rgb),0.5)]">{t("ui_icon_warning")}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-2xl font-black theme-text-danger uppercase tracking-tighter italic drop-shadow-md">{t("radar_tier4_title") || "Collision Severity 4"?.replace("dY>` ", "") || "FATAL ENGINE CLASHES"}</h2>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("radar_tier4_desc")}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {fatalConflicts.map((c: any) => (
                  <ConflictCard 
                    key={c.mod_pair} 
                    conflict={c} 
                    tier={4} 
                    onClick={() => setActiveConflictRes(c)} 
                  />
                ))}
              </div>
            </section>
          )}

          {tuningConflicts.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b theme-border-warning pb-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--warning)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
                    <span className="material-symbols-outlined !text-2xl theme-text-warning drop-shadow-[0_0_8px_rgba(var(--warning-rgb),0.5)]">{t("ui_icon_tune")}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-2xl font-black theme-text-warning uppercase tracking-tighter italic drop-shadow-md">{t("radar_tier3_title")}</h2>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("radar_tier3_desc")}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {tuningConflicts.map((c: any) => (
                  <ConflictCard 
                    key={c.mod_pair} 
                    conflict={c} 
                    tier={3} 
                    onClick={() => setActiveConflictRes(c)} 
                  />
                ))}
              </div>
            </section>
          )}
          {cloneConflicts.length > 0 && (
            <section className="space-y-6">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b theme-border-accent pb-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[var(--accent)]/30 flex items-center justify-center shadow-lg shrink-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
                    <span className="material-symbols-outlined lowercase !text-2xl theme-text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("ui_icon_dna")}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-2xl font-black theme-text-accent uppercase tracking-tighter italic drop-shadow-md">{t("scout_duplicate_clones")}</h2>
                    <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("scout_identical_assets")}</p>
                  </div>
                </div>
                  
                  {/* Bulk Actions */}
                  <div className="flex items-center gap-3">
                    {isBulkMode && (
                      <>
                        <button
                          onClick={targetHq}
                          className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] backdrop-blur-md hover:bg-white/10 hover:shadow-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center shrink-0"
                        >
                          {t("radar_btn_select_hq")}
                        </button>
                        <button
                          onClick={targetNonHq}
                          className="h-[42px] px-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] backdrop-blur-md hover:bg-white/10 hover:shadow-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center shrink-0"
                        >
                          {t("radar_btn_select_nonhq")}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (!isBulkMode) setIsBulkMode(true);
                        else if (selectedForVault.length > 0) setConfirmMassVault(true);
                        else setIsBulkMode(false);
                      }}
                      className={`h-[42px] px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center shrink-0 border backdrop-blur-md ${
                        isBulkMode 
                          ? (selectedForVault.length > 0 
                              ? "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] shadow-lg hover:scale-105" 
                              : "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] shadow-lg") 
                          : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-white/10 text-[var(--subtext)] hover:text-[var(--text)] hover:border-white/20 hover:bg-white/5 shadow-md"
                      }`}
                    >
                      {isBulkMode 
                        ? (selectedForVault.length > 0 ? `${t("scout_btn_yeet")} (${selectedForVault.length})` : t("vault_btn_cancel_selection"))
                        : "✓ " + (t("vault_btn_select_assets"))}
                    </button>
                  </div>
                </div>

              {confirmMassVault && (
                <div className="animate-in slide-in-from-top-2 p-6 theme-glass-panel border-white/10 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center justify-between shadow-xl mb-6">
                  <p className="text-sm font-black theme-text-danger uppercase tracking-widest">
                    {t("scout_secure_quarantine") || "SECURE {count} TARGETS IN QUARANTINE".replace("{count}", String(selectedForVault.length)) || `Yeet ${selectedForVault.length} duplicates to the Vault?`}
                  </p>
                  <div className="flex gap-4 w-full md:w-auto">
                    <button onClick={executeMassVault} className="flex-1 md:flex-none px-8 py-3 bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] shadow-lg hover:scale-105 transition-all text-[10px] tracking-widest font-black rounded-xl">
                      {t("scout_confirm_purge")}
                    </button>
                    <button onClick={() => setConfirmMassVault(false)} className="flex-1 md:flex-none px-8 py-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 text-[var(--text)] backdrop-blur-md hover:bg-white/10 hover:shadow-xl text-[10px] tracking-widest font-black rounded-xl transition-all">
                      {t("ui_btn_cancel")}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {cloneConflicts.map((c: any) => (
                  <ConflictCard 
                    key={c.mod_pair} 
                    conflict={c} 
                    tier={2} 
                    isBulkMode={isBulkMode}
                    isSelectedA={selectedForVault.includes(c.modA)}
                    isSelectedB={selectedForVault.includes(c.modB)}
                    onToggleSelectA={() => toggleTarget(c.modA)}
                    onToggleSelectB={() => toggleTarget(c.modB)}
                    onClick={() => setActiveConflictRes(c)}
                  />
                ))}
              </div>
            </section>
          )}

          {softConflicts.length > 0 && (
            <details className="group space-y-6 theme-glass-inner p-6 rounded-3xl border border-white/5 cursor-pointer mb-32">
              <summary className="flex flex-col gap-1 list-none outline-none">
                <div className="flex justify-between items-center w-full">
                  <h3 className="text-sm font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest flex items-center gap-3 group-open:text-[var(--text)] transition-colors">
                    <span className="material-symbols-outlined !text-xl">{t("ui_icon_info")}</span> {t("scout_minor_overlaps") || "Collision Severity 1 ({count})".replace("{count}", String(softConflicts.length))}
                  </h3>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--subtext)] opacity-60 group-open:rotate-180 transition-transform shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_expand")}</span>
                  </div>
                </div>
                <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest ml-9">{t("scout_safe_textures")}</p>
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-6 border-t border-white/5 mt-4">
                {softConflicts.map((c: any) => (
                  <ConflictCard 
                    key={c.mod_pair} 
                    conflict={c} 
                    tier={1}
                    onIgnore={() => ignoreConflict(c.mod_pair)}
                  />
                ))}
              </div>
            </details>
          )}

          {hasScanned && stats.totalClashes === 0 && !loading && (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-700 relative">
              <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] blur-[100px] rounded-full pointer-events-none" />
              <div className="relative">
                <div className="w-32 h-32 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] shadow-[0_0_50px_color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center justify-center relative backdrop-blur-md">
                  <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[color-mix(in_srgb,var(--success)_50%,transparent)] animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-2 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[spin_15s_linear_infinite_reverse]" />
                  <span className="material-symbols-outlined !text-[64px] text-[var(--success)] animate-pulse drop-shadow-[0_0_15px_color-mix(in_srgb,var(--success)_80%,transparent)]">
                    {t("ui_icon_check")}
                  </span>
                </div>
              </div>
              <div className="relative z-10 max-w-lg">
                <h2 className="text-4xl font-black text-[var(--success)] uppercase tracking-tighter mb-4 drop-shadow-[0_0_10px_color-mix(in_srgb,var(--success)_30%,transparent)]">
                  {t("radar_clear_title")}
                </h2>
                <p className="text-xs font-bold leading-relaxed uppercase tracking-[0.2em] text-[var(--subtext)] opacity-90 border-t border-[color-mix(in_srgb,var(--success)_20%,transparent)] pt-4">
                  {t("radar_clear_desc")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {hasScanned && stats.packages === 0 && !loading && !error && (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-6 opacity-60 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-24 h-24 rounded-full theme-panel-accent border flex items-center justify-center">
            <span className="material-symbols-outlined !text-[48px] grayscale">{t("ui_icon_folder")}</span>
          </div>
          <div>
            <h2 className="text-3xl font-black theme-text-accent uppercase tracking-tighter mb-2">{t("radar_empty_title")}</h2>
            <p className="text-sm font-medium leading-relaxed text-[var(--subtext)] opacity-80 max-w-lg mx-auto">
              {t("radar_empty_desc")}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="theme-panel-danger border p-8 rounded-3xl flex items-start gap-4">
          <span className="material-symbols-outlined !text-[32px]">{t("ui_icon_warning")}</span>
          <div>
            <h3 className="theme-text-danger font-black uppercase tracking-widest mb-1 text-sm">{t("scout_radar_malfunction")}</h3>
            <p className="theme-text-danger opacity-80 font-mono text-xs">{error}</p>
          </div>
        </div>
      )}

      {activeConflictRes && (
        <ConflictResolutionSidebar 
          conflict={activeConflictRes} 
          onClose={() => setActiveConflictRes(null)} 
          onVault={vaultSingleScript}
          onOverride={applyOverride}
          onUndo={undoOverride}
        />
      )}

      </div>

      <UndoWinnersPanel 
        isOpen={showUndoPanel} 
        onClose={() => setShowUndoPanel(false)}
        scanScope={scanScope}
        onUndoComplete={runRadar}
        onUndo={undoOverride}
        onClearAll={clearAllOverrides}
      />

      <SidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        title={t("radar_tools_title")}
        subtitle={t("radar_tools_subtitle")}
        icon="tune"
        iconColorClass="text-amber-400 border-amber-500/30"
      >
        <div className="flex flex-col gap-6">
           <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative group/card shrink-0 h-[240px]">
             <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl" />
             <div className="flex items-center gap-4 mb-6 relative z-10">
               <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-amber-400">
                 <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_my_location")}</span>
               </div>
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("scout_sidebar_scope")}</h3>
             </div>
             
             <div className="relative z-10 flex flex-col gap-4">
               <CustomDropdown
                 disableTint={true}
                 value={scanScope || (playSets.length > 0 ? playSets[0].name : "")}
                 options={playSets.map((set: any) => ({ id: set.name, label: set.name }))}
                 onChange={(val: any) => setScanScope(val[0])}
               />
               <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 text-center px-4 leading-relaxed tracking-wide">{t("scout_sidebar_scope_desc")}</p>
             </div>
           </div>
           
           <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card">
             <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
             <div className="flex items-center gap-4 mb-6 relative z-10">
               <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-amber-400">
                 <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_bolt")}</span>
               </div>
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("scout_sidebar_actions")}</h3>
             </div>
             
             <div className="relative z-10 flex flex-col gap-3">
               <SidebarActionButton id="SWEEP" icon="track_changes" label={t("radar_btn_sweep")} onClick={runRadar} active={false} />
               <SidebarActionButton id="UNDO" icon="undo" label={t("scout_sidebar_undo_winners")} onClick={() => setShowUndoPanel(true)} active={showUndoPanel} />
             </div>
           </div>
        </div>
      </SidePanel>
    </div>
  );
};
