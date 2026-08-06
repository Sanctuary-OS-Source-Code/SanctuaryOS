import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, isVersionMatch, SidePanel, SidebarActionButton, getExtensionRegex, FilterTabs, FilterTabButton, HubTabButton, DashboardStatTile, ActionButton, HoverTooltip } from "./shared";
import { CommandScreenLayout, CommandScreenStats, CommandScreenBody, CommandScreenMain, CommandScreenSidebar, CommandScreenQuickLink, CommandScreenSectionHeading } from "./hub-components/SharedCommandScreenLayout";
import BlueprintMatrix from "./BlueprintMatrix";
import BlueprintArchitect from "./BlueprintArchitect";
import { GhostStringsModal } from "./side-panels/GhostStringsModal";
import { useStore } from "./store";
import { useModalStore } from "./store/modalStore";

export default function Blueprints({
  playSets, setPlaySets, activeSetName, equipPlaySet, deletePlaySet, syncCode, setSyncCode, uploadBlueprintToCloud, syncBlueprintByCode, renamePlaySet,
  importPlaySet, setSnapshotModal, activePlaySetIndex, setActivePlaySetIndex, setView, exportPlaySet,
  setIsDraftingSet, isDraftingSet, draftSetName, setDraftSetName, finalizeDraftSet,
  toggleInActiveSet, globalSearchQuery, setGlobalSearchQuery, onSearchNetwork, cloudResults, isSearching, vaultPath, onRefreshMods, getMissingStrings, ignoreMissingString, purgeMissingString
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, modList, activeGameSchema } = useStore();
  const setIsBlueprintSwapOpen = useModalStore((state: any) => state.setIsBlueprintSwapOpen);
  const [activeTab, setActiveTab] = useState("LANDING");
  const [selectedUplinkBlueprint, setSelectedUplinkBlueprint] = useState<any>(null);
  const [pinnedBlueprints, setPinnedBlueprints] = useState<string[]>(() => {
    try { const p = localStorage.getItem('myPinnedBlueprints'); return p ? JSON.parse(p) : []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('myPinnedBlueprints', JSON.stringify(pinnedBlueprints)); }, [pinnedBlueprints]);
  const togglePin = (name: string) => setPinnedBlueprints(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error" | "missing">("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncInputVisible, setSyncInputVisible] = useState(false);
  const [localSyncCode, setLocalSyncCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
      const [ghostModalSet, setGhostModalSet] = useState<string | null>(null);
  const [ghostStrings, setGhostStrings] = useState<string[]>([]);

  const [myCloudBlueprints, setMyCloudBlueprints] = useState<any[]>([]);
  const [cloudFilterTab, setCloudFilterTab] = useState<'all' | 'not_in_vault'>('all');
  const [cloudSearchQuery, setCloudSearchQuery] = useState("");

  useEffect(() => {
    if (activeTab === "NETWORK") {
      const session = useStore.getState().session;
      if (session?.user?.id) {
        supabase.from('masons')
          .select('id')
          .eq('profile_id', session.user.id)
          .maybeSingle()
          .then(({ data: masonData }) => {
            if (masonData?.id) {
              supabase.from('blueprints')
                .select('name, code, created_at, artifacts')
                .eq('mason_id', masonData.id)
                .order('created_at', { ascending: false })
                .then(({ data }) => setMyCloudBlueprints(data || []));
            } else {
              setMyCloudBlueprints([]);
            }
          });
      }
    }
  }, [activeTab]);

  const handleSync = async () => {
    if (syncCode && syncBlueprintByCode) {
      setIsSyncing(true);
      await syncBlueprintByCode(syncCode);
      setIsSyncing(false);
    }
  };

  const handleImport = async () => {
    setImportStatus("loading");
    const res = await importPlaySet();
    if (res) {
      setImportStatus(res);
      setTimeout(() => setImportStatus("idle"), 3000);
    } else {
      setImportStatus("idle");
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
              const targetClean = String(c.enemy_name).replace(/\.[^/.]+$/i, "").toUpperCase();
              if (em._cleanN.includes(targetClean) || em._cleanDisp.includes(targetClean)) return true;
            }
            return false;
          });
          if (enemyActive && mod.name && enemyActive.name && mod.name !== enemyActive.name) {
            hasAlert = true;
            if (c.severity_rank == 4) res.tier4++;
            else if (c.severity_rank == 3) res.tier3++;
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
        if (lc.severity_rank == 4) res.tier4++;
        else if (lc.severity_rank == 3) res.tier3++;
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
  const [cleanConfirm, setCleanConfirm] = useState<string | null>(null);
  const [isArchitectOpen, setIsArchitectOpen] = useState(false);

  const handleOpenMatrix = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (targetSet) {
      setMatrixPlaySet(targetSet);
      setIsMatrixOpen(true);
    }
  };

  const totalAlerts = Object.values(setComputations).reduce((acc: number, comp: any) => acc + (comp.alertStatus?.total || 0) + (comp.hasGhosts ? 1 : 0), 0);


  const renderVaultCard = (set: any) => {
    const { alertStatus, hasGhosts } = setComputations[set.name] || { alertStatus: { total: 0, tier4: 0, tier3: 0, broken: 0, unstable: 0 }, hasGhosts: false };
    const isPinned = pinnedBlueprints.includes(set.name);
    const hasAlerts = alertStatus && alertStatus.total > 0;
    return (
      <div key={set.name} className={`theme-glass-panel p-5 rounded-[var(--radius)] flex flex-col transition-all min-h-[14rem] shadow-xl relative overflow-hidden group/card ${activeSetName === set.name ? 'border-[var(--success)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-[0_0_30px_rgba(255,255,255,0.02)] hover:bg-black/5'}`} style={activeSetName === set.name ? { backgroundColor: 'color-mix(in srgb, var(--success) 10%, transparent)', boxShadow: '0 0 40px color-mix(in srgb, var(--success) 15%, transparent)' } : {}}>
                  <div className={`absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500 opacity-0 group-hover/card:opacity-100 ${activeSetName === set.name ? 'from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-transparent' : 'from-white/5 to-transparent'}`} />

                  <button onClick={() => togglePin(set.name)} className={`absolute top-5 right-5 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPinned ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] opacity-100' : 'text-[var(--subtext)] opacity-0 group-hover/card:opacity-50 hover:!opacity-100 bg-black/20 hover:bg-black/40'}`}>
                    <span className="material-symbols-outlined !text-[16px]">keep</span>
                    <HoverTooltip title={isPinned ? (t("action_unpin") || "Unpin Blueprint") : (t("action_pin") || "Pin Blueprint")} />
                  </button>

                  <div className="mb-4 relative group/title z-10 flex flex-col items-start gap-1 pr-10">
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
                        className="w-full bg-transparent border-b-2 border-[var(--accent)] px-0 py-0 text-2xl font-black text-[var(--text)] tracking-tighter outline-none mb-1 drop-shadow-md"
                      />
                    ) : (
                      <div
                        className="flex items-center gap-2 cursor-pointer w-full group/editbtn"
                        onClick={() => {
                          setNewSetName(set.name);
                          setEditingSetName(set.name);
                        }}
                      >
                        <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter truncate leading-normal hover:text-[var(--accent)] transition-colors drop-shadow-md">{set.name}</h3>
                        <span className="material-symbols-outlined !text-sm opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--text)] drop-shadow-md shrink-0">{t("icon_edit")}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex">
                        <button 
                          className="flex items-center gap-1.5 py-0.5 px-0 mt-1 text-[var(--subtext)] hover:text-[var(--text)] transition-all w-max group/link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUplinkBlueprint({ name: set.name, code: "LOCAL BLUEPRINT", artifacts: set.mods });
                          }}
                        >
                          <span className="material-symbols-outlined !text-[12px] opacity-60 group-hover/link:opacity-100 group-hover/link:text-[var(--accent)]">extension</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60 group-hover/link:opacity-100">
                            {(set.mods || []).map((m: any) => typeof m === 'string' ? m : (m?.name || '')).filter((modName: string) => modName && !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_")).length} {t("artifacts_linked") || "ARTIFACTS LINKED"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-auto relative z-10 pt-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => equipPlaySet && equipPlaySet(set.name)}
                        className={`flex-1 h-[38px] rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 relative ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]' : 'theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-sm hover:scale-[1.02]'}`}
                      >
                        {activeSetName === set.name ? <span className="material-symbols-outlined !text-[16px]">{t("icon_verified_user")}</span> : <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span>}
                        {activeSetName === set.name ? t("btn_deployed") : t("playsets_btn_equip")}
                        <HoverTooltip title={activeSetName === set.name ? (t("status_deployed") || "Deployed") : (t("action_equip") || "Equip Blueprint")} />
                      </button>

                      <button
                        onClick={() => { if (setActivePlaySetIndex) setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name)); setIsArchitectOpen(true); }}
                        className={`h-[38px] px-4 theme-glass-inner border rounded-xl transition-all flex items-center justify-center gap-2 relative hover:scale-[1.05] font-black uppercase text-[10px] tracking-widest ${hasAlerts ? (alertStatus.tier4 > 0 || alertStatus.broken > 0 ? '!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] !text-[var(--danger)] !bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:!border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_20%,transparent)]' : '!border-[color-mix(in_srgb,var(--warning)_30%,transparent)] !text-[var(--warning)] !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_20%,transparent)]') : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">{hasAlerts ? (alertStatus.tier4 > 0 || alertStatus.broken > 0 ? "error" : "warning") : "tune"}</span>
                        <HoverTooltip title={hasAlerts ? `${alertStatus.total} Alerts` : (t("action_architect") || "Architect")} />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => handleOpenMatrix(set.name)}
                        className="h-9 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center hover:scale-105 relative"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_cloud")}</span>
                        <HoverTooltip title={t("action_uplink") || "Uplink"} />
                      </button>
                      <button
                        onClick={() => exportPlaySet && exportPlaySet(set.name)}
                        className="h-9 theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] transition-all flex items-center justify-center hover:scale-105 relative"
                      >
                        <span className="material-symbols-outlined !text-[16px]">{t("icon_upload")}</span>
                        <HoverTooltip title={t("action_export") || "Export"} />
                      </button>
                      <button
                        onClick={() => {
                          const missingStrings = getMissingStrings ? getMissingStrings(set.name) : [];
                          if (missingStrings.length > 0) {
                            setGhostStrings(missingStrings);
                            setGhostModalSet(set.name);
                          } else {
                            setCleanConfirm(set.name);
                            setTimeout(() => setCleanConfirm(null), 2000);
                            window.dispatchEvent(new CustomEvent('push-status', { detail: { message: t("status_blueprint_clean") || "Blueprint is already fully sanitized.", type: "success" } }));
                          }
                        }}
                        className={`h-9 rounded-xl transition-all flex items-center justify-center border hover:scale-[1.05] relative ${cleanConfirm === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]' : (hasGhosts ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[var(--warning)] shadow-[0_0_15px_rgba(var(--warning-rgb),0.1)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'bg-black/20 hover:theme-bg-accent hover:text-white border-white/5 text-[var(--subtext)]/40 hover:text-[var(--subtext)]')}`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">{cleanConfirm === set.name ? 'check_circle' : 'cleaning_services'}</span>
                        <HoverTooltip title={cleanConfirm === set.name ? (t("btn_clean_success") || "Cleaned") : (t("action_clean_blueprint") || "Clean Blueprint")} />
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
                        className={`h-9 transition-all flex items-center justify-center rounded-xl border hover:scale-[1.05] relative ${deleteConfirm === set.name ? "backdrop-blur-md bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_5px_15px_rgba(var(--danger-rgb),0.3)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] opacity-60 hover:opacity-100"}`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">{deleteConfirm === set.name ? "warning" : t("icon_delete")}</span>
                        <HoverTooltip title={deleteConfirm === set.name ? (t("btn_confirm") || "Confirm Purge") : (t("purge") || "Purge")} />
                      </button>
                    </div>
                  </div>
                </div>
    );
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full">
      <ViewHeader title={t("playsets_title")} subtitle={t("playsets_subtitle")} icon={t("icon_map")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" shape="circle" />

      <div className="flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500 w-full mb-6 shrink-0">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full shrink-0">
          <HubTabButton id="LANDING" icon="dashboard" label={t("tab_landing") || "LANDING"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="VAULT" icon="map" label={t("playsets_title") || "VAULT"} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="NETWORK" icon="cloud" label={t("btn_my_cloud_blueprints") || "NETWORK"} activeTab={activeTab} setTab={setActiveTab} iconColorClass="text-sky-500" />
        </div>
      </div>

      {activeTab === "LANDING" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">{t("icon_check_circle")}</span>}
                number={activeSetName || t("status_unknown")}
                label={t("btn_deployed") || "Deployed Blueprint"}
                colorClass="border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                onClick={() => setIsBlueprintSwapOpen(true)}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">{t("icon_map")}</span>}
                number={playSets?.length || 0}
                label={t("playsets_title") || "Vault Blueprints"}
                colorClass="border-indigo-500/30 text-indigo-500 hover:border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 cursor-pointer"
                onClick={() => setActiveTab("VAULT")}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">{t("icon_cloud")}</span>}
                number={myCloudBlueprints.length}
                label={t("my_cloud_blueprints_title") || "Cloud Blueprints"}
                colorClass="border-sky-500/30 text-sky-500 hover:border-sky-500 bg-sky-500/10 hover:bg-sky-500/20 cursor-pointer"
                onClick={() => setActiveTab("NETWORK")}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined !text-4xl">{totalAlerts > 0 ? "error" : "check_circle"}</span>}
                number={totalAlerts}
                label={t("system_alerts_title") || "System Alerts"}
                colorClass={totalAlerts > 0 ? "border-rose-500/30 text-rose-500 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer" : "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"}
                onClick={() => setActiveTab("VAULT")}
              />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading 
                    title={t("pinned_blueprints") || "PINNED BLUEPRINTS"} 
                    icon="keep"
                  />

                  {pinnedBlueprints.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                      {playSets.filter((s: any) => pinnedBlueprints.includes(s.name)).map((set: any) => renderVaultCard(set))}
                    </div>
                  ) : (
                    <div className="text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] opacity-50 text-center py-10 border border-white/5 border-dashed rounded-[var(--radius)] h-full flex items-center justify-center min-h-[9rem] theme-glass-panel">
                      {t("no_pinned_blueprints") || "NO PINNED BLUEPRINTS"}
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions") || "QUICK ACTIONS"} icon="bolt">
                <CommandScreenQuickLink
                  icon="add_circle"
                  title={t("draft_new") || "DRAFT NEW BLUEPRINT"}
                  subtitle={"Create a new blueprint"}
                  onClick={() => { setActiveTab("VAULT"); setIsDraftingSet(true); }}
                  dotColorClass="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                  textColorClass="text-emerald-500"
                  hoverTextColorClass="group-hover:text-emerald-400"
                  iconShadowClass="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  iconBorderHoverClass="group-hover:border-emerald-500/30"
                />
                <CommandScreenQuickLink
                  icon={importStatus === "loading" ? "sync" : "download"}
                  title={importStatus === "loading" ? t("btn_importing") : importStatus === "success" ? t("status_profile_imported") : importStatus === "error" ? t("alert_import_failed") : (t("playsets_btn_import") || "IMPORT BLUEPRINT")}
                  subtitle={t("import_desc") || "Import from file"}
                  onClick={handleImport}
                  dotColorClass="bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                  textColorClass="text-blue-500"
                  hoverTextColorClass="group-hover:text-blue-400"
                  iconShadowClass="drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  iconBorderHoverClass="group-hover:border-blue-500/30"
                />
                {syncInputVisible ? (
                  <div className="w-full p-6 theme-glass-panel border border-[var(--accent)]/50 rounded-[var(--radius)] shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] relative overflow-hidden h-24 text-left group animate-in fade-in zoom-in-95 duration-200">
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 via-transparent to-transparent opacity-100" />
                  <div className="flex items-center gap-5 h-full relative z-10 w-full">
                    <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 border-[var(--accent)]/50 text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] bg-[var(--accent)]/10">
                      <span className="material-symbols-outlined !text-3xl drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">cloud_download</span>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 w-full justify-center">
                      <div className="flex items-center justify-between w-full border-b border-[var(--accent)]/30 pb-1">
                        <input 
                          autoFocus
                          value={localSyncCode}
                          onChange={e => setLocalSyncCode(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && localSyncCode.trim()) {
                              if (setSyncCode) setSyncCode(localSyncCode.trim());
                              if (syncBlueprintByCode) {
                                setIsSyncing(true);
                                syncBlueprintByCode(localSyncCode.trim()).finally(() => setIsSyncing(false));
                              }
                              setLocalSyncCode("");
                              setSyncInputVisible(false);
                            }
                          }}
                          placeholder={t("sidebar_uplink_placeholder") || "ENTER CODE..."}
                          className="bg-transparent border-none outline-none w-full text-[11px] font-black uppercase tracking-widest text-[var(--accent)] placeholder:text-[var(--accent)]/40"
                        />
                        <button onClick={() => setSyncInputVisible(false)} className="text-[var(--subtext)] hover:text-white ml-2 transition-colors shrink-0">
                          <span className="material-symbols-outlined !text-[14px]">close</span>
                        </button>
                      </div>
                      <span className="text-[8px] uppercase font-bold opacity-80 tracking-widest text-[var(--accent)] mt-1.5 flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[10px]">keyboard_return</span>
                        {t("press_enter_to_sync") || "PRESS ENTER TO SYNC"}
                      </span>
                    </div>
                  </div>
                </div>
                ) : (
                  <CommandScreenQuickLink
                    icon={isSyncing ? "sync" : "cloud_sync"}
                    title={isSyncing ? t("btn_importing") : (t("btn_sync") || "SYNC UPLINK")}
                    subtitle={t("sync_desc") || "Sync with cloud code"}
                    onClick={() => setSyncInputVisible(true)}
                    dotColorClass="bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"
                    textColorClass="text-sky-500"
                    hoverTextColorClass="group-hover:text-sky-400"
                    iconShadowClass="drop-shadow-[0_0_8px_rgba(14,165,233,0.5)]"
                    iconBorderHoverClass="group-hover:border-sky-500/30"
                  />
                )}
                <CommandScreenQuickLink
                  icon="camera"
                  title={t("btn_snapshot") || "SNAPSHOT ACTIVE"}
                  subtitle={t("snapshot_desc") || "Clone current active blueprint"}
                  onClick={() => {
                    const activeSet = playSets[activePlaySetIndex];
                    if (!activeSet) return;
                    let copyIndex = 1;
                    let newName = `${activeSet.name} (Copy)`;
                    while (playSets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())) {
                      newName = `${activeSet.name} (Copy) (${copyIndex})`;
                      copyIndex++;
                    }
                    const updatedSets = [...playSets, { name: newName, mods: [...activeSet.mods] }];
                    setPlaySets(updatedSets);
                    window.dispatchEvent(new Event("storage"));
                    if (setActivePlaySetIndex) setActivePlaySetIndex(updatedSets.length - 1);
                    setActiveTab("VAULT");
                  }}
                  dotColorClass="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                  textColorClass="text-amber-500"
                  hoverTextColorClass="group-hover:text-amber-400"
                  iconShadowClass="drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  iconBorderHoverClass="group-hover:border-amber-500/30"
                />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      )}

      {activeTab === "VAULT" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <div className="flex items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full">
            <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
              <div className="w-12 h-12 rounded-full theme-glass-panel border border-indigo-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-indigo-500 opacity-90 drop-shadow-lg">map</span>
              </div>
              <span className="truncate">{t("playsets_title") || "VAULT"}</span>
            </h2>

            <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">
              <div className="relative flex-1 h-12 min-w-[200px] max-w-[350px]">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
                <input
                  type="text"
                  placeholder={t("nav_search") || "Search Vault..."}
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                />
                {vaultSearchQuery && (
                  <button onClick={() => setVaultSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                    <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                  </button>
                )}
              </div>
              <button 
                onClick={() => setIsDraftingSet && setIsDraftingSet(true)}
                className="h-12 px-5 rounded-2xl theme-glass-inner border border-[var(--accent)]/30 text-[var(--accent)] font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[var(--accent)]/10 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] shrink-0"
              >
                <span className="material-symbols-outlined !text-[18px]">add</span>
                {t("draft_new") || "NEW BLUEPRINT"}
              </button>


              
            </div>
          </div>

          

          
            
<div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-12">
            {isDraftingSet && (
              <div className="theme-glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-6 rounded-[var(--radius)] flex flex-col gap-4 animate-in zoom-in-95 shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] relative overflow-hidden bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] min-h-[14rem] justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={draftSetName}
                  onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xl text-[var(--text)] font-black outline-none shadow-inner focus:border-[var(--accent)] transition-all z-10 text-center"
                  placeholder={t("draft_placeholder") || "Blueprint Name..."}
                  onKeyDown={e => {
                    if (e.key === 'Enter') finalizeDraftSet();
                  }}
                />
                <div className="flex gap-3 mt-2 z-10">
                  <button onClick={finalizeDraftSet} className="flex-1 py-3 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-[1.02] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]">{t("auto_save") || "SAVE"}</button>
                  <button onClick={() => setIsDraftingSet && setIsDraftingSet(false)} className="w-16 py-3 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] font-black rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:scale-[1.02] transition-all"><span className="material-symbols-outlined !text-[18px]">close</span></button>
                </div>
              </div>
            )}

            {(playSets || []).filter((s: any) => !vaultSearchQuery || s.name.toLowerCase().includes(vaultSearchQuery.toLowerCase())).map((set: any) => renderVaultCard(set))}
          </div>
        </div>
      )}

      {activeTab === "NETWORK" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-32">
          <div className="flex items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full">
            <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl theme-glass-panel border border-sky-500/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[24px] text-sky-500 opacity-90 drop-shadow-lg">cloud</span>
              </div>
              <span className="truncate">{t("btn_my_cloud_blueprints") || "NETWORK"}</span>
            </h2>

            <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">
              <div className="relative flex-1 h-12 min-w-[200px] max-w-[350px]">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 !text-sm">{t("icon_search")}</span>
                <input
                  type="text"
                  placeholder={t("nav_search") || "Search Uplink Codes..."}
                  value={cloudSearchQuery}
                  onChange={(e) => setCloudSearchQuery(e.target.value)}
                  className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                />
                {cloudSearchQuery && (
                  <button onClick={() => setCloudSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors">
                    <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                  </button>
                )}
              </div>

              <div className="w-max min-w-[250px] shrink-0 h-12">
                <FilterTabs className="w-full h-full text-xs">
                  <FilterTabButton id="all" label={t("blueprint_tab_all") || "ALL"} activeTab={cloudFilterTab} setTab={setCloudFilterTab} className="flex-1" />
                  <FilterTabButton id="not_in_vault" label={t("blueprint_tab_missing") || "MISSING"} activeTab={cloudFilterTab} setTab={setCloudFilterTab} className="flex-1" />
                </FilterTabs>
              </div>
              
            </div>
          </div>

          
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 h-full pt-1">
            
            {myCloudBlueprints.length === 0 ? (
              <div className="text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] opacity-50 text-center py-10 border border-white/5 border-dashed rounded-xl col-span-full theme-glass-panel">
                <span className="material-symbols-outlined !text-4xl block mb-2 opacity-50">cloud_off</span>
                {t("no_cloud_blueprints") || "NO CLOUD BLUEPRINTS FOUND"}
              </div>
            ) : (
              myCloudBlueprints.filter(bp => {
                const inVault = playSets.some((set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase());
                const matchesSearch = !cloudSearchQuery || bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) || bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                return (cloudFilterTab === 'all' ? true : !inVault) && matchesSearch;
              }).length === 0 ? (
                <div className="text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] opacity-50 text-center py-10 border border-white/5 border-dashed rounded-xl col-span-full theme-glass-panel">
                  <span className="material-symbols-outlined !text-4xl block mb-2 opacity-50">task_alt</span>
                  {t("no_cloud_blueprints") || "NO MATCHING BLUEPRINTS"}
                </div>
              ) : (
                myCloudBlueprints.filter(bp => {
                  const inVault = playSets.some((set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase());
                  const matchesSearch = !cloudSearchQuery || bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) || bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                  return (cloudFilterTab === 'all' ? true : !inVault) && matchesSearch;
                }).map((bp, i) => {
                  const inVault = playSets.some((set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase());
                  return (
                    <div
                      key={bp.code}
                      className={`flex flex-col items-start gap-4 p-6 rounded-2xl theme-glass-panel border transition-all text-left group/btn animate-in slide-in-from-bottom-2 duration-500 fill-mode-both shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] min-h-[14rem] relative overflow-hidden ${inVault ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_2%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_2%,transparent)]'}`}
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-500 opacity-0 group-hover/btn:opacity-100 pointer-events-none ${inVault ? 'from-[color-mix(in_srgb,var(--success)_5%,transparent)] to-transparent' : 'from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent'}`} />

                      <div className="flex flex-row items-start justify-between w-full gap-2 relative z-10">
                        <span className={`text-xl font-black truncate transition-colors ${inVault ? 'text-[var(--text)]' : 'text-[var(--text)] group-hover/btn:text-[var(--accent)]'}`}>{bp.name}</span>
                        {inVault ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] rounded-lg shrink-0 mt-0.5 shadow-sm">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">check_circle</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--success)]">{t("status_in_vault") || "IN VAULT"}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--subtext)_10%,transparent)] border border-[color-mix(in_srgb,var(--subtext)_20%,transparent)] rounded-lg shrink-0 mt-0.5 shadow-sm group-hover/btn:border-[var(--accent)]/50 group-hover/btn:bg-[var(--accent)]/10 transition-colors">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-60 group-hover/btn:text-[var(--accent)] group-hover/btn:opacity-100">cloud_download</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-80 group-hover/btn:text-[var(--accent)] group-hover/btn:opacity-100">{t("status_not_in_vault") || "SYNC NOW"}</span>
                          </div>
                        )}
                      </div>

                      {bp.artifacts && bp.artifacts.length > 0 && (
                        <div className="mt-4 flex items-center">
                          <button 
                            className="flex items-center gap-1.5 text-[var(--subtext)] hover:text-[var(--text)] transition-all w-max group/link"
                            onClick={() => setSelectedUplinkBlueprint(bp)}
                          >
                            <span className="material-symbols-outlined !text-[14px] opacity-60 group-hover/link:opacity-100 group-hover/link:text-[var(--accent)]">extension</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60 group-hover/link:opacity-100">
                              {bp.artifacts.length} {t("artifacts_linked") || "ARTIFACTS LINKED"}
                            </span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between w-full mt-auto relative z-10 pt-4">
                        <div 
                          className="group/code flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            navigator.clipboard.writeText(bp.code).catch(()=>{});
                            setCopiedCode(bp.code);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                        >
                          {copiedCode === bp.code ? (
                            <>
                              <span className="text-sm font-black tracking-[0.2em] uppercase text-emerald-500">{t("copied") || "COPIED"}</span>
                              <span className="material-symbols-outlined !text-[14px] text-emerald-500">check</span>
                            </>
                          ) : (
                            <>
                              <span className={`text-sm font-black tracking-[0.2em] uppercase ${inVault ? 'text-[var(--success)]' : 'text-[var(--accent)]'}`}>{bp.code}</span>
                              <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-0 group-hover/code:opacity-100 transition-opacity">content_copy</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-[var(--subtext)] opacity-50 tracking-widest flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[14px]">event</span> {new Date(bp.created_at).toLocaleDateString()}
                          </span>
                          {!inVault && (
                            <button
                              onClick={() => {
                                if (setSyncCode) setSyncCode(bp.code);
                                if (syncBlueprintByCode) {
                                  setIsSyncing(true);
                                  syncBlueprintByCode(bp.code).finally(() => setIsSyncing(false));
                                }
                              }}
                              className="w-8 h-8 rounded-full theme-glass-inner text-[var(--text)] border border-[var(--accent)]/30 hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] flex items-center justify-center hover:scale-110 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] relative"
                            >
                              <span className="material-symbols-outlined !text-[16px]">download</span>
                              <HoverTooltip title={t("action_sync") || "Sync Blueprint"} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )
            )}
          </div>
        </div>
      )}

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
    
      <SidePanel 
        isOpen={!!selectedUplinkBlueprint} 
        onClose={() => setSelectedUplinkBlueprint(null)} 
        title={selectedUplinkBlueprint?.name || "Blueprint Mods"} 
        subtitle={selectedUplinkBlueprint?.code || "Uplink Code"} 
        icon="extension" 
        iconColorClass="theme-text-accent"
      >
        <div className="overflow-y-auto custom-scrollbar h-full w-full absolute inset-0 pb-10"><div className="flex flex-col gap-2 p-6 min-h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-widest">{t("artifacts_linked") || "ARTIFACTS LINKED"} ({selectedUplinkBlueprint?.artifacts?.length})</h3>
          </div>
          {selectedUplinkBlueprint?.artifacts?.map((m: any, idx: number) => {
            const rawName = m.name || m;
            const displayName = typeof rawName === 'string' ? (rawName.split('/').pop()?.replace(/\.[^/.]+$/, "") || rawName) : rawName;
            return (
              <div key={idx} className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 rounded-xl p-3 hover:border-[var(--accent)]/30 transition-colors group/mod">
                <div className="w-8 h-8 rounded-lg theme-glass-inner flex items-center justify-center shrink-0 border border-white/5 group-hover/mod:border-[var(--accent)]/30 transition-colors">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] group-hover/mod:text-[var(--accent)] transition-colors">extension</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-black text-[var(--text)] truncate">{displayName}</span>
                  {m.author && <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-0.5">{t("mason") || "CREATOR"}: {m.author}</span>}
                </div>
              </div>
            );
          })}
        </div></div></SidePanel>
    </div>
  );
}