import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, CustomDropdown, formatDisplayName, isVersionMatch, getHighestVersion, getLowestVersion, mapDlcCode, HubTabButton, standardButtonClass, standardDangerButtonClass, standardSuccessButtonClass, SidePanel, SidebarActionButton, getFileLabel, isSupportedExtension, getExtensionRegex, HoverTooltip, EmptyState, cleanSearchName } from "./shared";
import { useLexicon } from './LexiconContext';
import { invoke } from '@tauri-apps/api/core';
import { ModCard } from './ModCard';
import { useStore } from './store';
import { VaultToolsSidePanel, VaultLocalFolderEditorSidePanel } from './side-panels/VaultSidePanels';
import ConflictResolutionSidebar from "./side-panels/ConflictResolutionSidebar";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { supabase } from "./supabase";
const Vault = React.memo(function Vault(props: any) {
  const [isSidePanelOpen, setIsSidePanelOpen] = React.useState(false);
  const [activeTier3Conflict, setActiveTier3Conflict] = React.useState<any>(null);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const { applyConflictOverride } = usePlaySetLogic();
  const {
    isBulkMode, setIsBulkMode, selectedMods, setSelectedMods, setConfirmDialog,
    setStatus, runRadarSweep, setIsDropzoneOpen, setLocalFolderModal, playSets,
    equipFilter, setEquipFilter, searchQuery, setSearchQuery, filterStatus,
    setFilterStatus, activeCategory, setActiveCategory, activeSubType, setActiveSubType,
    visibleMods, displayModList, activePlaySetIndex, toggleInActiveSet,
    openUrl, setLocalFolderName, setLocalFolderType, executeHotSwap, equipPlaySet, setMetaNameInput,
    setMetaAuthorInput, setMetaVersionInput, setMetaUrlInput, setActiveDossier, setDrawerConfirmHash,
    quarantineList, restoreMod, purgeMod, ownedDLC, maskedDLC, setMetaDescInput,
    setMetaImageInput, setMetaAllowWriteInput, expandedFolder, setExpandedFolder,
    drawerConfirmHash,
    modList,
    anarchyRules,
    setBulkModal
  } = props;
  const { t } = useLexicon();
  const selectedVersion = useStore((state) => state.selectedVersion);

  const [archiveVersionFilter, setArchiveVersionFilter] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [hideGhostCards, setHideGhostCards] = React.useState(false);
  const [purgeTargetFiles, setPurgeTargetFiles] = React.useState<string[] | null>(null);
  const [activeLocalFolder, setActiveLocalFolder] = React.useState<string>("");
  const [isLocalFolderEditorOpen, setIsLocalFolderEditorOpen] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [renameFolderInput, setRenameFolderInput] = React.useState("");
  const itemsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [equipFilter, activeCategory, activeSubType, searchQuery, filterStatus, isBulkMode]);

  const activeSetModsMemo = React.useMemo(() => {
    return playSets[activePlaySetIndex]?.mods || [];
  }, [playSets, activePlaySetIndex]);

  const equippedDisplayMods = React.useMemo(() => {
    return displayModList.filter((m: any) => {
      const isNormal = activeSetModsMemo.includes(m.name);
      if (isNormal) return true;
      return activeSetModsMemo.some((sm: string) =>
        sm.replace(/^(sanctuary[/\\])+/i, '') === m.name
      );
    });
  }, [displayModList, activeSetModsMemo]);

  const virtualFolderIds = React.useMemo(() => {
    const ids = new Set<string>();
    displayModList.forEach((v: any) => {
      if (v.isVirtual && v.dbId) {
        ids.add(String(v.dbId));
      }
    });
    return ids;
  }, [displayModList]);

  const localConflictsMemo = React.useMemo(() => {
    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((lc: any) => ({
          ...lc,
          modAUpper: String(lc.modA || lc.mod_a || "").toUpperCase(),
          modBUpper: String(lc.modB || lc.mod_b || "").toUpperCase()
        }));
      }
    } catch (e) { }
    return [];
  }, []);

  const uppercaseEquippedMods = React.useMemo(() => {
    return equippedDisplayMods.map((mData: any) => {
      const nameRaw = String(mData.name || "").toUpperCase();
      return {
        mData,
        emClean: nameRaw,
        emBaseClean: nameRaw.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/i, "") || nameRaw,
        emDisp: String(mData.displayName || "").toUpperCase()
      };
    });
  }, [equippedDisplayMods]);

  const modListIndex = React.useMemo(() => {
    const byDbId = new Map();
    const byHash = new Map();
    const byInterchangeableId = new Map();
    const byName = new Map();
    const namesAndDisplayNames: { name: string, displayNameUpper: string, displayNameSpaced: string, orig: any, hash: string }[] = [];

    let hasMcCmdPkg = false;
    let hasMcCmdScript = false;

    modList.forEach((ml: any) => {
      if (!ml.isVirtual) {
        if (ml.dbId) byDbId.set(String(ml.dbId), ml);
        if (ml.hash) byHash.set(ml.hash, ml);
        if (ml.name) byName.set(ml.name, ml);
        if (ml.interchangeableIds) {
          ml.interchangeableIds.forEach((id: string) => {
            byInterchangeableId.set(String(id), ml);
          });
        }

        const dn = ml.displayName || "";
        namesAndDisplayNames.push({
          name: ml.name || "",
          displayNameUpper: dn.toUpperCase(),
          displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
          hash: ml.hash,
          orig: ml
        });
      }

      if (ml.name?.toLowerCase().includes("mc_cmd_center")) {
        if (ml.name.toLowerCase().endsWith(".package")) hasMcCmdPkg = true;
        if (ml.name.toLowerCase().endsWith(".ts4script")) hasMcCmdScript = true;
      }
    });

    return { byDbId, byHash, byInterchangeableId, byName, namesAndDisplayNames, mcCmdCenter: { hasPkg: hasMcCmdPkg, hasScript: hasMcCmdScript } };
  }, [modList]);


  const finalVisibleMods = React.useMemo(() => {
    const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
    const extRegex = getExtensionRegex(activeGameSchema);

    const parsedActiveSetMods = activeSetMods.map((n: string) => {
      const cleanNLookup = n.replace(/^(sanctuary[/\\])+/i, '');
      const mData = modListIndex.byName.get(cleanNLookup) || modListIndex.namesAndDisplayNames.find((ne: any) => ne.name === cleanNLookup)?.orig;
      const cleanN = n.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();
      return { n, cleanNLookup, cleanN, mData };
    });

    return visibleMods.filter((mod: any) => {
      let modGameVersions: string[] = [];
      if (mod.isVirtual) {
        modGameVersions = Array.from(new Set((mod.flavors || []).flatMap((f: any) => {
          const v = f.compatible_versions;
          if (!v) return [];
          if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
          return Array.isArray(v) ? v : [];
        }))).filter(Boolean) as string[];
      } else {
        const v = mod.compatible_versions;
        if (typeof v === 'string') {
          modGameVersions = v.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else {
          modGameVersions = Array.isArray(v) ? v : [];
        }
      }

      let isCompatibleWithOS = true;
      if (selectedVersion && selectedVersion !== "") {
        isCompatibleWithOS = isVersionMatch(modGameVersions, selectedVersion);
      }

      if (hideGhostCards) {
        if (!isCompatibleWithOS) return false;
        if (mod.isGhosted) return false;
        if (mod.missingReqs && mod.missingReqs.length > 0) return false;

        let isBroken = false;
        const checkBroken = (mObj: any) => {
          let broken = typeof mObj.status === 'string' && mObj.status.toLowerCase() === 'broken';
          if (broken && mObj.compatible_versions && mObj.compatible_versions.length > 0 && selectedVersion) {
            if (selectedVersion !== getHighestVersion(typeof mObj.compatible_versions === 'string' ? mObj.compatible_versions.split(',').map((s: string) => s.trim()) : mObj.compatible_versions)) {
              broken = false;
            }
          }
          return broken;
        };

        if (mod.isVirtual && mod.flavors) {
          if (mod.flavors.length > 0 && mod.flavors.every(checkBroken)) isBroken = true;
        } else {
          isBroken = checkBroken(mod);
        }

        if (isBroken) return false;

        let hasTier4Conflict = false;

        const checkConflictsFilter = (mObj: any) => {
          if (mObj.conflicts && mObj.conflicts.length > 0) {
            const hasConflict = mObj.conflicts.some((c: any) => {
              if (c.severity_rank != 4) return false;
              return parsedActiveSetMods.some(({ cleanNLookup, cleanN, mData }: any) => {
                if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                if (c.enemy_name) {
                  const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase();
                  if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                }
                return false;
              });
            });
            if (hasConflict) hasTier4Conflict = true;
          }
        };

        checkConflictsFilter(mod);
        if (mod.isVirtual && mod.flavors) {
          mod.flavors.forEach(checkConflictsFilter);
        }

        if (hasTier4Conflict) return false;

        let rawDLC: string[] = [];
        if (mod.requiredDLC) {
          if (typeof mod.requiredDLC === 'string') rawDLC.push(...mod.requiredDLC.split(',').map((s: string) => s.trim()));
          else if (Array.isArray(mod.requiredDLC)) rawDLC.push(...mod.requiredDLC);
        }
        if (mod.flavors) {
          mod.flavors.forEach((f: any) => {
            if (f.requiredDLC) {
              const fDLC = typeof f.requiredDLC === 'string' ? f.requiredDLC.split(',').map((s: string) => s.trim()) : f.requiredDLC;
              if (Array.isArray(fDLC)) fDLC.forEach((d: string) => { if (!rawDLC.includes(d)) rawDLC.push(d); });
            }
          });
        }
        const missingPacks = rawDLC.filter((p: string) => {
          const baseCode = p.split(' ')[0].toUpperCase();
          return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        });
        if (missingPacks.length > 0) return false;
      }

      const isSandboxMod = mod.hash?.startsWith('dev_vault_') || (typeof mod.status === 'string' && mod.status.toUpperCase().includes('SANDBOX')) || (mod.physical_path && (mod.physical_path.toLowerCase().includes('/dev/') || mod.physical_path.toLowerCase().includes('\\dev\\')));
      if (equipFilter === "DEV") {
        if (!isSandboxMod) return false;
      } else if (equipFilter !== "EQUIPPED" && isSandboxMod) {
        return false;
      }

      if (equipFilter === "ARCHIVES") {
        if (isCompatibleWithOS) return false;
        if (archiveVersionFilter && archiveVersionFilter !== "") {
          let highestArchiveVer = "0.0.0";
          if (mod.isVirtual) {
            const highestPerFlavor = (mod.flavors || []).map((f: any) => {
              const v = f.compatible_versions;
              const arr = typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
              return getHighestVersion(arr);
            });
            highestArchiveVer = getLowestVersion(highestPerFlavor);
          } else {
            highestArchiveVer = getHighestVersion(modGameVersions);
          }

          const isCompatibleWithArchive = isVersionMatch([highestArchiveVer], archiveVersionFilter);
          if (!isCompatibleWithArchive) return false;
        }
      } else {
        if (!isCompatibleWithOS) return false;
      }

      if (equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") {
        const isEquipped = mod.isParent
          ? (() => {
            const anchor = mod.dbId || mod.familyId;
            if (mod.isFlavorFolder) {
              return (mod.flavors || []).some((f: any) =>
                parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name),
              );
            }
            if (anchor) {
              return equippedDisplayMods.some(
                (m: any) =>
                  !m.isVirtual &&
                  m.name &&
                  (String(m.familyId) === String(anchor) ||
                    String(m.dbId) === String(anchor) ||
                    String(m.setId) === String(anchor))
              );
            }
            return (mod.flavors || []).some((f: any) =>
              parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name),
            );
          })()
          : parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === mod.name || cleanNLookup === mod.name);

        if (equipFilter === "EQUIPPED" && !isEquipped) return false;
        if (equipFilter === "UNEQUIPPED") {
          if (mod.isParent) {
            const allEquipped = mod.flavors?.every((f: any) => parsedActiveSetMods.some(({ n, cleanNLookup }: any) => n === f.name || cleanNLookup === f.name));
            if (allEquipped) return false;
          } else {
            if (isEquipped) return false;
          }
        }
      }

      if (mod.isVirtual) return true;
      const folderExists = (mod.familyId && virtualFolderIds.has(String(mod.familyId))) || (mod.setId && virtualFolderIds.has(String(mod.setId)));
      return !folderExists;
    });
  }, [visibleMods, selectedVersion, hideGhostCards, playSets, activePlaySetIndex, activeGameSchema, equipFilter, archiveVersionFilter, ownedDLC, maskedDLC, virtualFolderIds, equippedDisplayMods, modListIndex]);

  const totalPages = Math.max(1, Math.ceil(finalVisibleMods.length / itemsPerPage));
  const dependencyGraph = React.useMemo(() => {
    const tStart = performance.now();
    const graph = new Map<string, any[]>();

    // Create fast lookup maps for equipped mods
    const equippedByName = new Map<string, any>();
    const equippedById = new Map<string, any>();
    const equippedByHash = new Map<string, any>();
    const equippedByFuzzy = new Map<string, any>();
    const equippedByFamily = new Map<string, any>();

    equippedDisplayMods.forEach((m: any) => {
      equippedByName.set(m.name, m);
      if (m.dbId) equippedById.set(String(m.dbId), m);
      if (m.hash) equippedByHash.set(m.hash, m);
      if (m.familyId) equippedByFamily.set(String(m.familyId), m);
      if (m.interchangeableIds) {
        m.interchangeableIds.forEach((id: string) => equippedById.set(String(id), m));
      }
      if (m.displayName) {
        const upper = m.displayName.toUpperCase();
        equippedByFuzzy.set(upper, m);
        equippedByFuzzy.set(upper.replace(/_/g, " "), m);
      }
    });

    equippedDisplayMods.forEach((m: any) => {
      let deps = new Set<any>();

      // 1. Requirements
      if (m.requirements) {
        m.requirements.forEach((r: any) => {
          const reqIdStr = typeof r === 'string' ? r : r.id || r.dbId;
          const reqName = typeof r === 'string' ? r : r.name;
          let provider = null;

          if (reqIdStr) {
            provider = equippedById.get(String(reqIdStr)) || equippedByHash.get(String(reqIdStr));
          }

          if (!provider && reqName && isNaN(Number(reqName))) {
            const reqBaseName = reqName.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "").toUpperCase();

            // Fuzzy match: check all equipped mods
            for (const [key, p] of equippedByFuzzy.entries()) {
              if (key.includes(reqBaseName)) {
                provider = p;
                break;
              }
            }
          }

          if (provider && provider.name !== m.name) deps.add(provider);
        });
      }

      // 2. Addons
      if (m.relationshipType === 'addon' && m.familyId) {
        const provider = equippedByFamily.get(String(m.familyId));
        if (provider && provider.relationshipType !== 'addon' && provider.name !== m.name) {
          deps.add(provider);
        }
      }

      deps.forEach((provider: any) => {
        let arr = graph.get(provider.name);
        if (!arr) { arr = []; graph.set(provider.name, arr); }
        arr.push(m);
      });
    });
    return graph;
  }, [equippedDisplayMods]);

  const paginatedMods = finalVisibleMods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex-1 overflow-visible pr-4 relative">
      <div className="flex flex-col gap-0 animate-in fade-in duration-700">
        <ViewHeader
          title={t("vault_title")}
          subtitle={t("vault_subtitle")}
          icon={t("icon_account_balance")}
          iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
        >
          <div className="flex flex-wrap gap-4 items-center justify-end">
            <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner">
              <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                <span className="material-symbols-outlined text-xl normal-case">{t("icon_tune")}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_tools")}</span>
              </button>
            </div>
          </div>
        </ViewHeader>

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 mb-6">
          <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 w-full">
            <HubTabButton id="ALL" icon="inventory_2" label={t("filter_all_vault")} activeTab={equipFilter} setTab={setEquipFilter} />
            <HubTabButton id="EQUIPPED" icon="check_circle" label={t("filter_equipped")} activeTab={equipFilter} setTab={setEquipFilter} />
            <HubTabButton id="UNEQUIPPED" icon="cancel" label={t("filter_unequipped")} activeTab={equipFilter} setTab={setEquipFilter} />
            <HubTabButton id="DEV" icon="code" label={t("filter_dev") || "DEV"} activeTab={equipFilter} setTab={setEquipFilter} />
            <HubTabButton id="ARCHIVES" icon="archive" label={t("filter_archives")} activeTab={equipFilter} setTab={setEquipFilter} />
          </div>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center gap-4 py-4 shrink-0 border-b border-white/5 w-full mb-8 relative z-20 animate-in slide-in-from-top-4 duration-500">
          <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] hidden xl:flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_inventory_2")}</span>
            </div>
            <span className="truncate">{t("title_artifacts") || "YOUR ARTIFACTS"}</span>
          </h2>

          <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 relative flex-1 xl:ml-auto xl:justify-end w-full xl:w-auto">
            <div className="relative flex-1 min-w-[200px] w-full xl:max-w-[300px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
              <input
                type="text"
                placeholder={t("search_ph")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-10 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm">{t("icon_close")}</span>
                </button>
              )}
            </div>

            <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-50 h-12">
              <CustomDropdown disableTint={true}
                value={activeCategory}
                onChange={(val: string[]) => { setActiveCategory(val[0]); setActiveSubType("ALL"); }}
                options={[
                  { id: "ALL", label: t("ql_all") },
                  ...(activeGameSchema?.mod_categories?.map((cat: any) => ({
                    id: cat.id,
                    label: t(cat.lexicon_key) || cat.id
                  })) || [])
                ]}
              />
            </div>

            {(() => {
              const activeSchemaCategory = activeGameSchema?.mod_categories?.find((c: any) => c.id === activeCategory);
              const subcats = activeSchemaCategory?.subcategories || [];
              if (subcats.length === 0) return null;

              return (
                <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-50 h-12 animate-in fade-in slide-in-from-right-4">
                  <CustomDropdown disableTint={true}
                    value={activeSubType}
                    onChange={(val: string[]) => setActiveSubType(val[0])}
                    options={[
                      { id: "ALL", label: t("ql_all") },
                      ...subcats.map((sub: any) => ({
                        id: sub.id,
                        label: t(sub.lexicon_key) || sub.id
                      }))
                    ]}
                  />
                </div>
              );
            })()}

            <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[49] h-12">
              <CustomDropdown disableTint={true}
                value={filterStatus}
                onChange={(val: string[]) => setFilterStatus(val[0])}
                options={[
                  { id: "ALL", label: t("ql_all") },
                  { id: "VERIFIED", label: t("verified") },
                  { id: "REVIEW", label: t("status_dd_review") },
                  { id: "UNVERIFIED", label: t("unverified") }
                ]}
              />
            </div>

            {equipFilter === "ARCHIVES" && (
              <div className="flex-1 xl:flex-none xl:w-max min-w-[140px] xl:max-w-[200px] shrink-0 relative z-[48] h-12">
                {(() => {
                  const archiveOptionsRaw = Array.from(new Set(displayModList.flatMap((m: any) => {
                    const getVersions = (target: any) => {
                      const v = target.compatible_versions;
                      return typeof v === 'string' ? v.split(',').map((s: string) => s.trim()) : (v || []);
                    };
                    let highest = "0.0.0";
                    if (m.isVirtual) {
                      const highestPerFlavor = (m.flavors || []).map((f: any) => getHighestVersion(getVersions(f)));
                      highest = getLowestVersion(highestPerFlavor);
                    } else {
                      highest = getHighestVersion(getVersions(m));
                    }

                    if (selectedVersion && selectedVersion !== "") {
                      if (isVersionMatch([highest], selectedVersion)) return [];
                    }
                    return [highest];
                  }).filter(Boolean)));

                  const archiveOptions = (archiveOptionsRaw as string[])
                    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                    .map(v => ({ id: v, label: v === "Unknown" ? t("status_unknown") : v }));

                  const activeVal = archiveVersionFilter && archiveOptions.some(o => o.id === archiveVersionFilter)
                    ? archiveVersionFilter
                    : (archiveOptions[0]?.id || "");

                  if (!archiveVersionFilter && activeVal) {
                    setTimeout(() => setArchiveVersionFilter(activeVal), 0);
                  }

                  return (
                    <CustomDropdown disableTint={true}
                      options={archiveOptions}
                      value={activeVal}
                      onChange={(val: any) => {
                        const newVal = Array.isArray(val) ? val[0] : val;
                        setArchiveVersionFilter(newVal || "");
                      }}
                      placeholder={t("filter_archive_version")}
                      multiSelect={false}
                    />
                  );
                })()}
              </div>
            )}

            {(equipFilter === "ALL" || equipFilter === "EQUIPPED" || equipFilter === "UNEQUIPPED") && (
              <button
                onClick={() => setHideGhostCards(!hideGhostCards)}
                className={`h-12 px-5 rounded-2xl overflow-hidden text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-lg hover:scale-[1.02] active:scale-95 shrink-0 ${hideGhostCards
                  ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:shadow-[0_5px_20px_color-mix(in_srgb,var(--success)_20%,transparent)]'
                  : 'theme-glass-panel text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5'
                  }`}
              >
                <span className="material-symbols-outlined !text-[18px]">
                  {hideGhostCards ? "visibility_off" : "visibility"}
                </span>
                {t("btn_hide_ghosts")}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-24 pl-2 pr-6">
          {paginatedMods.length === 0 ? (
            <EmptyState icon="search_off" title={t("registry_no_mods")} subtitle={t("vault_no_results_sub")} className="col-span-full py-24" />
          ) : (
            paginatedMods.map((mod: any, index: number) => {
              const mainKey = `${mod.hash || mod.name}-${index}`;
              const activeSetMods =
                playSets[activePlaySetIndex]?.mods || [];
              const isEquipped = mod.isParent
                ? (() => {
                  const anchor = mod.dbId || mod.familyId;
                  if (mod.isFlavorFolder) {
                    return (mod.flavors || []).some((f: any) =>
                      activeSetMods.some((sm: string) => sm === f.name || sm.replace(/^(sanctuary[/\\])+/i, '') === f.name),
                    );
                  }
                  if (anchor) {
                    return (mod.flavors || []).some((f: any) =>
                      activeSetMods.some((sm: string) => sm === f.name || sm.replace(/^(sanctuary[/\\])+/i, '') === f.name),
                    );
                  }
                  return (mod.flavors || []).some((f: any) =>
                    activeSetMods.some((sm: string) => sm === f.name || sm.replace(/^(sanctuary[/\\])+/i, '') === f.name),
                  );
                })()
                : activeSetMods.some((sm: string) => sm === mod.name || sm.replace(/^(sanctuary[/\\])+/i, '') === mod.name);
              const getDeepCasualties = (targetMods: any[], shallow = false) => {
                let queue = [...targetMods];
                let seen = new Set<string>();
                let result: string[] = [];
                if (!isEquipped) {
                  const mData = mod;
                  if (mData?.requirements) {
                    mData.requirements.forEach((reqId: any) => {
                      const isSatisfied = equippedDisplayMods.some((m: any) => String(m.dbId) === String(reqId));
                      if (!isSatisfied) {
                        const provider = modListIndex.byDbId.get(String(reqId));
                        if (provider?.flavorGroupId) {
                          const equippedRivals = equippedDisplayMods.filter(
                            (m: any) =>
                              String(m.flavorGroupId) ===
                              String(provider.flavorGroupId)
                          );
                          queue.push(...equippedRivals);
                        }
                      }
                    });
                  }
                }
                while (queue.length > 0) {
                  const current = queue.shift();
                  if (!current || seen.has(current.name)) continue;
                  seen.add(current.name);
                  if (current.name !== mod.name) {
                    result.push(current.displayName || current.name);
                  }
                  if (!shallow) {
                    const dependents = dependencyGraph.get(current.name) || [];
                    queue.push(...dependents);
                  }
                }
                return [...new Set(result)];
              };
              let casualties: any[] = [];
              let tier3List: any[] = [];
              let isFlavorSwapCard = false;
              if (isEquipped) {
                if (mod.isVirtual) {
                  const familyAnchor = mod.dbId || mod.familyId;
                  if (familyAnchor) {
                    const wouldBeRemoved = equippedDisplayMods.filter(
                      (m: any) =>
                        !m.isVirtual &&
                        m.name &&
                        m.name !== mod.name &&
                        (String(m.familyId) === String(familyAnchor) ||
                          String(m.dbId) === String(familyAnchor) ||
                          String(m.setId) === String(familyAnchor))
                    );
                    if (wouldBeRemoved.length > 0) {
                      const fullStrings = [
                        ...wouldBeRemoved.map(
                          (s: any) => s.displayName || s.name,
                        ),
                        ...getDeepCasualties(wouldBeRemoved),
                      ];
                      casualties = [...new Set(fullStrings)];
                    }
                  }
                } else {
                  casualties = getDeepCasualties([mod]);
                }
              } else {
                if (mod.isVirtual) {
                  const flavorFiles = (mod.flavors || []).filter(
                    (f: any) => f.flavorGroupId != null,
                  );
                  if (flavorFiles.length > 0) {
                    const firstFlavor = flavorFiles[0];
                    const rivals = equippedDisplayMods.filter(
                      (m: any) =>
                        String(m.flavorGroupId) ===
                        String(firstFlavor.flavorGroupId) &&
                        m.name !== firstFlavor.name
                    );
                    if (rivals.length > 0) isFlavorSwapCard = true;
                    casualties = [...casualties, ...getDeepCasualties(rivals, true)];
                  }
                } else if (mod.flavorGroupId) {
                  const rivals = equippedDisplayMods.filter(
                    (m: any) =>
                      String(m.flavorGroupId) ===
                      String(mod.flavorGroupId) &&
                      m.name !== mod.name
                  );
                  if (rivals.length > 0) isFlavorSwapCard = true;
                  casualties = [...casualties, ...getDeepCasualties(rivals, true)];
                }

                const checkConflicts = (mObj: any) => {
                  const mObjCleanN = (mObj.name || "").split(/[\\/]/).pop()?.replace(/\.[^/.]+$/i, "").toUpperCase();
                  const mObjDispUpper = mObj.displayName?.toUpperCase();

                  if (mObj.conflicts && mObj.conflicts.length > 0) {
                    const processSeverity = (targetRank: number, targetList: any[]) => {
                      const found = mObj.conflicts.filter((c: any) => Number(c.severity_rank) == targetRank).map((c: any) => {
                        const matchItem = uppercaseEquippedMods.find((item: any) => {
                          const mData = item.mData;
                          if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                          if (c.enemy_name) {
                            const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase();
                            if (item.emBaseClean === targetClean || item.emDisp === targetClean) return true;
                          }
                          return false;
                        });
                        if (matchItem) {
                          const matchObj = matchItem.mData;
                          return { name: matchObj.displayName || matchObj.name, rawName: matchObj.name, note: c.conflict_note || c.resolution_note || "" };
                        }
                        return null;
                      }).filter(Boolean);
                      if (found.length > 0) {
                        targetList.push(...found);
                      }
                    };
                    processSeverity(4, casualties);
                    processSeverity(3, tier3List);
                  }

                  // Reverse conflicts: Do any equipped mods point to this mod?
                  uppercaseEquippedMods.forEach((item: any) => {
                    const mData = item.mData;
                    if (mData.conflicts && mData.conflicts.length > 0) {
                      const found = mData.conflicts.filter((c: any) => {
                        if (c.enemy_id && String(mObj.dbId) === String(c.enemy_id)) return true;
                        if (c.enemy_name) {
                          const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase();
                          if (mObjCleanN === targetClean || mObjDispUpper === targetClean) return true;
                        }
                        return false;
                      });

                      found.forEach((c: any) => {
                        const targetRank = Number(c.severity_rank);
                        if (targetRank == 4) casualties.push({ name: mData.displayName || mData.name, rawName: mData.name, note: c.conflict_note || c.resolution_note || "" });
                        if (targetRank == 3) tier3List.push({ name: mData.displayName || mData.name, rawName: mData.name, note: c.conflict_note || c.resolution_note || "" });
                      });
                    }
                  });

                  // Local conflicts
                  localConflictsMemo.forEach((lc: any) => {
                    const mObjClean = String(mObj.name || "").toUpperCase();
                    const mObjDisp = String(mObj.displayName || "").toUpperCase();

                    let isMObjA = mObjClean.includes(lc.modAUpper) || mObjDisp.includes(lc.modAUpper) || lc.modAUpper.includes(mObjClean);
                    let isMObjB = mObjClean.includes(lc.modBUpper) || mObjDisp.includes(lc.modBUpper) || lc.modBUpper.includes(mObjClean);

                    if (isMObjA || isMObjB) {
                      const targetEnemy = isMObjA ? lc.modBUpper : lc.modAUpper;
                      const matchItem = uppercaseEquippedMods.find((item: any) => {
                        return item.emClean.includes(targetEnemy) || item.emDisp.includes(targetEnemy) || targetEnemy.includes(item.emClean);
                      });

                      if (matchItem) {
                        const matchObj = matchItem.mData;
                        const targetRank = Number(lc.severity_rank);
                        const isWinnerMObj = mObj._originalSetName?.toLowerCase().startsWith("sanctuary") || mObj.name?.toLowerCase().startsWith("sanctuary");
                        const isWinnerEnemy = matchObj._originalSetName?.toLowerCase().startsWith("sanctuary") || matchObj.name?.toLowerCase().startsWith("sanctuary");
                        if (isWinnerMObj || isWinnerEnemy) return;

                        if (targetRank == 4) casualties.push({ name: matchObj.displayName || matchObj.name, rawName: matchObj.name, note: lc.resolution_note || "Local Scan Detects Tuning Overlap" });
                        if (targetRank == 3) tier3List.push({ name: matchObj.displayName || matchObj.name, rawName: matchObj.name, note: lc.resolution_note || "Local Scan Detects Tuning Overlap" });
                      }
                    }
                  });
                };

                checkConflicts(mod);
                if (mod.isVirtual && mod.flavors) {
                  mod.flavors.forEach(checkConflicts);
                }

                casualties = Array.from(new Map(casualties.map((item: any) => [item.name || item, item])).values());
                tier3List = Array.from(new Map(tier3List.map((item: any) => [item.name || item, item])).values());
              }
              if (anarchyRules?.intercept === false) {
                casualties = [];
              }

              const missingReqs: any[] = [];
              const checkModDeps = (m: any) => {
                if (m.missingReqs !== undefined) {
                  m.missingReqs.forEach((r: any) => {
                    if (!missingReqs.some(existing => existing.id === r.id)) missingReqs.push(r);
                  });
                  return;
                }

                m.missingReqs = [];
                const pushMissing = (reqOrStr: any, fallbackUrl?: string) => {
                  const isObj = typeof reqOrStr === 'object';
                  const id = isObj ? (reqOrStr.name || reqOrStr.id) : reqOrStr;
                  const finalUrl = isObj ? (reqOrStr.url || reqOrStr.link) : fallbackUrl;
                  if (!missingReqs.some(r => r.id === id)) missingReqs.push({ id, url: finalUrl });
                  if (!m.missingReqs.some((r: any) => r.id === id)) m.missingReqs.push({ id, url: finalUrl });
                };


                if (m.requirements) {
                  m.requirements.forEach((req: any) => {
                    const reqIdStr = typeof req === 'string' ? req : req.id || req.dbId;
                    const reqName = typeof req === 'string' ? req : req.name;
                    const extRegex = getExtensionRegex(activeGameSchema);
                    const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();
                    const isReqNumeric = !isNaN(Number(reqName));

                    let match = null;
                    if (reqIdStr) match = modListIndex.byDbId.get(String(reqIdStr)) || modListIndex.byHash.get(reqIdStr) || modListIndex.byInterchangeableId.get(String(reqIdStr));
                    if (!match && !isReqNumeric && reqBaseName) {
                      match = modListIndex.namesAndDisplayNames.find((n: any) => n.displayNameUpper.includes(reqBaseName) || n.displayNameSpaced.includes(reqBaseName.replace(/_/g, " ")))?.orig;
                    }

                    if (!match) pushMissing(req);
                  });
                }
                if (m.twins) {
                  m.twins.forEach((twin: any) => {
                    const twinId = typeof twin === 'string' ? twin : twin.id || twin.dbId;
                    const twinName = typeof twin === 'string' ? twin : twin.name;
                    const twinBaseName = twinName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                    const isTwinNumeric = !isNaN(Number(twinName));

                    let match = null;
                    if (twinId) match = modListIndex.byDbId.get(String(twinId));
                    if (!match && twinId) match = modListIndex.byHash.get(twinId);
                    if (!match && twinId) match = modListIndex.byInterchangeableId.get(String(twinId));

                    if (match && match.hash === m.hash) match = null;

                    if (!match && !isTwinNumeric && twinBaseName) {
                      const found = modListIndex.namesAndDisplayNames.find((n: any) => n.hash !== m.hash && (n.displayNameUpper.includes(twinBaseName) || n.displayNameSpaced.includes(twinBaseName.replace(/_/g, " "))));
                      if (found) match = found.orig;
                    }

                    if (!match) pushMissing(twin);
                  });
                }

              };

              checkModDeps(mod);
              if (mod.isVirtual && mod.flavors) {
                mod.flavors.forEach(checkModDeps);
              }



              let renderedMod = mod;

              return (
                <div key={mainKey} className="contents">
                  <ModCard
                    mod={renderedMod}
                    gameVersion={selectedVersion}
                    ownedDLC={ownedDLC}
                    maskedDLC={maskedDLC}
                    isInActiveSet={isEquipped}
                    casualtyList={casualties}
                    anarchyRules={anarchyRules}
                    tier3List={tier3List}
                    missingDeps={missingReqs}
                    onToggleSet={(e: any, excludeBroken?: boolean) => {
                      e.stopPropagation();
                      toggleInActiveSet(mod.name, excludeBroken);
                    }}
                    onInspectItem={async (target: any) => {
                      const name = typeof target === 'string' ? target : (target.name || target.id || target.hash);
                      let foundMod = typeof target === 'object' && target.hash ? target : null;

                      if (!foundMod) {
                        foundMod = modListIndex.byHash.get(name) ||
                          modListIndex.byName.get(name) ||
                          modListIndex.byDbId.get(String(name)) ||
                          modListIndex.byInterchangeableId.get(String(name));
                      }

                      if (!foundMod && displayModList) {
                        foundMod = displayModList.find((m: any) => m.name === name || m.id === name || m.hash === name || (m.flavors && m.flavors.some((f: any) => f.name === name)));
                      }

                      if (!foundMod) {
                        try {
                          const targetId = typeof target === 'object' ? (target.id || target.dbId) : null;
                          let query = supabase.from('mods').select('*');
                          if (targetId && /^[0-9a-f]{8}-/i.test(targetId)) {
                            query = query.eq('id', targetId);
                          } else {
                            query = query.ilike('name', `%${name}%`).limit(1);
                          }
                          const { data } = await query.single();
                          if (data) {
                            foundMod = { ...data, dbId: data.id, isNexusView: true };
                          }
                        } catch (e) {
                          // Silently fail and create stub below
                        }
                      }

                      if (!foundMod) {
                        foundMod = { name, isStub: true, displayName: name };
                      }
                      setMetaNameInput(foundMod.displayName || foundMod.name);
                      setMetaAuthorInput(foundMod.author || "");
                      setMetaDescInput(foundMod.description || "");
                      setMetaImageInput(foundMod.image_url || foundMod.imageUrl || "");
                      if (setMetaUrlInput) setMetaUrlInput(foundMod.url || "");
                      if (setMetaVersionInput) setMetaVersionInput(foundMod.latest_version || foundMod.version || "");
                      setMetaAllowWriteInput(foundMod.allow_write || false);
                      setActiveDossier(foundMod);
                    }}
                    onResolveConflict={(e: any, t3List: any[], m: any, winnerName?: string) => {
                      if (t3List && t3List.length > 0) {
                        const rival = t3List[0];
                        const modA = m.name;
                        const modB = rival.rawName || rival.name;
                        const modPair = `${modA} <<<<<->>>>> ${modB}`;

                        if (winnerName) {
                          if (winnerName === modA) {
                            toggleInActiveSet(modB, false, false, true); // Ensure loser is active
                            toggleInActiveSet(modA, false, false, true); // Force active winner
                            applyConflictOverride(modA, modPair, playSets[activePlaySetIndex]?.name);
                          } else {
                            toggleInActiveSet(modA, false, false, true); // Ensure loser is active
                            toggleInActiveSet(modB, false, false, true); // Force active winner
                            applyConflictOverride(modB, modPair, playSets[activePlaySetIndex]?.name);
                          }
                        } else {
                          toggleInActiveSet(modA, false, false, true);
                          setActiveTier3Conflict({
                            mod_pair: modPair,
                            modA,
                            modB,
                            severity_rank: 3
                          });
                        }
                      } else {
                        toggleInActiveSet(mod.name, false, false, true);
                      }
                    }}
                    onSelect={() => {
                      setMetaNameInput(mod.displayName || mod.name);
                      setMetaAuthorInput(mod.author || "");
                      setMetaDescInput(mod.description || "");
                      setMetaImageInput(
                        mod.image_url || mod.imageUrl || "",
                      );
                      if (setMetaUrlInput) setMetaUrlInput(mod.url || "");
                      if (setMetaVersionInput) setMetaVersionInput(mod.latest_version || mod.version || "");
                      setMetaAllowWriteInput(mod.allow_write || false);
                      setActiveDossier(mod);
                    }}
                    isParent={mod.isParent}
                    isExpanded={expandedFolder === mainKey}
                    isFlavorSwap={isFlavorSwapCard}
                    onExpand={() =>
                      setExpandedFolder(
                        expandedFolder === mainKey ? null : mainKey,
                      )
                    }
                    isBulkMode={isBulkMode}
                    hideIneligible={hideGhostCards}
                    isSelected={selectedMods.includes(mod.name)}
                    onToggleSelect={() =>
                      setSelectedMods((prev: string[]) =>
                        prev.includes(mod.name)
                          ? prev.filter((n: string) => n !== mod.name)
                          : [...prev, mod.name],
                      )
                    }
                  />
                  {mod.isParent && expandedFolder === mainKey && (
                    <div className="col-span-full theme-glass-panel rounded-[var(--radius)] p-8 my-4">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black text-[var(--text)] uppercase">
                          {" "}
                          <span className="theme-text-accent">
                            {formatDisplayName(renderedMod.displayName || renderedMod.name)}
                          </span>
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const flavorsToEquip = (renderedMod.flavors || []).filter((f: any) => {
                              if (activeSetMods.includes(f.name)) return false;
                              let rawFlavorDLC: string[] = [];
                              if (renderedMod.requiredDLC) {
                                if (typeof renderedMod.requiredDLC === 'string') rawFlavorDLC.push(...renderedMod.requiredDLC.split(',').map((s: string) => s.trim()));
                                else if (Array.isArray(renderedMod.requiredDLC)) rawFlavorDLC.push(...renderedMod.requiredDLC);
                              }
                              if (f.requiredDLC) {
                                if (typeof f.requiredDLC === 'string') rawFlavorDLC.push(...f.requiredDLC.split(',').map((s: string) => s.trim()));
                                else if (Array.isArray(f.requiredDLC)) rawFlavorDLC.push(...f.requiredDLC);
                              }

                              let flavorDLC = Array.from(new Set(rawFlavorDLC)).filter(Boolean);
                              const missingPacks = flavorDLC.filter((p: string) => {
                                const baseCode = p.split(' ')[0].toUpperCase();
                                return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
                              });
                              const hasMissingDeps = f.missingReqs && f.missingReqs.length > 0;
                              const isGameVersionMismatch = (f.compatible_versions && f.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(f.compatible_versions, selectedVersion)) || (renderedMod.compatible_versions && renderedMod.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(renderedMod.compatible_versions, selectedVersion));
                              return !(missingPacks.length > 0 || hasMissingDeps || f.isGhosted || isGameVersionMismatch);
                            });
                            flavorsToEquip.forEach((f: any) => {
                              toggleInActiveSet(f.name, false, false, true);
                            });
                          }}
                          className="h-10 px-4 rounded-xl overflow-hidden theme-glass-inner flex items-center justify-center gap-2 text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105"
                        >
                          <span className="material-symbols-outlined !text-[18px]">{t("icon_check_circle")}</span> {t("btn_equip_all")}
                        </button>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
                        {(renderedMod.flavors || [])
                          .map(
                            (flavor: any, subIdx: number) => {
                              const isFlavorEquipped =
                                activeSetMods.includes(flavor.name);
                              const getDrawerDeepCasualties = (
                                seeds: any[],
                              ) => {
                                let queue = [...seeds];
                                let seen = new Set<string>();
                                let result: any[] = [];
                                while (queue.length > 0) {
                                  const current = queue.shift();
                                  if (!current || seen.has(current.name))
                                    continue;
                                  seen.add(current.name);
                                  result.push(current);
                                  if (current.dbId || current.familyId) {
                                    const dependents =
                                      equippedDisplayMods.filter(
                                        (m: any) =>
                                        (m.requirements?.some(
                                          (r: any) => {
                                            const reqIdStr = typeof r === 'string' ? r : r.id || r.dbId;
                                            const reqName = typeof r === 'string' ? r : r.name;
                                            const extRegex = getExtensionRegex(activeGameSchema);
                                            const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();
                                            const isReqNumeric = !isNaN(Number(reqName));
                                            return (reqIdStr && String(current.dbId) === String(reqIdStr)) ||
                                              (reqIdStr && current.hash === reqIdStr) ||
                                              (reqIdStr && current.interchangeableIds && current.interchangeableIds.includes(String(reqIdStr))) ||
                                              (!isReqNumeric && reqBaseName && current.displayName && (current.displayName.toUpperCase().includes(reqBaseName) || current.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
                                          }
                                        ) ||
                                          (String(m.familyId) ===
                                            String(
                                              current.familyId ||
                                              current.dbId,
                                            ) &&
                                            m.relationshipType ===
                                            "addon" &&
                                            current.relationshipType !==
                                            "addon"))
                                      );
                                    queue.push(...dependents);
                                  }
                                }
                                return result;
                              };
                              let drawerCasualties: any[] = [];
                              if (!isFlavorEquipped) {
                                const localRivals = mod.isVirtual
                                  ? (renderedMod.flavors || []).filter(
                                    (f: any) =>
                                      f.name !== flavor.name &&
                                      activeSetMods.includes(f.name),
                                  )
                                  : [];
                                const globalRivals = equippedDisplayMods.filter((m: any) => {
                                  if (m.name === flavor.name) return false;
                                  const isSameFlavorGroup = flavor.flavorGroupId && String(m.flavorGroupId) === String(flavor.flavorGroupId);
                                  const isBetaRival = (flavor.relationshipType === 'beta' && m.relationshipType !== 'beta' || flavor.relationshipType !== 'beta' && m.relationshipType === 'beta') && (String(m.familyId) === String(flavor.familyId) || String(m.dbId) === String(flavor.familyId || flavor.dbId));
                                  return isSameFlavorGroup || isBetaRival;
                                });
                                const allRivals = [...localRivals, ...globalRivals].filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                                drawerCasualties = getDrawerDeepCasualties(allRivals);
                              } else {
                                drawerCasualties = getDrawerDeepCasualties([
                                  flavor,
                                ]).filter(
                                  (c: any) => c.name !== flavor.name,
                                );
                              }
                              if (anarchyRules?.intercept === false) {
                                drawerCasualties = [];
                              }

                              const isFlavorSwap = !isFlavorEquipped && (flavor.flavorGroupId != null || (mod.isVirtual && (renderedMod.flavors || []).some((f: any) => f.flavorGroupId != null)));
                              const isBetaFlavor = flavor.relationshipType === 'beta' || (flavor.relationshipType !== 'core' && flavor.sub_type?.toLowerCase() === 'beta');
                              const isBetaSwap = !isFlavorEquipped && isBetaFlavor;
                              const isSwappedState = isFlavorSwap || isBetaSwap;

                              let rawFlavorDLC: string[] = [];
                              if (renderedMod.requiredDLC) {
                                if (typeof renderedMod.requiredDLC === 'string') rawFlavorDLC.push(...renderedMod.requiredDLC.split(',').map((s: string) => s.trim()));
                                else if (Array.isArray(renderedMod.requiredDLC)) rawFlavorDLC.push(...renderedMod.requiredDLC);
                              }
                              if (flavor.requiredDLC) {
                                if (typeof flavor.requiredDLC === 'string') rawFlavorDLC.push(...flavor.requiredDLC.split(',').map((s: string) => s.trim()));
                                else if (Array.isArray(flavor.requiredDLC)) rawFlavorDLC.push(...flavor.requiredDLC);
                              }

                              let flavorDLC = Array.from(new Set(rawFlavorDLC)).filter(Boolean);
                              const missingPacks = flavorDLC.filter((p: string) => {
                                const baseCode = p.split(' ')[0].toUpperCase();
                                return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
                              });
                              const hasMissingDeps = flavor.missingReqs && flavor.missingReqs.length > 0;

                              const flavorVersionMismatch = (flavor.compatible_versions && flavor.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(flavor.compatible_versions, selectedVersion)) || (renderedMod.compatible_versions && renderedMod.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(renderedMod.compatible_versions, selectedVersion));
                              const flavorGhostReason = flavor.ghostReason || (flavorVersionMismatch ? "VERSION_MISMATCH" : null) || (renderedMod.ghostReason === "VERSION_MISMATCH" ? "VERSION_MISMATCH" : null);
                              const isFlavorGhosted = missingPacks.length > 0 || hasMissingDeps || flavor.isGhosted || flavorGhostReason === "VERSION_MISMATCH";

                              const isConfirming = drawerConfirmHash === flavor.hash;
                              return (
                                <div className="relative hover:z-50" key={`sub-${flavor.hash}-${subIdx}`}>
                                  <div
                                    className={`p-3 rounded-xl overflow-hidden relative flex transition-all cursor-pointer min-h-[56px] ${isConfirming ? "bg-transparent border-transparent flex-col items-stretch p-0" : (isFlavorGhosted && !isFlavorEquipped) || isSwappedState ? `bg-black/20 opacity-50 grayscale border ${isSwappedState ? "border-[var(--accent)]/30 hover:border-[var(--accent)]/50" : "border-[var(--danger)]/30 hover:border-[var(--danger)]/50"}` : "theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm hover:shadow-md hover:scale-[1.02] hover:theme-border-accent"} ${isConfirming ? "" : "items-center justify-between"}`}
                                    onClick={() => {
                                      if (!isConfirming) {
                                        setMetaNameInput(flavor.displayName || flavor.name);
                                        setMetaAuthorInput(flavor.author || mod.author || "");
                                        setMetaVersionInput(flavor.version || mod.version || "");
                                        setMetaDescInput(flavor.description || mod.description || "");
                                        setMetaImageInput(flavor.image_url || flavor.imageUrl || mod.image_url || mod.imageUrl || "");
                                        setMetaAllowWriteInput(flavor.allow_write || mod.allow_write || false);
                                        setActiveDossier(flavor);
                                      }
                                    }}
                                  >
                                    {isConfirming ? (
                                      <div
                                        className={`w-full flex flex-col rounded-[calc(var(--radius)-4px)] overflow-hidden border theme-glass-panel animate-in fade-in zoom-in-95 shadow-2xl will-change-transform ${isSwappedState ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : "border-[color-mix(in_srgb,var(--danger)_50%,transparent)]"}`}
                                      >
                                        {/* Header */}
                                        <div className={`relative z-10 p-3 flex items-center justify-center gap-2 border-b shrink-0 rounded-t-[calc(var(--radius)-4px)] ${isSwappedState ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}`}>
                                          <span className={`material-symbols-outlined !text-[18px] ${isSwappedState ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                                            {isFlavorGhosted && !isFlavorEquipped ? 'extension' : isSwappedState ? 'swap_horiz' : (!isFlavorEquipped ? (t("icon_crisis_alert") || 'crisis_alert') : 'delete')}
                                          </span>
                                          <span className={`text-[11px] font-black uppercase tracking-widest truncate ${isSwappedState ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>
                                            {String(isFlavorGhosted && !isFlavorEquipped ? t("missing_artifacts") : isSwappedState ? (isBetaSwap ? t("beta_swap") : (t("flavor_swap") || "FLAVOR SWAP")) : (!isFlavorEquipped ? t("fatal_conflict") : t("yeet_cascade"))).replace(/:$/, '')}
                                          </span>
                                        </div>

                                        {/* Scrolling Content */}
                                        <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4 pb-4 flex flex-col gap-2 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] max-h-48">
                                          {isFlavorGhosted && !isFlavorEquipped ? (
                                            <>
                                              {hasMissingDeps ? (
                                                flavor.missingReqs.map((req: any) => {
                                                  const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                                                  return (
                                                    <div key={reqIdStr} className="flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl">
                                                      <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">extension</span>
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("missing_dependency") || "DEP"}</span>
                                                        <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{cleanSearchName(reqIdStr, activeGameSchema)}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })
                                              ) : flavorGhostReason === "VERSION_MISMATCH" ? (
                                                <div className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-2.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
                                                  <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">sports_esports</span>
                                                  <div className="flex flex-col min-w-0">
                                                    <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("required_version") || "REQUIRED"}</span>
                                                    <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{getHighestVersion(flavor.compatible_versions || renderedMod.compatible_versions || [])}</span>
                                                  </div>
                                                </div>
                                              ) : (
                                                missingPacks.map((p: string) => (
                                                  <div key={p} className="flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-2.5 rounded-lg">
                                                    <span className="material-symbols-outlined !text-[16px] text-[var(--danger)] shrink-0">currency_exchange</span>
                                                    <div className="flex flex-col min-w-0">
                                                      <span className="text-[8px] font-black text-[var(--danger)] opacity-70 uppercase tracking-widest">{t("missing_dlc") || "DLC"}</span>
                                                      <span className="text-[10px] font-mono font-black text-[var(--danger)] uppercase tracking-widest truncate">{mapDlcCode(p)}</span>
                                                    </div>
                                                  </div>
                                                ))
                                              )}
                                            </>
                                          ) : (
                                            drawerCasualties.map((r: any) => (
                                              <div key={r.hash || r.name} className="flex items-center gap-3 theme-glass-panel backdrop-blur-md border border-white/5 shadow-sm p-3 rounded-2xl">
                                                <span className={`material-symbols-outlined !text-[16px] shrink-0 ${isSwappedState ? 'theme-text-accent' : 'theme-text-danger'}`}>{isSwappedState ? 'swap_horiz' : (!isFlavorEquipped ? (t("icon_crisis_alert") || 'crisis_alert') : 'delete')}</span>
                                                <div className="flex flex-col min-w-0">
                                                  <span className={`text-[8px] font-black uppercase tracking-widest ${isSwappedState ? 'theme-text-accent opacity-70' : 'text-[var(--danger)] opacity-70'}`}>{isSwappedState ? (t("flavor_replaced") || "REPLACED") : (t("artifact_removed") || "REMOVED")}</span>
                                                  <span className={`text-[10px] font-mono font-black uppercase tracking-widest truncate ${isSwappedState ? 'theme-text-accent' : 'text-[var(--danger)]'}`}>{(r.displayName || r.name || "").replace(/_/g, " ")}</span>
                                                </div>
                                              </div>
                                            ))
                                          )}
                                        </div>

                                        {/* Footer Actions */}
                                        <div className="mt-auto w-full z-20 px-4 pb-4 pt-4 flex flex-row gap-2 shrink-0 border-t border-white/5 will-change-transform">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleInActiveSet(flavor.name, false);
                                              setDrawerConfirmHash(null);
                                            }}
                                            className={`flex-1 py-2.5 rounded-xl overflow-hidden border font-black text-[9px] uppercase tracking-widest active:scale-95  truncate px-1 ${isFlavorGhosted && !isFlavorEquipped ? "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)]" : isSwappedState ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" : "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)]"}`}
                                          >
                                            {isFlavorGhosted && !isFlavorEquipped ? t("btn_equip_anyway") : isSwappedState ? t("btn_swap_confirm") : t("btn_purge_confirm")}
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDrawerConfirmHash(null);
                                            }}
                                            className="flex-1 py-2.5 rounded-xl overflow-hidden border border-[color-mix(in_srgb,var(--safe)_50%,transparent)] bg-[color-mix(in_srgb,var(--safe)_10%,transparent)] text-[var(--safe)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--safe)_20%,transparent)] active:scale-95  truncate px-1"
                                          >
                                            {t("btn_safety")}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex flex-col overflow-hidden pr-2 text-left gap-1">
                                          <div className="flex items-center gap-2">
                                            {flavor.status && (
                                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border backdrop-blur-md shadow-sm ${flavor.status === (t("verified")) ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]" : flavor.status === (t("unverified")) ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"}`}>
                                                {flavor.status.replace(/_/g, ' ')}
                                              </span>
                                            )}
                                            <span className="text-[11px] text-[var(--text)] truncate font-bold uppercase group-hover/flavor:theme-text-accent transition-colors">
                                              {(
                                                flavor.displayName ||
                                                flavor.name.split("/").pop() ||
                                                ""
                                              )
                                                .replace(/_/g, " ")
                                                .replace(
                                                  getExtensionRegex(activeGameSchema),
                                                  "",
                                                )}
                                            </span>
                                          </div>
                                          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mt-1 uppercase tracking-widest flex items-center gap-2">
                                            {(flavor.relationshipType === 'beta' || (flavor.relationshipType !== 'core' && flavor.sub_type?.toLowerCase() === 'beta')) && <span className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] px-2 py-0.5 rounded text-[8px] font-black backdrop-blur-md shadow-sm">{t("badge_beta")}</span>}
                                            {((!flavor.relationshipType && flavor.sub_type?.toLowerCase() !== 'beta') || flavor.relationshipType === 'core') && <span className="bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] px-2 py-0.5 rounded text-[8px] font-black backdrop-blur-md shadow-sm">{t("badge_stable")}</span>}
                                            <span className="opacity-50">|</span>
                                            <span>{flavor.mod_versions?.[0]?.version_label || flavor.version || t("vlocal") || "V.LOCAL"}</span>
                                            <span className="opacity-50">|</span>
                                            <span>{flavor.name.toLowerCase().endsWith('.ts4script') ? 'SCRIPT' : 'PACKAGE'}</span>
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {drawerCasualties.length > 0 && (
                                            <div className="relative group/tooltip flex items-center">
                                              <div className="absolute bottom-full right-0 mb-2 hidden group-hover/tooltip:flex flex-col bg-black/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl z-50 w-max max-w-48">
                                                <span className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-1.5 border-b border-white/10 pb-1">
                                                  {isSwappedState ? (isBetaSwap ? t("badge_beta") : (t("flavor_swap") || "FLAVOR SWAP")) : isFlavorEquipped
                                                    ? t("yeet_cascade")
                                                    : t(
                                                      "vault_auto_removing",
                                                    )}
                                                </span>
                                                {drawerCasualties.map(
                                                  (r: any) => (
                                                    <span
                                                      key={r.hash || r.name}
                                                      className="text-[10px] text-[var(--text)] font-bold truncate leading-relaxed"
                                                    >
                                                      {(
                                                        r.displayName ||
                                                        r.name ||
                                                        ""
                                                      ).replace(/_/g, " ")}
                                                    </span>
                                                  ),
                                                )}
                                              </div>
                                            </div>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!isFlavorEquipped && isFlavorGhosted) {
                                                setDrawerConfirmHash(flavor.hash);
                                              } else if (
                                                drawerCasualties.length > 0
                                              ) {
                                                setDrawerConfirmHash(
                                                  flavor.hash,
                                                );
                                              } else {
                                                toggleInActiveSet(
                                                  flavor.name,
                                                );
                                              }
                                            }}
                                            className={`relative w-8 h-8 flex items-center justify-center font-black rounded-xl overflow-hidden backdrop-blur-md border transition-all shadow-xl ${isFlavorEquipped ? "bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] rotate-45 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110" : isSwappedState ? "bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:scale-110" : "bg-[color-mix(in_srgb,var(--success)_5%,transparent)] border-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:scale-110"}`}
                                          >
                                            {(isFlavorGhosted || isSwappedState) && !isConfirming && (
                                              <HoverTooltip
                                                className="z-50 !right-0 !translate-x-0 !left-auto"
                                                bgClass="!bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] !backdrop-blur-3xl"
                                                variant={(isFlavorGhosted && !isSwappedState) ? "danger" : isSwappedState ? "accent" : "warning"}
                                                title={isSwappedState ? (isBetaSwap ? t("badge_beta") : (t("flavor_swap") || "FLAVOR SWAP")) : hasMissingDeps ? t("missing_artifacts") : flavorGhostReason === "VERSION_MISMATCH" ? t("unsupported_version") : t("missing_dlc")}
                                                subtitle={isSwappedState
                                                  ? formatDisplayName(drawerCasualties[0]?.name || drawerCasualties[0] || "") + (drawerCasualties.length > 1 ? ` (+${drawerCasualties.length - 1})` : "")
                                                  : hasMissingDeps
                                                    ? formatDisplayName(typeof flavor.missingReqs[0] === 'string' ? flavor.missingReqs[0] : (flavor.missingReqs[0]?.name || flavor.missingReqs[0]?.id || '')) + (flavor.missingReqs.length > 1 ? ` (+${flavor.missingReqs.length - 1})` : "")
                                                    : flavorGhostReason === "VERSION_MISMATCH"
                                                      ? (
                                                        <>
                                                          <div className="w-full truncate">Required: {getHighestVersion(flavor.compatible_versions || renderedMod.compatible_versions || [])}</div>
                                                          <div className="w-full truncate">Current: {selectedVersion || "Unknown"}</div>
                                                        </>
                                                      )
                                                      : missingPacks.map((p: string) => mapDlcCode(p)).join(", ")}
                                              />
                                            )}
                                            {isFlavorGhosted && !isFlavorEquipped && !isSwappedState
                                              ? <span className="material-symbols-outlined !text-[14px]">{flavorGhostReason === "VERSION_MISMATCH" ? "hourglass_empty" : hasMissingDeps ? "extension" : "block"}</span>
                                              : isSwappedState
                                                ? <span className="material-symbols-outlined !text-[16px]">swap_horiz</span>
                                                : <span className="material-symbols-outlined !text-[20px]">{t("icon_add")}</span>}
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            },
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-4 mb-24">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-6 py-3 theme-glass-inner rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
            >
              {t("nav_prev")}
            </button>
            <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-6 py-3 theme-glass-inner rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
            >
              {t("nav_next")}
            </button>
          </div>
        )}
        {/* quarantineList.length > 0 && (
          <div
            id="quarantine-zone"
            className="mt-12 p-10 theme-panel-danger border rounded-[var(--radius)] space-y-6 animate-in slide-in-from-bottom-8"
          >
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h3 className="theme-text-danger font-black tracking-tighter text-3xl uppercase leading-none flex items-center gap-3">
                {t("quarantine_title")}
              </h3>
              <p className="theme-text-danger opacity-80 font-bold text-[10px] uppercase tracking-widest pl-12">
                {t("quarantine_desc")}
              </p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 mt-6">
              {quarantineList.map((filename: string) => (
                <div
                  key={filename}
                  className="theme-glass-inner p-5 rounded-[var(--radius)] flex flex-col justify-between group hover:theme-border-danger transition-colors"
                >
                  <span
                    className="text-xs font-mono text-[var(--subtext)] opacity-80 truncate mb-4"
                  >
                    {filename}
                  </span>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => restoreMod(filename)}
                      className="flex-1 px-4 py-2 bg-[var(--success)] !text-black border-none border rounded-xl overflow-hidden"
                    >
                      {t("btn_restore")}
                    </button>
                    <button
                      onClick={() => purgeMod(filename)}
                      className="flex-1 px-4 py-2 theme-panel-danger theme-btn-danger border rounded-xl overflow-hidden"
                    >
                      {t("purge")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) */}
      </div>
      {isBulkMode && createPortal(
        <div className="fixed bottom-16 right-0 z-[3000] pointer-events-none flex justify-center items-end" style={{ left: 'var(--sidebar-width, 288px)' }}>
          <div className="theme-glass-panel backdrop-blur-3xl px-8 py-4 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_100px_rgba(0,0,0,0.8)] pointer-events-auto flex items-center gap-4 transition-all animate-in slide-in-from-bottom-10">
            <button
              onClick={() => setIsBulkMode(false)}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2 relative z-10"
            >
              <span className="material-symbols-outlined !text-[24px]">{t("icon_cancel")}</span>
              {t("nav_cancel")}
            </button>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <div className="flex flex-col items-center justify-center gap-1 px-4 min-w-[100px]">
              <span className="text-[var(--text)] font-black text-xl leading-none">{selectedMods.length}</span>
              <span className="text-[var(--text)] font-black text-[9px] tracking-[0.2em] opacity-80 leading-none mr-[-0.2em]">{t("shared_selected")}</span>
            </div>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <button
              onClick={() => setBulkModal(true)}
              disabled={selectedMods.length === 0}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--accent-rgb),0.2)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_architecture")}</span>
              {t("status_draft_blueprint")}
            </button>

            <button
              onClick={() => setLocalFolderModal(true)}
              disabled={selectedMods.length === 0}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--success-rgb),0.2)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_create_new_folder")}</span>
              {t("btn_group_folder")}
            </button>

            <div className="w-px h-8 bg-white/10 relative z-10" />

            <button
              disabled={selectedMods.length === 0}
              onClick={() => {
                const allFilesToPurge = new Set<string>();
                selectedMods.forEach((modName: string) => {
                  const mod = displayModList.find((m: any) => m.name === modName);
                  if (mod && mod.isVirtual && mod.flavors) {
                    mod.flavors.forEach((f: any) => {
                      if (f.name) allFilesToPurge.add(f.name);
                    });
                  } else {
                    allFilesToPurge.add(modName);
                  }
                });
                setPurgeTargetFiles(Array.from(allFilesToPurge));
              }}
              className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--danger-rgb),0.2)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[28px]">{t("icon_delete_forever")}</span>
              {t("btn_purge_folder")}
            </button>
          </div>
        </div>, document.body
      )}
      {purgeTargetFiles && createPortal(
        <>
          <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-500 transition-all" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setPurgeTargetFiles(null)} />
          <div className="fixed top-0 right-0 bottom-10 w-full max-w-xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl flex flex-col z-[15001] animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPurgeTargetFiles(null)}
              className="absolute top-12 right-6 z-50 w-12 h-12 bg-black/40 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--text)]/70 hover:text-[var(--danger)] rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110 active:scale-95"
            >
              <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
            </button>

            <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
              <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                <span className="material-symbols-outlined text-[var(--danger)] !leading-none translate-y-6" style={{ fontSize: '100px' }}>{t("icon_delete_forever")}</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent pointer-events-none" />
            </div>

            <div className="px-10 pt-8 pb-4 relative shrink-0">
              <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{(!isBulkMode || selectedMods.length === 0) ? (t("btn_purge_folder")) : (t("btn_purge_selected"))}</h3>
              <p className="text-[10px] font-black text-[var(--danger)] opacity-80 uppercase tracking-widest mt-2 whitespace-pre-wrap leading-relaxed">
                {t("confirm_mass_purge_archive")}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4">
                {purgeTargetFiles.map((filename) => (
                  <div key={filename} className="group relative flex flex-col items-start p-4 rounded-[var(--radius)] border transition-all hover:scale-[1.02] hover:shadow-2xl backdrop-blur-md theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                    <div className="flex flex-col min-w-0 pr-12 w-full">
                      <span className="text-[11px] font-black text-[var(--text)] uppercase truncate group-hover:text-[var(--danger)] transition-colors">
                        {formatDisplayName(filename, t)}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-2 shrink-0">
                          <span>{filename.toLowerCase().endsWith('.ts4script') ? 'SCRIPT' : filename.toLowerCase().endsWith('.zip') ? 'ARCHIVE' : 'PACKAGE'}</span>
                          <span className="opacity-50">ΓÇó</span>
                          <span>{t("vlocal")}</span>
                        </span>
                      </div>
                    </div>
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 w-10 h-10 shrink-0 rounded-[var(--radius)] flex items-center justify-center font-black transition-all shadow-lg backdrop-blur-md border bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                      <span className="material-symbols-outlined !text-[20px]">{t("icon_delete_forever")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-8 pb-8 pt-4 flex justify-center items-center gap-4 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <button
                onClick={async () => {
                  setStatus(t("status_purging_artifacts"));
                  try {
                    const config: any = await invoke("get_saved_coordinates");
                    const msg = await invoke("purge_vault_artifacts", {
                      vaultPath: config.vault_path,
                      filenames: purgeTargetFiles,
                    });
                    setStatus(`${t("icon_check_circle")} ${msg}`);
                    setIsBulkMode(false);
                    setSelectedMods([]);
                    setPurgeTargetFiles(null);
                    runRadarSweep(false);
                  } catch (err) {
                    setStatus(`${t("status_error")}${err}`);
                  }
                }}
                className={`px-16 py-4 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 ${standardDangerButtonClass}`}
              >
                <span className="material-symbols-outlined !text-[18px]">{t("icon_delete_forever")}</span>
                {t("confirm_purge")}
              </button>
            </div>
          </div>
        </>, document.body
      )}

      <VaultToolsSidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        playSets={playSets}
        activePlaySetIndex={props.activePlaySetIndex}
        setActivePlaySetIndex={props.setActivePlaySetIndex}
        equipPlaySet={equipPlaySet}
        runRadarSweep={runRadarSweep}
        isBulkMode={isBulkMode}
        setIsBulkMode={setIsBulkMode}
        finalVisibleMods={finalVisibleMods}
        selectedMods={selectedMods}
        setSelectedMods={setSelectedMods}
        equipFilter={equipFilter}
        setPurgeTargetFiles={setPurgeTargetFiles}
        activeLocalFolder={activeLocalFolder}
        setActiveLocalFolder={setActiveLocalFolder}
        setIsLocalFolderEditorOpen={setIsLocalFolderEditorOpen}
      />

      <VaultLocalFolderEditorSidePanel
        isOpen={isLocalFolderEditorOpen}
        onClose={() => { setIsLocalFolderEditorOpen(false); setConfirmDeleteId(null); setRenameFolderInput(""); }}
        activeLocalFolder={activeLocalFolder}
        setActiveLocalFolder={setActiveLocalFolder}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        renameFolderInput={renameFolderInput}
        setRenameFolderInput={setRenameFolderInput}
        runRadarSweep={runRadarSweep}
        displayModList={displayModList}
      />

      {activeTier3Conflict && (
        <div className="z-[9999] relative">
          <ConflictResolutionSidebar
            conflict={activeTier3Conflict}
            onClose={() => setActiveTier3Conflict(null)}
            onVault={() => { }}
            onOverride={(winnerName, modPair) => {
              applyConflictOverride(winnerName, modPair, playSets[activePlaySetIndex]?.name);
            }}
          />
        </div>
      )}
    </div>
  );
});

export default Vault;
