import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { ActionButton, CustomDropdown, ModSearchDropdown, ViewHeader, FilterTabs, FilterTabButton, standardButtonClass, standardAccentGlassButtonClass, getExtensionRegex, formatDisplayName, SearchBar, ScreenUtilityBar, SidePanel, isVersionMatch, SidebarActionButton, HoverTabDrawer, VerticalTabButton, DashboardStatTile, HoverTooltip } from "./shared";
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
  const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
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
  const [uplinkArtifactSearch, setUplinkArtifactSearch] = useState("");

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
   <div key={set.name} className={`glass-panel p-6 rounded-3xl flex flex-col transition-all min-h-[14rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] relative group/card ${activeSetName === set.name ? 'border-[var(--success)] shadow-[0_20px_50px_rgba(var(--success-rgb),0.1)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-[0_30px_60px_rgba(var(--accent-rgb),0.1)]'}`} style={activeSetName === set.name ? { backgroundColor: 'color-mix(in srgb, var(--success) 10%, transparent)' } : {}}>
        <div className={`absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500 opacity-0 group-hover/card:opacity-100 ${activeSetName === set.name ? 'from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-transparent' : 'from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent'}`} />

        <button onClick={() => togglePin(set.name)} className={`absolute top-6 right-6 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md ${isPinned ? 'text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] opacity-100 shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]' : 'text-[var(--subtext)] opacity-0 group-hover/card:opacity-50 hover:!opacity-100 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)]'}`}>
          <span className="material-symbols-outlined !text-[18px]">keep</span>
          <HoverTooltip title={isPinned ? (t("action_unpin")) : (t("action_pin"))} />
        </button>

        <div className="mb-4 relative group/title z-10 flex flex-col items-start gap-1 pr-14">
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
              className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-2 rounded-xl text-xl font-black text-[var(--text)] tracking-tighter outline-none mb-1 shadow-inner focus:border-[var(--accent)] transition-colors"
            />
          ) : (
            <div
              className="flex items-center gap-2 cursor-pointer w-full group/editbtn"
              onClick={() => {
                setNewSetName(set.name);
                setEditingSetName(set.name);
              }}
            >
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter truncate leading-tight hover:text-[var(--accent)] transition-colors drop-shadow-md">{set.name}</h3>
              <span className="material-symbols-outlined !text-sm opacity-0 group-hover/editbtn:opacity-100 transition-opacity text-[var(--subtext)] hover:text-[var(--accent)] drop-shadow-md shrink-0 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1.5 rounded-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{t("icon_edit")}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all w-max group/link shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUplinkBlueprint({ name: set.name, code: "LOCAL BLUEPRINT", artifacts: set.mods });
              }}
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] opacity-80 group-hover/link:opacity-100">extension</span>
              <span className="text-[9px] font-black capitalize tracking-[0.2em] opacity-80 group-hover/link:opacity-100">
                {(set.mods || []).map((m: any) => typeof m === 'string' ? m : (m?.name || '')).filter((modName: string) => modName && !modName.startsWith("FOLDER_") && !modName.startsWith("SET_") && !modName.startsWith("LOCAL_SET_")).length} {t("artifacts_linked")}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-auto relative z-10 pt-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => equipPlaySet && equipPlaySet(set.name)}
              className={`flex-1 h-12 rounded-xl font-black text-[11px] tracking-widest capitalize transition-all flex items-center justify-center gap-2 relative shadow-lg hover:scale-[1.02] active:scale-95 ${activeSetName === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] backdrop-blur-md shadow-[0_10px_30px_rgba(var(--success-rgb),0.2)]' : 'glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)]'}`}
            >
              {activeSetName === set.name ? <span className="material-symbols-outlined !text-[18px] drop-shadow-md">verified_user</span> : <span className="material-symbols-outlined !text-[18px]">play_circle</span>}
              {activeSetName === set.name ? t("btn_deployed") : t("playsets_btn_equip")}
              <HoverTooltip title={activeSetName === set.name ? (t("status_deployed")) : (t("action_equip"))} />
            </button>

            <button
              onClick={() => { if (setActivePlaySetIndex) setActivePlaySetIndex(playSets.findIndex((s: any) => s.name === set.name)); setIsArchitectOpen(true); }}
              className={`h-12 px-6 glass-surface border rounded-xl transition-all flex items-center justify-center gap-2 relative hover:scale-[1.05] active:scale-95 font-black capitalize text-[11px] tracking-widest shadow-lg ${hasAlerts ? (alertStatus.tier4 > 0 || alertStatus.broken > 0 ? '!border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)] !bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:!border-[color-mix(in_srgb,var(--danger)_60%,transparent)] shadow-[0_10px_30px_rgba(var(--danger-rgb),0.2)]' : '!border-[color-mix(in_srgb,var(--warning)_40%,transparent)] !text-[var(--warning)] !bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] hover:!bg-[color-mix(in_srgb,var(--warning)_25%,transparent)] hover:!border-[color-mix(in_srgb,var(--warning)_60%,transparent)] shadow-[0_10px_30px_rgba(var(--warning-rgb),0.2)]') : 'border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{hasAlerts ? (alertStatus.tier4 > 0 || alertStatus.broken > 0 ? "error" : "warning") : "tune"}</span>
              <HoverTooltip title={hasAlerts ? `${alertStatus.total} Alerts` : (t("action_architect"))} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-2 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
            <button
              onClick={() => handleOpenMatrix(set.name)}
              className="h-10 glass-surface border border-transparent text-[var(--subtext)] hover:text-[var(--accent)] rounded-xl hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.15)] transition-all flex items-center justify-center hover:scale-105 active:scale-95 relative"
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_cloud")}</span>
              <HoverTooltip title={t("action_uplink")} />
            </button>
            <button
              onClick={() => exportPlaySet && exportPlaySet(set.name)}
              className="h-10 glass-surface border border-transparent text-[var(--subtext)] hover:text-[var(--accent)] rounded-xl hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.15)] transition-all flex items-center justify-center hover:scale-105 active:scale-95 relative"
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_upload")}</span>
              <HoverTooltip title={t("action_export")} />
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
                  window.dispatchEvent(new CustomEvent('push-status', { detail: { message: t("status_blueprint_clean"), type: "success" } }));
                }
              }}
              className={`h-10 rounded-xl transition-all flex items-center justify-center border hover:scale-105 active:scale-95 relative ${cleanConfirm === set.name ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] shadow-[0_0_20px_rgba(var(--success-rgb),0.3)]' : (hasGhosts ? 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] shadow-[0_0_20px_rgba(var(--warning-rgb),0.3)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)]' : 'bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.15)]')}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{cleanConfirm === set.name ? 'check_circle' : 'cleaning_services'}</span>
              <HoverTooltip title={cleanConfirm === set.name ? (t("btn_clean_success")) : (t("action_clean_blueprint"))} />
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
              className={`h-10 transition-all flex items-center justify-center rounded-xl border hover:scale-105 active:scale-95 relative ${deleteConfirm === set.name ? "backdrop-blur-md bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_0_20px_rgba(var(--danger-rgb),0.4)] text-[var(--danger)]" : "bg-transparent border-transparent text-[color-mix(in_srgb,var(--danger)_60%,transparent)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:shadow-[0_0_15px_rgba(var(--danger-rgb),0.15)]"}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{deleteConfirm === set.name ? "warning" : t("icon_delete")}</span>
              <HoverTooltip title={deleteConfirm === set.name ? (t("btn_confirm")) : (t("purge"))} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32 w-full">
      <ViewHeader
        title={t("playsets_title")}
        subtitle={t("playsets_subtitle")}
        icon={t("icon_map")}
        iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
        shape="circle"
        breadcrumb={activeTab !== "LANDING" ? (t(`tab_${activeTab.toLowerCase()}`) || activeTab) : undefined}
        onTitleClick={() => setActiveTab("LANDING")}
      />

      <HoverTabDrawer title="Blueprint Navigation" activeTab={activeTab} setTab={setActiveTab}>
        <VerticalTabButton id="LANDING" icon="dashboard" label={t("tab_landing")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="ALL" icon="map" label={t("playsets_all")} activeTab={activeTab} setTab={setActiveTab} />
        <VerticalTabButton id="NETWORK" icon="cloud" label={t("btn_my_cloud_blueprints")} activeTab={activeTab} setTab={setActiveTab} iconColorClass="text-sky-500" />
      </HoverTabDrawer>

      {activeTab === "LANDING" && (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 flex-1 min-h-[400px]">
          <CommandScreenLayout>
            <CommandScreenStats>
              <DashboardStatTile
                icon={<span className="material-symbols-outlined">{t("icon_check_circle")}</span>}
                number={activeSetName || t("status_unknown")}
                label={t("btn_deployed")}
                colorClass="text-emerald-500 cursor-pointer"
                onClick={() => setIsBlueprintSwapOpen(true)}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined">{t("icon_map")}</span>}
                number={playSets?.length || 0}
                label={t("playsets_title")}
                colorClass="text-indigo-500 cursor-pointer"
                onClick={() => setActiveTab("VAULT")}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined">{t("icon_cloud")}</span>}
                number={myCloudBlueprints.length}
                label={t("my_cloud_blueprints_title")}
                colorClass="text-sky-500 cursor-pointer"
                onClick={() => setActiveTab("NETWORK")}
              />
              <DashboardStatTile
                icon={<span className="material-symbols-outlined">{totalAlerts > 0 ? "error" : "check_circle"}</span>}
                number={totalAlerts}
                label={t("system_alerts_title")}
                colorClass={totalAlerts > 0 ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-rose-500 hover:border-rose-500 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] cursor-pointer" : "border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-emerald-500 hover:border-emerald-500 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] cursor-pointer"}
                onClick={() => setActiveTab("VAULT")}
              />
            </CommandScreenStats>

            <CommandScreenBody>
              <CommandScreenMain>
                <div className="flex flex-col gap-6 w-full">
                  <CommandScreenSectionHeading
                    title={t("pinned_blueprints")}
                    icon="keep"
                  />

                  {pinnedBlueprints.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
                      {playSets.filter((s: any) => pinnedBlueprints.includes(s.name)).map((set: any) => renderVaultCard(set))}
                    </div>
                  ) : (
                    <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-[var(--radius)] h-full flex items-center justify-center min-h-[9rem] glass-panel">
                      {t("no_pinned_blueprints")}
                    </div>
                  )}
                </div>
              </CommandScreenMain>

              <CommandScreenSidebar title={t("quick_actions")} icon="bolt">
                <CommandScreenQuickLink
                  icon="add_circle"
                  title={t("draft_new")}
                  subtitle={"Create a new blueprint"}
                  onClick={() => { setActiveTab("VAULT"); setIsDraftingSet(true); }}
                  dotColorClass="bg-emerald-500 shadow-md"
                  textColorClass="text-emerald-500"
                  hoverTextColorClass="group-hover:text-emerald-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
                />
                <CommandScreenQuickLink
                  icon={importStatus === "loading" ? "sync" : "download"}
                  title={importStatus === "loading" ? t("btn_importing") : importStatus === "success" ? t("status_profile_imported") : importStatus === "error" ? t("alert_import_failed") : (t("playsets_btn_import"))}
                  subtitle={t("import_desc")}
                  onClick={handleImport}
                  dotColorClass="bg-blue-500 shadow-md"
                  textColorClass="text-blue-500"
                  hoverTextColorClass="group-hover:text-blue-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                />
                {syncInputVisible ? (
         <div className="w-full p-6 glass-panel border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] rounded-[var(--radius)] shadow-[0_0_40px_rgba(var(--accent-rgb),0.1)] relative h-24 text-left group animate-in fade-in zoom-in-95 duration-200">
                    <div className="absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_10%,transparent)] via-transparent to-transparent opacity-100" />
                    <div className="flex items-center gap-5 h-full relative z-10 w-full">
                      <div className="w-12 h-12 rounded-xl glass-surface border flex items-center justify-center shrink-0 border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
                        <span className="material-symbols-outlined !text-3xl drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">cloud_download</span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 w-full justify-center">
                        <div className="flex items-center justify-start w-full border-b border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pb-1">
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
                            placeholder={t("sidebar_uplink_placeholder")}
                            className="bg-transparent border-none outline-none w-full text-[11px] font-black capitalize tracking-widest text-[var(--accent)] placeholder:text-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          />
                          <button onClick={() => setSyncInputVisible(false)} className="text-[var(--subtext)] hover:text-white ml-2 transition-colors shrink-0">
                            <span className="material-symbols-outlined !text-[14px]">close</span>
                          </button>
                        </div>
                        <span className="text-[8px] capitalize font-bold opacity-80 tracking-widest text-[var(--accent)] mt-1.5 flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[10px]">keyboard_return</span>
                          {t("press_enter_to_sync")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CommandScreenQuickLink
                    icon={isSyncing ? "sync" : "cloud_sync"}
                    title={isSyncing ? t("btn_importing") : (t("btn_sync"))}
                    subtitle={t("sync_desc")}
                    onClick={() => setSyncInputVisible(true)}
                    dotColorClass="bg-sky-500 shadow-md"
                    textColorClass="text-sky-500"
                    hoverTextColorClass="group-hover:text-sky-400"
                    iconShadowClass="drop-shadow-md"
                    iconBorderHoverClass="group-hover:border-sky-500/30"
                  />
                )}
                <CommandScreenQuickLink
                  icon="camera"
                  title={t("btn_snapshot")}
                  subtitle={t("snapshot_desc")}
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
                  dotColorClass="bg-amber-500 shadow-md"
                  textColorClass="text-amber-500"
                  hoverTextColorClass="group-hover:text-amber-400"
                  iconShadowClass="drop-shadow-md"
                  iconBorderHoverClass="group-hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                />
              </CommandScreenSidebar>
            </CommandScreenBody>
          </CommandScreenLayout>
        </div>
      )}

      {activeTab === "VAULT" && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
          <ScreenUtilityBar
            search={vaultSearchQuery}
            onSearchChange={(val: string) => setVaultSearchQuery(val)}
            searchPlaceholder={(t("nav_search")) as string}
            className="!mb-6"
          >
              <button
                onClick={() => setIsDraftingSet && setIsDraftingSet(true)}
                className="h-12 px-5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] font-black capitalize tracking-widest text-xs flex items-center gap-2 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] shrink-0"
              >
                <span className="material-symbols-outlined !text-[18px]">add</span>
                {t("draft_new")}
              </button>
          </ScreenUtilityBar>





          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-12">
            {isDraftingSet && (
       <div className="glass-panel border-[color-mix(in_srgb,var(--accent)_30%,transparent)] p-6 rounded-[var(--radius)] flex flex-col gap-4 animate-in zoom-in-95 shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] relative bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] min-h-[14rem] justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={draftSetName}
                  onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)}
                  className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl p-4 text-xl text-[var(--text)] font-black outline-none shadow-inner focus:border-[var(--accent)] transition-all z-10 text-center"
                  placeholder={t("draft_placeholder")}
                  onKeyDown={e => {
                    if (e.key === 'Enter') finalizeDraftSet();
                  }}
                />
                <div className="flex gap-3 mt-2 z-10">
                  <button onClick={finalizeDraftSet} className="flex-1 py-3 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md font-black capitalize tracking-widest text-[10px] rounded-xl hover:scale-[1.02] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]">{t("auto_save")}</button>
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
          <ScreenUtilityBar
            search={cloudSearchQuery}
            onSearchChange={(val: string) => setCloudSearchQuery(val)}
            searchPlaceholder={(t("nav_search")) as string}
            className="!mb-6"
          >
              <div className="w-max min-w-[250px] shrink-0 h-12">
                <FilterTabs className="w-full h-full text-xs">
                  <FilterTabButton id="all" label={t("blueprint_tab_all")} activeTab={cloudFilterTab} setTab={setCloudFilterTab} className="flex-1" />
                  <FilterTabButton id="not_in_vault" label={t("blueprint_tab_missing")} activeTab={cloudFilterTab} setTab={setCloudFilterTab} className="flex-1" />
                </FilterTabs>
              </div>
          </ScreenUtilityBar>


          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 h-full pt-1">

            {myCloudBlueprints.length === 0 ? (
              <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-xl col-span-full glass-panel">
                <span className="material-symbols-outlined block mb-2 opacity-50">cloud_off</span>
                {t("no_cloud_blueprints")}
              </div>
            ) : (
              myCloudBlueprints.filter(bp => {
                const inVault = playSets.some((set: any) => set.code && set.code.toUpperCase() === bp.code.toUpperCase());
                const matchesSearch = !cloudSearchQuery || bp.name.toLowerCase().includes(cloudSearchQuery.toLowerCase()) || bp.code.toLowerCase().includes(cloudSearchQuery.toLowerCase());
                return (cloudFilterTab === 'all' ? true : !inVault) && matchesSearch;
              }).length === 0 ? (
                <div className="text-[10px] font-black tracking-widest capitalize text-[var(--subtext)] opacity-50 text-center py-10 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] border-dashed rounded-xl col-span-full glass-panel">
                  <span className="material-symbols-outlined block mb-2 opacity-50">task_alt</span>
                  {t("no_cloud_blueprints")}
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
           className={`flex flex-col items-start gap-4 p-6 rounded-3xl glass-panel border transition-all text-left group/btn animate-in slide-in-from-bottom-2 duration-500 fill-mode-both shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:shadow-[0_30px_60px_rgba(var(--accent-rgb),0.1)] min-h-[14rem] relative ${inVault ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)] shadow-[0_20px_50px_rgba(var(--success-rgb),0.1)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)]'}`}
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-500 opacity-0 group-hover/btn:opacity-100 pointer-events-none ${inVault ? 'from-[color-mix(in_srgb,var(--success)_15%,transparent)] to-transparent' : 'from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent'}`} />

                      <div className="flex flex-row items-start justify-start w-full gap-2 relative z-10">
                        <span className={`text-2xl font-black tracking-tighter truncate transition-colors drop-shadow-md ${inVault ? 'text-[var(--text)]' : 'text-[var(--text)] group-hover/btn:text-[var(--accent)]'}`}>{bp.name}</span>
                        {inVault ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] rounded-lg shrink-0 shadow-sm shadow-[0_0_15px_rgba(var(--success-rgb),0.2)]">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--success)] drop-shadow-md">verified_user</span>
                            <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[var(--success)]">{t("status_in_vault")}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,var(--subtext)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-lg shrink-0 shadow-sm group-hover/btn:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] group-hover/btn:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-60 group-hover/btn:text-[var(--accent)] group-hover/btn:opacity-100">cloud_download</span>
                            <span className="text-[9px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-80 group-hover/btn:text-[var(--accent)] group-hover/btn:opacity-100">{t("status_not_in_vault")}</span>
                          </div>
                        )}
                      </div>

                      {bp.artifacts && bp.artifacts.length > 0 && (
                        <div className="mt-2 flex items-center relative z-10">
                          <button
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all w-max group/link shadow-sm"
                            onClick={() => setSelectedUplinkBlueprint(bp)}
                          >
                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] opacity-80 group-hover/link:opacity-100">extension</span>
                            <span className="text-[9px] font-black capitalize tracking-[0.2em] opacity-80 group-hover/link:opacity-100">
                              {bp.artifacts.length} {t("artifacts_linked")}
                            </span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-start w-full mt-auto relative z-10 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                        <div
                          className="group/code flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity px-4 py-2 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          onClick={() => {
                            navigator.clipboard.writeText(bp.code).catch(() => { });
                            setCopiedCode(bp.code);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                        >
                          {copiedCode === bp.code ? (
                            <>
                              <span className="text-sm font-black tracking-[0.2em] capitalize text-emerald-500">{t("copied")}</span>
                              <span className="material-symbols-outlined !text-[14px] text-emerald-500">check</span>
                            </>
                          ) : (
                            <>
                              <span className={`text-sm font-black tracking-[0.2em] capitalize ${inVault ? 'text-[var(--success)]' : 'text-[var(--text)] group-hover/code:text-[var(--accent)]'}`}>{bp.code}</span>
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
                              className="w-8 h-8 rounded-full glass-surface text-[var(--text)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[var(--accent)] flex items-center justify-center hover:scale-110 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] relative"
                            >
                              <span className="material-symbols-outlined !text-[16px]">download</span>
                              <HoverTooltip title={t("action_sync")} />
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
        onClose={() => {
          setSelectedUplinkBlueprint(null);
          setUplinkArtifactSearch("");
        }}
        title={selectedUplinkBlueprint?.name || "Blueprint Mods"}
        subtitle={selectedUplinkBlueprint?.code || "Uplink Code"}
        icon="extension"
        iconColorClass="theme-text-accent"
      >
        <div className="flex flex-col min-h-full gap-4 pb-4">
          <div className="flex items-center justify-start mb-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-3">
            <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-widest">{t("artifacts_linked")} ({selectedUplinkBlueprint?.artifacts?.length})</h3>
          </div>
          <SearchBar
            value={uplinkArtifactSearch}
            onChange={setUplinkArtifactSearch}
            placeholder={t("playsets_search_ph")}
            className="!h-12 !rounded-2xl"
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
            {selectedUplinkBlueprint?.artifacts?.filter((m: any) => {
              const rawName = m.name || m;
              const displayName = typeof rawName === 'string' ? (rawName.split('/').pop()?.replace(/\.[^/.]+$/, "") || rawName) : rawName;
              return displayName.toLowerCase().includes(uplinkArtifactSearch.toLowerCase());
            }).map((m: any, idx: number) => {
              const rawName = m.name || m;
              const displayName = typeof rawName === 'string' ? (rawName.split('/').pop()?.replace(/\.[^/.]+$/, "") || rawName) : rawName;
              return (
                <div key={idx} className="glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] p-4 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors group/mod flex flex-col items-center justify-center text-center gap-3 shadow-sm aspect-square">
                  <div className="w-12 h-12 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[24px] text-[var(--subtext)] group-hover/mod:text-[var(--accent)] transition-colors">extension</span>
                  </div>
                  <div className="flex flex-col min-w-0 w-full items-center justify-center">
                    <span className="text-xs font-bold text-[var(--text)] group-hover/mod:theme-text-accent transition-colors line-clamp-2" title={displayName}>{displayName}</span>
                    {m.author && <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest mt-1 line-clamp-1 truncate w-full">{t("mason")}: {m.author}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div></SidePanel>
    </div>
  );
}
