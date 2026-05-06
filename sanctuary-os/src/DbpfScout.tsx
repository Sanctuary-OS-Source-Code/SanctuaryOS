import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { ViewHeader, formatDisplayName, CustomDropdown } from "./shared";
import { useLexicon } from "./LexiconContext";

const isCloneConflict = (modA: string, modB: string) => {
  if (!modA || !modB) return false;
  const clean = (s: string) => s.toLowerCase().replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\.package|\.ts4script)/g, '').replace(/[^a-z0-9]/g, '');
  return clean(modA) === clean(modB);
};

export const DbpfScout = () => {
  const { t } = useLexicon();
  const [loading, setLoading] = useState(false);
  const[error, setError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [stats, setStats] = useState({ packages: 0, totalClashes: 0 });

  const [scanScope, setScanScope] = useState("active");
  const [playSets] = useState<{name: string, mods: string[]}[]>(() => {
    const saved = localStorage.getItem("sanctuary_playsets");
    return saved ? JSON.parse(saved) : [];
  });

  const [ignoredPairs, setIgnoredPairs] = useState<string[]>(() => {
    const saved = localStorage.getItem("sanctuary_ignored_conflicts");
    return saved ? JSON.parse(saved) : [];
  });

  const [fatalConflicts, setFatalConflicts] = useState<any[]>([]);
  const [tuningConflicts, setTuningConflicts] = useState<any[]>([]);
  const[cloneConflicts, setCloneConflicts] = useState<any[]>([]);
  const [softConflicts, setSoftConflicts] = useState<any[]>([]);

  const [selectedForVault, setSelectedForVault] = useState<string[]>([]);
  const [resolvingScript, setResolvingScript] = useState<string | null>(null);
  const [confirmMassVault, setConfirmMassVault] = useState(false);

  const runRadar = async () => {
    setLoading(true);
    setError(null);
    setHasScanned(false);
    setSelectedForVault([]);
    setResolvingScript(null);
    setConfirmMassVault(false);
    setStats({ packages: 0, totalClashes: 0 });

    try {
      const config: any = await invoke("get_saved_coordinates");
      let targetPath = config.mods_path;
      let targetFiles: string[] | null = null;

      if (scanScope === "vault") {
        targetPath = `${config.vault_path}/Mods`;
      } else if (scanScope !== "active") {
        const set = playSets.find(s => s.name === scanScope);
        if (set) {
          targetPath = `${config.vault_path}/Mods`;
          targetFiles = set.mods;
        }
      }

      const report = await invoke<any>("run_conflict_radar", { modsPath: targetPath, targetFiles });

      let actionableClashes = 0;
      const fatal: any[] = [];
      const tuning: any[] = [];
      const clone: any[] =[];
      const soft: any[] =[];

      report.conflicts.forEach((c: any) => {
        if (ignoredPairs.includes(c.mod_pair)) return;

        const [modA, modB] = c.mod_pair.split(/\s+⚔️\s+/);
        const enrichedConflict = { ...c, modA, modB };

        if (c.severity_rank === 4) { fatal.push(enrichedConflict); actionableClashes++; }
        else if (c.severity_rank === 3) { tuning.push(enrichedConflict); actionableClashes++; }
        else if (isCloneConflict(modA, modB)) { clone.push(enrichedConflict); actionableClashes++; }
        else { soft.push(enrichedConflict); }
      });

      if (report.installed_mods) {
        const { data: hitList, error: dbError } = await supabase.from('logical_conflicts').select('*');
        if (hitList && !dbError) {
          hitList.forEach((hit: any) => {
            const actualA = report.installed_mods.find((m: string) => m.toLowerCase().includes(hit.mod_a.toLowerCase()));
            const actualB = report.installed_mods.find((m: string) => m.toLowerCase().includes(hit.mod_b.toLowerCase()));

            if (actualA && actualB) {
              const ghostPair = `${actualA} 👻 ${actualB}`;
              if (!ignoredPairs.includes(ghostPair)) {
                actionableClashes++;
                const ghostConflict = { mod_pair: ghostPair, modA: actualA, modB: actualB, is_ghost: true, resolution_note: hit.resolution_note, severity_rank: hit.severity_rank };
                if (hit.severity_rank === 4) fatal.push(ghostConflict);
                else if (hit.severity_rank === 3) tuning.push(ghostConflict);
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

  const targetPattern = (pattern: RegExp) => {
    const newTargets: string[] = [...selectedForVault];
    cloneConflicts.forEach((c: any) => {
      if (pattern.test(c.modA) && !newTargets.includes(c.modA)) newTargets.push(c.modA);
      else if (pattern.test(c.modB) && !newTargets.includes(c.modB)) newTargets.push(c.modB);
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
      const config: any = await invoke("get_saved_coordinates");
      for (const modName of selectedForVault) {
        try {
          await invoke("move_to_vault", { fileName: modName, modsPath: config.mods_path, vaultPath: config.vault_path, forceReplace: false });
        } catch (err) {
          if (err !== "DNA_MATCH") {
             console.error(`Mass Vault Error: ${err}`);
          }
        }
      }
      await runRadar();
    } catch (err) { alert(`Mass Vault Error: ${err}`); setLoading(false); }
  };

  const vaultSingleScript = async (modName: string) => {
    try {
      const config: any = await invoke("get_saved_coordinates");
      try {
        await invoke("move_to_vault", { fileName: modName, modsPath: config.mods_path, vaultPath: config.vault_path, forceReplace: false });
        await runRadar();
      } catch (err) {
        if (err !== "DNA_MATCH") {
           alert(`Vault Error: ${err}`);
        }
      }
    } catch (err) { alert(`Error: ${err}`); }
  };

  const applyOverride = async (winnerName: string, modPair: string) => {
    try {
      const config: any = await invoke("get_saved_coordinates");
      await invoke("set_mod_override", { fileName: winnerName, modsPath: config.mods_path });
      setTuningConflicts((prev: any[]) => prev.filter((c: any) => c.mod_pair !== modPair));
      setStats((prev: any) => ({ ...prev, totalClashes: prev.totalClashes - 1 }));
      setResolvingScript(null);
    } catch (err) { alert(`Override Error: ${err}`); }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 w-full text-left pb-24">
      <ViewHeader title={t("radar_title")} subtitle={t("radar_subtitle")}>
        <div className="flex gap-4">
          <div className="w-64">
              <CustomDropdown
                value={scanScope}
                onChange={setScanScope}
                options={[
                  { id: "vault", label: "Entire Vault" },
                  { id: "active", label: "Equipped Only" },
                  ...playSets.map((s: any) => ({ id: s.name, label: `Blueprint: ${s.name}` }))
                ]}
              />

            </div>
          <div className="flex items-center gap-4 ml-auto">
            {ignoredPairs.length > 0 && (
              <button
                onClick={resetIgnored}
                className="px-6 py-4 bg-white/5 text-[var(--subtext)] opacity-80 font-black rounded-2xl hover:text-[var(--text)] hover:theme-bg-danger hover:theme-border-danger border border-white/10 transition-all uppercase tracking-widest text-[10px] shadow-lg"
              >
                Reset Ignored ({ignoredPairs.length})
              </button>
            )}
            <button
              onClick={runRadar}
              className="w-[220px] h-12 theme-btn-standard font-black text-[10px] rounded-2xl shadow-lg transition-all uppercase tracking-widest active:scale-95 flex items-center justify-center gap-3 shrink-0"
            >
              <span className={loading ? "animate-spin" : "animate-pulse"}>📡</span>
              {loading ? t("radar_btn_scanning") : t("radar_btn_sweep")}
            </button>
          </div>
        </div>
      </ViewHeader>

      {stats.packages > 0 && !error && (
        <div className="space-y-12">
          {/* STATS TILES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="theme-glass-inner p-8 rounded-[2.5rem] backdrop-blur-xl flex flex-col justify-center shadow-inner">
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2">{t("radar_stat_packages")}</p>
              <div className="text-5xl font-black text-[var(--text)] tracking-tighter">{stats.packages}</div>
            </div>
            <div className="theme-glass-inner p-8 rounded-[2.5rem] backdrop-blur-xl flex flex-col justify-center shadow-inner relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl rounded-full transition-colors duration-500 ${stats.totalClashes > 0 ? 'theme-bg-danger opacity-20' : 'theme-bg-success opacity-10'}`} />
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-2">{t("radar_stat_clashes")}</p>
              <div className={`text-5xl font-black tracking-tighter transition-colors duration-500 ${stats.totalClashes > 0 ? 'theme-text-danger' : 'theme-text-success'}`}>
                {stats.totalClashes}
              </div>
            </div>
          </div>

          {/* TIER 4: FATAL ERRORS */}
          {fatalConflicts.length > 0 && (
            <section className="space-y-6">
              <div className="flex flex-col gap-1 border-b theme-border-danger pb-4">
                <h2 className="text-2xl font-black theme-text-danger uppercase tracking-tighter italic flex items-center gap-3"><span className="text-3xl">🛑</span> {t("radar_tier4_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest ml-11">{t("radar_tier4_desc")}</p>
              </div>

              <div className="grid gap-4">
                {fatalConflicts.map((c: any) => (
                  <div key={c.mod_pair} className="theme-panel-danger border p-8 rounded-[2rem] space-y-6 animate-in slide-in-from-bottom-4 shadow-xl">
                    {c.is_ghost && (
                      <div className="px-5 py-3 theme-panel-warning border rounded-xl text-[11px] font-black tracking-wide flex items-center gap-3">
                        <span className="text-lg">👻</span> LOGICAL CLASH: {c.resolution_note}
                      </div>
                    )}
                    <div className="flex flex-col md:flex-row items-stretch gap-4">
                      <div className="flex-1 theme-glass-inner !shadow-none border border-white/5 p-5 rounded-2xl flex flex-col justify-between group hover:theme-border-danger transition-colors">
                        <span className="text-xs font-bold text-[var(--text)] truncate mb-4" title={c.modA}>{formatDisplayName(c.modA)}</span>
                        <button onClick={() => vaultSingleScript(c.modA)} className="w-full py-3 theme-panel-danger theme-btn-danger border text-[10px] font-black tracking-widest rounded-xl">{t("radar_tier4_btn")}</button>
                      </div>
                      <div className="flex items-center justify-center py-2 md:py-0">
                        <span className="text-xs font-black theme-text-danger opacity-50 uppercase tracking-widest px-4">VS</span>
                      </div>
                      <div className="flex-1 theme-glass-inner !shadow-none border border-white/5 p-5 rounded-2xl flex flex-col justify-between group hover:theme-border-danger transition-colors">
                        <span className="text-xs font-bold text-[var(--text)] truncate mb-4" title={c.modB}>{formatDisplayName(c.modB)}</span>
                        <button onClick={() => vaultSingleScript(c.modB)} className="w-full py-3 theme-panel-danger theme-btn-danger border text-[10px] font-black tracking-widest rounded-xl">{t("radar_tier4_btn")}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TIER 3: TUNING OVERLAPS */}
          {tuningConflicts.length > 0 && (
            <section className="space-y-6">
              <div className="flex flex-col gap-1 border-b theme-border-warning pb-4">
                <h2 className="text-2xl font-black theme-text-warning uppercase tracking-tighter italic flex items-center gap-3">{t("radar_tier3_title")}</h2>
                <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest ml-11">{t("radar_tier3_desc")}</p>
              </div>

              <div className="grid gap-4">
                {tuningConflicts.map((c: any) => {
                  const isResolving = resolvingScript === c.mod_pair;
                  return (
                    <div key={c.mod_pair} className="theme-panel-warning p-8 rounded-[2rem] transition-all shadow-lg border" style={{ color: "var(--text)" }}>
                      {c.is_ghost && (
                        <div className="mb-6 px-5 py-3 theme-panel-accent border rounded-xl text-[11px] font-black tracking-wide flex items-center gap-3">
                          <span className="text-lg">💡</span> ADVICE: {c.resolution_note}
                        </div>
                      )}
                      
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80" style={{ color: "var(--text)" }}>Signature Conflict</span>
                        <div className="flex w-full md:w-auto gap-3">
                          <button onClick={() => ignoreConflict(c.mod_pair)} className="flex-1 md:flex-none px-6 py-2.5 theme-btn-standard text-[10px] font-black tracking-widest rounded-xl px-6 py-2.5 transition-all">{t("radar_tier3_ignore")}</button>
                          <button onClick={() => setResolvingScript(isResolving ? null : c.mod_pair)} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${isResolving ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'theme-btn-standard border'}`}>{isResolving ? t("radar_tier3_cancel") : t("radar_tier3_resolve")}</button>
                        </div>
                      </div>

                      {!isResolving ? (
                        <div className="flex flex-col gap-2 font-mono text-xs text-[var(--subtext)] opacity-80 theme-glass-inner p-4 rounded-xl">
                          <p className="truncate" title={c.modA}>{c.modA}</p>
                          <div className="flex items-center gap-4 my-1 opacity-50">
                            <div className="h-px theme-bg-warning flex-1"></div>
                            <span className="text-[9px] font-black uppercase tracking-widest theme-text-warning">VS</span>
                            <div className="h-px theme-bg-warning flex-1"></div>
                          </div>
                          <p className="truncate" title={c.modB}>{c.modB}</p>
                        </div>
                      ) : (
                        <div className="theme-panel-success border p-8 rounded-2xl animate-in zoom-in-95 mt-4">
                          <p className="text-center text-[11px] font-black theme-text-success uppercase tracking-widest mb-6">Select the Artifact to Lead the Load Order</p>
                          <div className="flex flex-col md:flex-row gap-4">
                            <button onClick={() => applyOverride(c.modA, c.mod_pair)} className="flex-1 p-5 theme-glass-inner !shadow-none theme-border-success border theme-text-success font-bold rounded-xl theme-btn-success transition-all truncate group flex items-center justify-center gap-3">
                              <span className="text-xl group-hover:scale-125 transition-transform">👑</span> {formatDisplayName(c.modA)}
                            </button>
                            <button onClick={() => applyOverride(c.modB, c.mod_pair)} className="flex-1 p-5 theme-glass-inner !shadow-none theme-border-success border theme-text-success font-bold rounded-xl theme-btn-success transition-all truncate group flex items-center justify-center gap-3">
                              <span className="text-xl group-hover:scale-125 transition-transform">👑</span> {formatDisplayName(c.modB)}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* CLONE WARS */}
          {cloneConflicts.length > 0 && (
            <section className="theme-panel-danger border p-10 rounded-[2.5rem] shadow-xl space-y-8" style={{ color: "var(--text)" }}>
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b theme-border-accent pb-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-2xl font-black theme-text-danger uppercase tracking-tighter italic flex items-center gap-3"><span className="text-3xl">🧬</span> Duplicate Clones</h2>
                  <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest ml-11">Identical asset signatures. Purge redundant files.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => targetPattern(/nonhq/i)} className="px-5 py-2.5 theme-btn-standard text-[10px] font-black tracking-widest rounded-xl">+ TARGET NON-HQ</button>
                  <button onClick={() => targetPattern(/hq/i)} className="px-5 py-2.5 theme-btn-standard text-[10px] font-black tracking-widest rounded-xl">+ TARGET HQ</button>
                  <button onClick={() => setSelectedForVault([])} className="px-5 py-2.5 theme-btn-standard text-[10px] font-black tracking-widest rounded-xl px-6 py-2.5 transition-all">CLEAR SELECTION</button>
                </div>
              </div>

              {selectedForVault.length > 0 && (
                <div className="animate-in slide-in-from-top-2">
                  {!confirmMassVault ? (
                    <button onClick={() => setConfirmMassVault(true)} className="w-full py-6 theme-bg-danger text-[var(--text)] text-sm tracking-widest font-black rounded-2xl shadow-xl hover:opacity-90 hover:scale-[1.01] transition-all flex items-center justify-center gap-3">
                      <span className="text-2xl">🔥</span> SECURE {selectedForVault.length} TARGETS IN QUARANTINE
                    </button>
                  ) : (
                    <div className="flex flex-col md:flex-row gap-4 p-4 theme-panel-danger border rounded-2xl">
                      <button onClick={executeMassVault} className="flex-1 py-4 theme-bg-success text-[var(--bg)] text-xs tracking-widest font-black rounded-xl hover:opacity-90 transition-colors shadow-lg">CONFIRM PURGE</button>
                      <button onClick={() => setConfirmMassVault(false)} className="flex-1 py-4 theme-glass-inner !shadow-none text-gray-300 text-xs tracking-widest font-black rounded-xl border border-white/10 hover:text-[var(--text)] transition-colors">CANCEL</button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {cloneConflicts.map((c: any) => (
                  <div key={c.mod_pair} className="grid grid-cols-[1fr_auto_1fr] gap-4 theme-glass-inner !shadow-none p-4 rounded-2xl border border-white/5 items-center hover:theme-border-accent transition-colors">
                    <div onClick={() => toggleTarget(c.modA)} className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center ${selectedForVault.includes(c.modA) ? 'theme-panel-danger theme-border-danger shadow-inner' : 'bg-white/5 border-transparent text-[var(--subtext)] opacity-80 hover:bg-white/10'}`}>
                      <p className="text-[11px] font-mono truncate" title={c.modA}>{c.modA.split('/').pop()}</p>
                    </div>
                    <span className="text-[9px] font-black text-gray-600 px-2 uppercase tracking-widest">VS</span>
                    <div onClick={() => toggleTarget(c.modB)} className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center ${selectedForVault.includes(c.modB) ? 'theme-panel-danger theme-border-danger shadow-inner' : 'bg-white/5 border-transparent text-[var(--subtext)] opacity-80 hover:bg-white/10'}`}>
                      <p className="text-[11px] font-mono truncate" title={c.modB}>{c.modB.split('/').pop()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ℹ️ MINOR OVERLAPS (Soft Conflicts) */}
          {softConflicts.length > 0 && (
            <details className="group theme-glass-inner !shadow-none border border-white/10 p-6 rounded-3xl cursor-pointer transition-all hover:border-white/20 mb-8">
              <summary className="flex justify-between items-center list-none outline-none">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest group-open:text-[var(--text)] transition-colors flex items-center gap-3">
                    <span className="text-xl">ℹ️</span> Minor Overlaps ({softConflicts.length})
                  </h3>
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest ml-9">Usually safe textures or low-impact overrides</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--subtext)] opacity-60 group-open:rotate-180 transition-transform shrink-0">
                  ▼
                </div>
              </summary>
              <div className="flex flex-col gap-2 mt-6 pt-6 border-t border-white/5 animate-in slide-in-from-top-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {softConflicts.map((c: any) => (
                  <div key={c.mod_pair} className="flex justify-between items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors w-full">
                    <div className="flex items-center gap-3 flex-1 min-w-0 text-[10px] font-mono text-[var(--subtext)] opacity-80">
                      <span className="truncate flex-1 text-right" title={c.modA}>{c.modA.split('/').pop()}</span>
                      <span className="theme-text-accent opacity-50 font-black shrink-0">VS</span>
                      <span className="truncate flex-1 text-left" title={c.modB}>{c.modB.split('/').pop()}</span>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); ignoreConflict(c.mod_pair); }} className="shrink-0 px-4 py-2 theme-glass-inner !shadow-none text-[9px] font-black text-[var(--subtext)] opacity-60 rounded-lg border border-white/10 hover:text-[var(--text)] hover:border-white/30 transition-all">
                      IGNORE
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* SECTOR CLEAR */}
          {hasScanned && stats.totalClashes === 0 && !loading && (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-6 opacity-60">
              <div className="w-24 h-24 rounded-full theme-panel-success border flex items-center justify-center shadow-lg">
                <span className="text-5xl animate-pulse drop-shadow-md">✓</span>
              </div>
              <div>
                <h2 className="text-3xl font-black theme-text-success uppercase tracking-tighter mb-2">{t("radar_clear_title")}</h2>
                <p className="text-sm font-medium uppercase tracking-widest text-[var(--subtext)] opacity-80">{t("radar_clear_desc")}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EMPTY FOLDER STATE */}
      {hasScanned && stats.packages === 0 && !loading && !error && (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-6 opacity-60 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-24 h-24 rounded-full theme-panel-accent border flex items-center justify-center">
            <span className="text-5xl grayscale">📂</span>
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
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="theme-text-danger font-black uppercase tracking-widest mb-1 text-sm">Radar Malfunction</h3>
            <p className="theme-text-danger opacity-80 font-mono text-xs">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};