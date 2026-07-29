import { useState, useMemo } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, isVersionMatch, SidePanel, SidebarActionButton, getExtensionRegex } from "./shared";
import BlueprintMatrix from "./BlueprintMatrix";
import BlueprintArchitect from "./BlueprintArchitect";
import { GhostStringsModal } from "./side-panels/GhostStringsModal";
import { useStore } from "./store";

export default function Blueprints({
  playSets, setPlaySets, activeSetName, equipPlaySet, deletePlaySet, syncCode, setSyncCode, uploadBlueprintToCloud, syncBlueprintByCode, renamePlaySet,
  importPlaySet, setSnapshotModal, activePlaySetIndex, setActivePlaySetIndex, setView, exportPlaySet,
  setIsDraftingSet, isDraftingSet, draftSetName, setDraftSetName, finalizeDraftSet,
  toggleInActiveSet, globalSearchQuery, setGlobalSearchQuery, onSearchNetwork, cloudResults, isSearching, vaultPath, onRefreshMods, getMissingStrings, ignoreMissingString, purgeMissingString
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, modList, activeGameSchema } = useStore();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error" | "missing">("idle");
  const [ghostModalSet, setGhostModalSet] = useState<string | null>(null);
  const [ghostStrings, setGhostStrings] = useState<string[]>([]);

  const handleImport = async () => {
    const res = await importPlaySet();
    if (res) {
      setImportStatus(res);
      setTimeout(() => setImportStatus("idle"), 3000);
    }
  };

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);

  const optimizedModList = useMemo(() => {
    const map = new Map();
    const fallbackArr: any[] = [];
    (modList || []).forEach((m: any) => {
      map.set(m.name, m);
      const mBase = m.name?.split(/[\\/]/).pop()?.replace(extRegex, '');
      const mExt = m.name?.split('.').pop()?.toLowerCase();
      if (mBase && mExt) {
        fallbackArr.push({ ...m, _mBase: mBase, _mExt: mExt });
      }
    });
    return { map, fallbackArr };
  }, [modList, extRegex]);

  const localConflicts = useMemo(() => {
    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) return JSON.parse(stored);
    } catch (e) { }
    return [];
  }, []);

  const getBlueprintAlertCount = (set: any) => {
    let res = { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 };
    if (!set || !set.mods || !Array.isArray(set.mods) || set.mods.length === 0) return res;

    const activeMods = set.mods.map((rawMod: any) => {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      const exactMatch = optimizedModList.map.get(modName);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName, _cleanN: String(exactMatch.name || '').toUpperCase(), _cleanDisp: String(exactMatch.displayName || '').toUpperCase() };

      const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
      const targetExt = modName.split('.').pop()?.toLowerCase();

      const fallbackMatch = optimizedModList.fallbackArr.find((m: any) => m._mBase === targetBase && m._mExt === targetExt);
      if (fallbackMatch) return { ...fallbackMatch, _originalSetName: modName, _cleanN: String(fallbackMatch.name || '').toUpperCase(), _cleanDisp: String(fallbackMatch.displayName || '').toUpperCase() };

      return { name: modName, isFallback: true, _originalSetName: modName, _cleanN: '', _cleanDisp: '' };
    });

    for (const mod of activeMods) {
      if (mod.isFallback) continue;

      let isBroken = false;
      let isUnstable = false;
      let isMismatch = false;
      let isMissingDLC = false;

      if (typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken') isBroken = true;
      if (typeof mod.status === 'string' && mod.status.toLowerCase() === 'unstable') isUnstable = true;
      if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) isMismatch = true;
      if (mod.requiredDLC) {
        let rawDLC: string[] = [];
        if (typeof mod.requiredDLC === 'string') rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
        else if (Array.isArray(mod.requiredDLC)) rawDLC = [...mod.requiredDLC];
        const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
        const missing = rawDLC.filter(req => !activeDLC.includes(req.toUpperCase().trim()));
        if (missing.length > 0) isMissingDLC = true;
      }

      let hasAlert = false;
      if (isBroken || isMismatch || isMissingDLC) {
        res.broken++;
        hasAlert = true;
      } else if (isUnstable) {
        res.unstable++;
        hasAlert = true;
      }

      if (mod.conflicts && Array.isArray(mod.conflicts)) {
        for (const c of mod.conflicts) {
          const enemyActive = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            if (c.enemy_id && String(em.dbId) === String(c.enemy_id)) return true;
            if (c.enemy_name) {
              const targetClean = String(c.enemy_name).toUpperCase();
              if (em._cleanN.includes(targetClean) || em._cleanDisp.includes(targetClean)) return true;
            }
            return false;
          });
          if (enemyActive && mod.name && enemyActive.name && mod.name !== enemyActive.name) {
            hasAlert = true;
            if (c.severity_rank === 4) res.tier4++;
            else if (c.severity_rank === 3) res.tier3++;
            else res.broken++;
          }
        }
      }

      if (mod.compliance_tier === 4) {
        res.tier4++;
        hasAlert = true;
      } else if (mod.compliance_tier === 3) {
        res.tier3++;
        hasAlert = true;
      }

      if (hasAlert) res.total++;
    }

    localConflicts.forEach((lc: any) => {
      const targetA = String(lc.modA).toUpperCase();
      const targetB = String(lc.modB).toUpperCase();

      const modAMatch = activeMods.find((em: any) => {
        if (em.isFallback) return false;
        return em._cleanN.includes(targetA) || em._cleanDisp.includes(targetA) || targetA.includes(em._cleanN);
      });
      const modBMatch = activeMods.find((em: any) => {
        if (em.isFallback) return false;
        return em._cleanN.includes(targetB) || em._cleanDisp.includes(targetB) || targetB.includes(em._cleanN);
      });

      if (modAMatch && modBMatch && modAMatch.name !== modBMatch.name) {
        if (lc.severity_rank === 4) res.tier4++;
        else if (lc.severity_rank === 3) res.tier3++;
        else res.broken++;

        res.total++;
      }
    });

    return res;
  };

  const setComputations = useMemo(() => {
    const comps: Record<string, { alertStatus: any, hasGhosts: boolean }> = {};
    (playSets || []).forEach((set: any) => {
      const alertStatus = getBlueprintAlertCount(set);
      let hasGhosts = false;
      if (set && set.mods) {
        for (const rawMod of set.mods) {
          const modName = typeof rawMod === 'string' ? rawMod : (rawMod.name || rawMod.path || '');
          if (!modName) continue;
          if (!optimizedModList.map.has(modName)) {
            hasGhosts = true;
            break;
          }
        }
      }
      comps[set.name] = { alertStatus, hasGhosts };
    });
    return comps;
  }, [playSets, optimizedModList, localConflicts, extRegex, selectedVersion, ownedDLC, maskedDLC]);

  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [matrixPlaySet, setMatrixPlaySet] = useState<any>(null);
  const [editingSetName, setEditingSetName] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isArchitectOpen, setIsArchitectOpen] = useState(false);

  const handleOpenMatrix = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (targetSet) {
      setMatrixPlaySet(targetSet);
      setIsMatrixOpen(true);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <ViewHeader title={t("playsets_title")} subtitle={t("playsets_subtitle")} icon={t("icon_map")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30">
        <div className="flex flex-wrap gap-4 items-center justify-end">
          <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner ml-auto shrink-0">
            <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
              <span className="material-symbols-outlined text-xl normal-case">{t("icon_tune")}</span>
              <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_tools")}</span>
            </button>
          </div>
        </div>
      </ViewHeader>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-32">

        {isDraftingSet ? (
          <div className="theme-glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-8 rounded-[var(--radius)] flex flex-col gap-4 animate-in zoom-in-95 shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] h-full min-h-[18rem] justify-center relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={draftSetName}
              onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-xl text-[var(--text)] font-black outline-none text-center shadow-inner focus:border-[var(--accent)] transition-all z-10"
              placeholder={t("draft_placeholder")}
            />
            <div className="flex gap-3 mt-4 z-10">
              <button onClick={finalizeDraftSet} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_50%,transparent)] transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]">{t("auto_save")}</button>
              <button onClick={() => setIsDraftingSet && setIsDraftingSet(false)} className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:scale-105 transition-all">{t("nav_cancel")}</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsDraftingSet && setIsDraftingSet(true)}
            className="group cursor-pointer theme-glass-panel border-dashed border-2 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] rounded-[var(--radius)] flex flex-col items-center justify-center h-full min-h-[18rem] transition-all shadow-xl hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]"
          >
            <div className="w-20 h-20 rounded-[var(--radius)] theme-glass-inner flex items-center justify-center mb-6 group-hover:scale-110 transition-all group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] border border-white/5 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent)] group-hover:text-[var(--bg)]">
              <span className="material-symbols-outlined !text-4xl text-[var(--subtext)] opacity-60 group-hover:text-[var(--bg)] group-hover:opacity-100 transition-colors drop-shadow-md">{t("icon_add")}</span>
            </div>
            <p className="text-xs font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors">
              {t("draft_new")}
            </p>
          </div>
        )}

        {(playSets || []).map((set: any, idx: number) => {
          const { alertStatus, hasGhosts } = setComputations[set.name] || { alertStatus: { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 }, hasGhosts: false };

          return (
            <div key={set.name} className={`theme-glass-panel p-8 rounded-[var(--radius)] flex flex-col transition-all h-full min-h-[18rem] shadow-2xl relative overflow-hidden group/card ${activeSetName === set.name ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_40px_rgba(var(--success-rgb),0.1)] bg-[color-mix(in_srgb,var(--success)_2%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-[0_0_30px_rgba(255,255,255,0.02)] hover:bg-black/5'}`}>
              <div className={`absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500 opacity-0 group-hover/card:opacity-100 ${activeSetName === set.name ? 'from-[color-mix(in_srgb,var(--success)_5%,transparent)] to-transparent' : 'from-white/5 to-transparent'}`} />
              <div className="mb-8 relative group/title z-10 flex flex-col items-start gap-1">
                <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border mb-3 flex items-center gap-1.5 ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] shadow-[0_0_15px_rgba(var(--success-rgb),0.2)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                  <span className="material-symbols-outlined !text-[12px]">{activeSetName === set.name ? "check_circle" : "map"}</span>
                  {activeSetName === set.name ? t("btn_deployed") : t("playsets_title")}
                </div>
                {editingSetName === set.name ? (
                  <input
                    autoFocus
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                          renamePlaySet(set.name, newSetName.trim());
                        }
                        setEditingSetName(null);
                      } else if (e.key === 'Escape') {
                        setEditingSetName(null);
                      }
                    }}
                    onBlur={() => {
                      if (renamePlaySet && newSetName.trim() !== "" && newSetName !== set.name) {
                        renamePlaySet(set.name, newSetName.trim());
                      }
                      setEditingSetName(null);
                    }}
                    className="w-full bg-transparent border-b-2 border-[var(--accent)] px-0 py-0 text-3xl font-black text-[var(--text)] tracking-tighter outline-none mb-1 drop-shadow-md"
                  />
                ) : (
                  <div
                    className="flex items-center gap-3 cursor-pointer w-full group/editbtn"
                    onClick={() => {
                      setNewSetName(set.name);
                      setEditingSetName(set.name);
                    }}
                  >
                    <h3 className="text-3xl font-black text-[var(--text)] tracking-tighter truncate leading-normal pb-2 hover:text-[var(--accent)] transition-colors drop-shadow-md">{set.name}</h3>
                    <span className="material-symbols-outlined !text-lg opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--text)] drop-shadow-md ml-auto shrink-0">{t("icon_edit")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 tracking-widest uppercase flex items-center gap-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-2 py-1 rounded-md border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_extension")}</span> {(set.mods || []).map((m: any) => typeof m === 'string' ? m : (m?.name || '')).filter((modName: string) => modName && !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_")).length} {t("artifacts_linked")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-auto relative z-10">
                <button
                  onClick={() => equipPlaySet && equipPlaySet(set.name)}
                  className={`w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-3 ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]' : 'theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-md'}`}
                >
                  {activeSetName === set.name ? <span className="material-symbols-outlined !text-[18px]">{t("icon_verified_user")}</span> : <span className="material-symbols-outlined !text-[18px]">{t("icon_check_circle")}</span>}
                  {activeSetName === set.name ? t("btn_deployed") : t("playsets_btn_equip")}
                </button>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {(() => {
                    const hasAlerts = alertStatus && alertStatus.total > 0;

                    let alertBtnClass = 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]';
                    let alertLabel = t("bp_alert");

                    if (hasAlerts) {
                      if (alertStatus.tier4 > 0 || alertStatus.broken > 0) {
                        alertBtnClass = '!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] !bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)]';
                        alertLabel = `ALERTS (${alertStatus.total})`;
                      } else if (alertStatus.tier3 > 0 || alertStatus.unstable > 0) {
                        alertBtnClass = '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)]';
                        alertLabel = `ALERTS (${alertStatus.total})`;
                      } else {
                        alertBtnClass = '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)]';
                        alertLabel = `ALERTS (${alertStatus.total})`;
                      }
                    }

                    return (
                      <button
                        onClick={() => { if (setActivePlaySetIndex) setActivePlaySetIndex(idx); setIsArchitectOpen(true); }}
                        className={`py-3.5 px-4 theme-glass-inner border rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] ${alertBtnClass}`}
                      >
                        <span className="material-symbols-outlined !text-[16px] drop-shadow-md">
                          {hasAlerts ? (alertStatus.tier4 > 0 || alertStatus.broken > 0 ? "error" : "warning") : t("icon_warning_off")}
                        </span>
                        {alertLabel}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => handleOpenMatrix(set.name)}
                    className="py-3.5 px-4 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02]"
                  >
                    <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{t("icon_cloud")}</span> {t("action_uplink")}
                  </button>
                  <button
                    onClick={() => exportPlaySet && exportPlaySet(set.name)}
                    className="py-3.5 px-4 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-[1.02]"
                  >
                    <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{t("icon_upload")}</span> {t("action_export")}
                  </button>
                  <button
                    onClick={() => {
                      if (deleteConfirm === set.name) {
                        deletePlaySet && deletePlaySet(set.name);
                        setDeleteConfirm(null);
                      } else {
                        setDeleteConfirm(set.name);
                        setTimeout(() => setDeleteConfirm(null), 3000);
                      }
                    }}
                    className={`py-3.5 px-4 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest rounded-xl border hover:scale-[1.02] ${deleteConfirm === set.name ? "backdrop-blur-md bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_10px_30px_rgba(var(--danger-rgb),0.3)] scale-[1.05] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"}`}
                  >
                    <span className="material-symbols-outlined !text-[16px] drop-shadow-md">{deleteConfirm === set.name ? "warning" : t("icon_delete")}</span> {deleteConfirm === set.name ? t("btn_confirm") : t("purge")}
                  </button>
                  <button
                    onClick={() => {
                      const missingStrings = getMissingStrings ? getMissingStrings(set.name) : [];
                      if (missingStrings.length > 0) {
                        setGhostStrings(missingStrings);
                        setGhostModalSet(set.name);
                      } else {
                        window.dispatchEvent(new CustomEvent('push-status', { detail: { message: t("status_blueprint_clean") || "Blueprint is already fully sanitized.", type: "success" } }));
                      }
                    }}
                    className={`col-span-2 h-12 w-full mt-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-lg hover:scale-[1.02] active:scale-[0.98] ${hasGhosts ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] shadow-[0_0_15px_rgba(var(--warning-rgb),0.1)] hover:shadow-[0_0_20px_rgba(var(--warning-rgb),0.2)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'bg-black/20 hover:theme-bg-accent hover:text-white border-white/5 text-[var(--subtext)]/50'}`}
                  >
                    <span className="material-symbols-outlined !text-[16px]">cleaning_services</span>
                    {t("action_clean_blueprint") || 'Sanitize'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BlueprintMatrix
        isOpen={isMatrixOpen}
        onClose={() => setIsMatrixOpen(false)}
        playSet={matrixPlaySet}
        modList={modList}
        onUpdatePlaySet={(updatedSet: any) => {
          setMatrixPlaySet(updatedSet);
          const updatedSets = playSets.map((s: any) => s.name === updatedSet.name ? updatedSet : s);
          setPlaySets(updatedSets);

        }}
        onUpload={async (isPublic: boolean, isLocked: boolean, allowedMods: any[], isMarketListed: boolean) => {
          if (uploadBlueprintToCloud && matrixPlaySet) {
            return await uploadBlueprintToCloud(matrixPlaySet.name, isPublic, isLocked, allowedMods, isMarketListed);
          }
          return undefined;
        }}
      />

      <BlueprintArchitect
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        playSet={playSets[activePlaySetIndex]}
        modList={modList}
        toggleInActiveSet={toggleInActiveSet}
        allow_write={true}
        vaultPath={vaultPath}
        onRefreshMods={onRefreshMods}
        renamePlaySet={renamePlaySet}
      />

      <SidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        title={t("blueprint_tools_title")}
        subtitle={t("blueprint_tools_subtitle")}
        icon="tune"
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex flex-col gap-6">
          <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[20px]">{t("icon_cloud_sync")}</span>
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("sidebar_uplink")}</h3>
            </div>

            <div className="relative z-10 flex flex-col gap-4">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={syncCode || ""}
                  onChange={(e) => setSyncCode && setSyncCode(e.target.value)}
                  placeholder={t("sidebar_uplink_placeholder")}
                  className="flex-1 bg-black/20 border border-white/10 rounded-2xl px-6 h-14 text-sm font-black tracking-widest text-center text-[var(--accent)] placeholder:text-[var(--subtext)]/30 focus:border-[var(--accent)]/50 focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all shadow-inner outline-none"
                />
                <button
                  onClick={() => syncCode && syncBlueprintByCode && syncBlueprintByCode(syncCode)}
                  disabled={isSearching}
                  className="h-14 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shrink-0 border disabled:opacity-50 hover:scale-105 active:scale-95"
                >
                  {isSearching ? (
                    <span className="material-symbols-outlined !text-[18px] animate-spin">{t("icon_refresh")}</span>
                  ) : (
                    <span className="material-symbols-outlined !text-[18px]">{t("icon_cloud_download")}</span>
                  )}
                  {t("btn_sync")}
                </button>
              </div>
              <p className="text-[10px] font-bold text-[var(--subtext)] opacity-60 text-center px-4 leading-relaxed tracking-wide">{t("sidebar_uplink_desc")}</p>
            </div>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-[var(--radius)] p-6 shadow-lg relative overflow-hidden group/card">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
                <span className="material-symbols-outlined !text-[20px]">{t("icon_bolt")}</span>
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("sidebar_actions")}</h3>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              <SidebarActionButton
                id="IMPORT"
                icon={importStatus === "success" ? "check" : importStatus === "error" ? "alert-triangle" : "download"}
                label={importStatus === "success" ? t("status_profile_imported") : importStatus === "error" ? t("alert_import_failed") : t("playsets_btn_import")}
                subtext={t("import_desc")}
                onClick={handleImport}
                active={false}
                success={importStatus === "success"}
                danger={importStatus === "error"}
              />
              <SidebarActionButton id="SNAPSHOT" icon="camera" label={t("btn_snapshot")} subtext={t("snapshot_desc")} onClick={() => {
                const activeSet = playSets[activePlaySetIndex];
                if (!activeSet) return;
                let copyIndex = 1;
                let newName = `${activeSet.name} - Snapshot ${copyIndex}`;
                while (playSets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())) {
                  copyIndex++;
                  newName = `${activeSet.name} - Snapshot ${copyIndex}`;
                }
                const updatedSets = [...playSets, { name: newName, mods: [...activeSet.mods] }];
                setPlaySets(updatedSets);

                window.dispatchEvent(new Event("storage"));
                if (setActivePlaySetIndex) setActivePlaySetIndex(updatedSets.length - 1);
                setIsSidePanelOpen(false);
              }} active={false} />

              <SidebarActionButton
                id="SANITIZE"
                icon="cleaning_services"
                label={t("action_clean_blueprint") || "Sanitize"}
                subtext={t("clean_blueprint_desc") || "Clean missing artifacts"}
                onClick={() => {
                  const activeSet = playSets[activePlaySetIndex];
                  if (!activeSet) return;
                  const missingStrings = getMissingStrings ? getMissingStrings(activeSet.name) : [];
                  if (missingStrings.length > 0) {
                    setGhostStrings(missingStrings);
                    setGhostModalSet(activeSet.name);
                    setIsSidePanelOpen(false);
                  } else {
                    window.dispatchEvent(new CustomEvent('push-status', { detail: { message: t("status_blueprint_clean") || "Blueprint is already fully sanitized.", type: "success" } }));
                  }
                }}
                active={false}
                disabled={!playSets[activePlaySetIndex]}
              />
            </div>
          </div>
        </div>
      </SidePanel>

      {ghostModalSet && ghostStrings.length > 0 && (
        <GhostStringsModal
          setName={ghostModalSet}
          ghosts={ghostStrings}
          onClose={() => {
            setGhostModalSet(null);
            setGhostStrings([]);
          }}
          onIgnore={(mod: string) => {
            if (ignoreMissingString) ignoreMissingString(ghostModalSet, mod);
            setGhostStrings(prev => prev.filter(s => s !== mod));
            if (ghostStrings.length <= 1) setGhostModalSet(null);
          }}
          onPurge={(mod: string) => {
            if (purgeMissingString) purgeMissingString(ghostModalSet, mod);
            setGhostStrings(prev => prev.filter(s => s !== mod));
            if (ghostStrings.length <= 1) setGhostModalSet(null);
          }}
          onSearch={(url: string) => {
            if (onSearchNetwork) onSearchNetwork(url);
            else window.open(url, '_blank');
          }}
        />
      )}
    </div>
  );
}
