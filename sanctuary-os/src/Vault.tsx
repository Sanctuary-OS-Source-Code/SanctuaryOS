import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, CustomDropdown, formatDisplayName, isVersionMatch, getHighestVersion, getLowestVersion, mapDlcCode, HubTabButton, standardButtonClass, standardDangerButtonClass, standardSuccessButtonClass, SidePanel, SidebarActionButton , getFileLabel, isSupportedExtension, getExtensionRegex, HoverTooltip, EmptyState} from "./shared";
import { useLexicon } from './LexiconContext';
import { invoke } from '@tauri-apps/api/core';
import { ModCard } from './ModCard';
import { useStore } from './store';
import { VaultToolsSidePanel, VaultLocalFolderEditorSidePanel } from './side-panels/VaultSidePanels';
export default function Vault(props: any) {
  const [isSidePanelOpen, setIsSidePanelOpen] = React.useState(false);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
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
    return displayModList.filter((m: any) => activeSetModsMemo.includes(m.name));
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

  const modListIndex = React.useMemo(() => {
    const byDbId = new Map();
    const byHash = new Map();
    const byInterchangeableId = new Map();
    const namesAndDisplayNames: { name: string, displayNameUpper: string, displayNameSpaced: string, orig: any, hash: string }[] = [];

    let hasMcCmdPkg = false;
    let hasMcCmdScript = false;

    modList.forEach((ml: any) => {
      if (!ml.isVirtual) {
        if (ml.dbId) byDbId.set(String(ml.dbId), ml);
        if (ml.hash) byHash.set(ml.hash, ml);
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

    return { byDbId, byHash, byInterchangeableId, namesAndDisplayNames, mcCmdCenter: { hasPkg: hasMcCmdPkg, hasScript: hasMcCmdScript } };
  }, [modList]);


  const finalVisibleMods = visibleMods.filter((mod: any) => {
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

    if (equipFilter === "DEV") {
      if (!mod.hash?.startsWith('dev_vault_')) return false;
    }

    if (equipFilter === "ARCHIVES") {
      if (isCompatibleWithOS) return false;
      if (archiveVersionFilter && archiveVersionFilter !== "") {
        let highestArchiveVer = "0.0.0";
        if (mod.isVirtual) {
          const highestPerFlavor = (mod.flavors || []).map((f: any) => {
            const v = f.compatible_versions;
            const arr = typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
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
      const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
      const isEquipped = mod.isParent
        ? (() => {
            const anchor = mod.dbId || mod.familyId;
            if (mod.isFlavorFolder) {
              return (mod.flavors || []).some((f: any) =>
                activeSetMods.includes(f.name),
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
              activeSetMods.includes(f.name),
            );
          })()
        : activeSetMods.includes(mod.name);

      if (equipFilter === "EQUIPPED" && !isEquipped) return false;
      if (equipFilter === "UNEQUIPPED") {
        if (mod.isParent) {
          const allEquipped = mod.flavors?.every((f: any) => activeSetMods.includes(f.name));
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

  const totalPages = Math.max(1, Math.ceil(finalVisibleMods.length / itemsPerPage));
  const paginatedMods = finalVisibleMods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  return (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 relative">
            <div className="flex flex-col gap-8 animate-in fade-in duration-700">
              <ViewHeader
                title={t("vault_title")}
                subtitle={t("vault_subtitle")}
                icon={t("icon_account_balance")}
                iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
              >
                <div className="flex flex-wrap gap-4 items-center justify-end">
                  <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
                    <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                      <span className="material-symbols-outlined text-xl normal-case">{t("icon_tune")}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_tools")}</span>
                    </button>
                  </div>
                </div>
              </ViewHeader>
              
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
                  <HubTabButton id="ALL" icon="inventory_2" label={t("filter_all_vault")} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="EQUIPPED" icon="check_circle" label={t("filter_equipped")} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="UNEQUIPPED" icon="cancel" label={t("filter_unequipped")} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="DEV" icon="code" label={t("filter_dev") || "DEV"} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="ARCHIVES" icon="archive" label={t("filter_archives")} activeTab={equipFilter} setTab={setEquipFilter} />
                </div>
              </div>

              <div className="theme-glass-panel p-6 rounded-[var(--radius)] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20">
                
                <div className="flex-1 min-w-[250px] relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
                    <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("icon_search")}</span>
                  </div>
                  <input
                    type="text"
                    placeholder={t("vault_search")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full theme-glass-inner rounded-[var(--radius)] pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                  />
                </div>

                <div className="w-max min-w-[180px] max-w-[320px]">
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
                    <div className="w-max min-w-[180px] max-w-[320px] animate-in fade-in slide-in-from-right-4">
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

                <div className="w-max min-w-[180px] max-w-[320px]">
                  <CustomDropdown disableTint={true}
                    value={filterStatus}
                    onChange={(val: string[]) => setFilterStatus(val[0])}
                    options={[
                      { id: "ALL", label: t("ql_all") },
                      { id: "VERIFIED", label: t("status_verified") },
                      { id: "REVIEW", label: t("status_under_review") },
                      { id: "UNVERIFIED", label: t("status_unverified") }
                    ]}
                  />
                </div>

                {equipFilter === "ARCHIVES" && (
                  <div className="w-max min-w-[180px] max-w-[320px]">
                    {(() => {
                      const archiveOptionsRaw = Array.from(new Set(displayModList.flatMap((m: any) => {
                        const getVersions = (target: any) => {
                          const v = target.compatible_versions;
                          return typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
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
                      className={`h-[42px] px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border shadow-lg hover:scale-[1.02] active:scale-95 ${
                        hideGhostCards 
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-8 pl-2">
                {paginatedMods.length === 0 ? (
                  <EmptyState icon="search_off" title={t("vault_no_results")} subtitle={t("vault_no_results_sub")} className="col-span-full py-24" />
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
                              activeSetMods.includes(f.name),
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
                            activeSetMods.includes(f.name),
                          );
                        })()
                      : activeSetMods.includes(mod.name);
                    const getDeepCasualties = (targetMods: any[]) => {
                      let queue = [...targetMods];
                      let seen = new Set<string>();
                      let result: string[] = [];
                      if (!isEquipped) {
                        const mData = mod;
                        if (mData?.requirements) {
                          mData.requirements.forEach((reqId: any) => {
                            const isSatisfied = activeSetMods.some(
                              (n: string) => {
                                const match = modListIndex.namesAndDisplayNames.find((nEntry: any) => nEntry.name === n)?.orig;
                                return (
                                  match && String(match.dbId) === String(reqId)
                                );
                              },
                            );
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
                        const dependents = equippedDisplayMods.filter(
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
                                String(current.familyId || current.dbId) &&
                                m.relationshipType === "addon" &&
                                current.relationshipType !== "addon"))
                        );
                        queue.push(...dependents);
                      }
                      return [...new Set(result)];
                    };
                    let casualties: string[] = [];
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
                          casualties = [...casualties, ...getDeepCasualties(rivals)];
                        }
                      } else if (mod.flavorGroupId) {
                        const rivals = equippedDisplayMods.filter(
                          (m: any) =>
                            String(m.flavorGroupId) ===
                              String(mod.flavorGroupId) &&
                        m.name !== mod.name
                        );
                        casualties = [...casualties, ...getDeepCasualties(rivals)];
                      }
                      
                      const checkConflicts = (mObj: any) => {
                         if (mObj.conflicts && mObj.conflicts.length > 0) {
                             const conflictCasualties = mObj.conflicts.filter((c: any) => c.severity_rank === 4).map((c: any) => {
                                const matchName = activeSetMods.find((n: string) => {
                                   const mData = modListIndex.namesAndDisplayNames.find((ne: any) => ne.name === n)?.orig;
                                   if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                                   if (c.enemy_name) {
                                      const targetClean = c.enemy_name.toUpperCase();
                                      const cleanN = n.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                                      if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                                   }
                                   return false;
                                });
                                if (matchName) {
                                    const mData = modListIndex.namesAndDisplayNames.find((ne: any) => ne.name === matchName)?.orig;
                                    return mData ? { name: mData.displayName || matchName, note: c.conflict_note || c.resolution_note || "" } : { name: matchName, note: c.conflict_note || c.resolution_note || "" };
                                }
                                return null;
                             }).filter(Boolean);
                             if (conflictCasualties.length > 0) {
                                casualties = [...casualties, ...conflictCasualties];
                             }
                         }
                      };
                      
                      checkConflicts(mod);
                      if (mod.isVirtual && mod.flavors) {
                          mod.flavors.forEach(checkConflicts);
                      }
                      
                      casualties = Array.from(new Map(casualties.map((item: any) => [item.name || item, item])).values());
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

                      const requiresMcCmd = m.twins?.some((t: any) => (t.name || "").toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER") || String(t.id) === "1000") || 
                                            m.requirements?.some((r: any) => (r.name || "").toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER") || String(r.id) === "1000");
                      if (requiresMcCmd || (m.displayName && m.displayName.toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER")) || (m.name && m.name.toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER"))) {
                         if (!modListIndex.mcCmdCenter.hasPkg || !modListIndex.mcCmdCenter.hasScript) {
                           pushMissing("MC CMD CENTER CORE");
                         }
                      }


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
                    
                    const tier3List: any[] = [];
                    
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
                                {t("folder_prefix")}{" "}
                                <span className="theme-text-accent">
                                  {renderedMod.displayName}
                                </span>
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const flavorsToEquip = (renderedMod.flavors || []).filter((f: any) => {
                                    if (activeSetMods.includes(f.name)) return false;
                                    let flavorDLC = f.requiredDLC || [];
                                    if (typeof flavorDLC === 'string') flavorDLC = flavorDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
                                    const missingPacks = flavorDLC.filter((p: string) => !ownedDLC.includes(p) || maskedDLC.includes(p));
                                    const hasMissingDeps = f.missingReqs && f.missingReqs.length > 0;
                                    const isGameVersionMismatch = (f.compatible_versions && f.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(f.compatible_versions, selectedVersion)) || (renderedMod.compatible_versions && renderedMod.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(renderedMod.compatible_versions, selectedVersion));
                                    return !(missingPacks.length > 0 || hasMissingDeps || f.isGhosted || isGameVersionMismatch);
                                  });
                                  flavorsToEquip.forEach((f: any) => {
                                    toggleInActiveSet(f.name, false, false, true);
                                  });
                                }}
                                className="h-10 px-4 rounded-xl theme-glass-inner flex items-center justify-center gap-2 text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] transition-all font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105"
                              >
                                <span className="material-symbols-outlined !text-[18px]">{t("icon_check_circle")}</span> {t("btn_equip_all")}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                    const rivals = mod.isFlavorFolder
                                      ? (renderedMod.flavors || []).filter(
                                          (f: any) =>
                                            f.name !== flavor.name &&
                                            activeSetMods.includes(f.name),
                                        )
                                      : [];
                                    drawerCasualties =
                                      getDrawerDeepCasualties(rivals);
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
                                  let flavorDLC = flavor.requiredDLC || [];
                                  if (typeof flavorDLC === 'string') flavorDLC = flavorDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
                                  const missingPacks = flavorDLC.filter((p: string) => !ownedDLC.includes(p) || maskedDLC.includes(p));
                                  const hasMissingDeps = flavor.missingReqs && flavor.missingReqs.length > 0;
                                  
                                  const flavorVersionMismatch = (flavor.compatible_versions && flavor.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(flavor.compatible_versions, selectedVersion)) || (renderedMod.compatible_versions && renderedMod.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(renderedMod.compatible_versions, selectedVersion));
                                  const flavorGhostReason = flavor.ghostReason || (flavorVersionMismatch ? "VERSION_MISMATCH" : null) || (renderedMod.ghostReason === "VERSION_MISMATCH" ? "VERSION_MISMATCH" : null);
                                  const isFlavorGhosted = missingPacks.length > 0 || hasMissingDeps || flavor.isGhosted || flavorGhostReason === "VERSION_MISMATCH";
                                  
                                  const isConfirming = drawerConfirmHash === flavor.hash;
                                  return (
                                    <div className="relative group/flavorshadow hover:z-50" key={`sub-${flavor.hash}-${subIdx}`}>
                                      {isFlavorGhosted && !isConfirming && (
                                        <HoverTooltip 
                                          className="group-hover/flavorshadow:flex"
                                          variant="danger"
                                          title={hasMissingDeps ? t("missing_artifacts") : flavorGhostReason === "VERSION_MISMATCH" ? t("unsupported_version") : t("missing_dlc")}
                                          subtitle={hasMissingDeps 
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
                                    <div
                                      className={`p-3 border rounded-xl relative flex transition-all cursor-pointer min-h-[56px] ${isConfirming ? "bg-transparent border-transparent flex-col items-stretch p-0" : isFlavorGhosted && !isFlavorEquipped ? "bg-red-950/20 border-[var(--danger)]/30 hover:border-[var(--danger)]/50 opacity-50 grayscale" : "theme-glass-inner shadow-sm hover:shadow-md hover:scale-[1.02] hover:theme-border-accent"} ${isConfirming ? "" : "items-center justify-between"}`}
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
                                            className="w-full flex flex-col rounded-[var(--radius)] border theme-glass-panel p-5 animate-in fade-in zoom-in-95 shadow-2xl border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]"
                                          >
                                          {isFlavorGhosted && !isFlavorEquipped ? (
                                            <>
                                              <div className="flex items-center gap-2 mb-3 shrink-0">
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">
                                                    {t("missing_deps")}
                                                  </span>
                                                  <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                    {t("proceed_caution")}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                {hasMissingDeps ? (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("vault_missing_artifacts")}</p>
                                                    {flavor.missingReqs.map((req: any) => {
                                                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                                                      const reqUrl = typeof req === 'string' ? null : req.url;
                                                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "") || reqIdStr;
                                                      const searchUrl = reqUrl || `https://www.google.com/search?q=${encodeURIComponent(activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(cleanName)}`;
                                                      return (
                                                        <a 
                                                          key={reqIdStr} 
                                                          href="#" 
                                                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-white/10 transition-colors cursor-pointer" 
                                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                                                        >
                                                          <span className="truncate">{cleanName}</span>
                                                          <span className="material-symbols-outlined !text-[14px] opacity-70">{reqUrl ? (t("icon_download")) : (t("icon_search"))}</span>
                                                        </a>
                                                      );
                                                    })}
                                                  </>
                                                ) : flavorGhostReason === "VERSION_MISMATCH" ? (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("unsupported_version")}</p>
                                                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex flex-col gap-1 mb-1">
                                                      <span>{t("game_versions")}: {([] as string[]).concat(flavor.compatible_versions || renderedMod.compatible_versions || []).join(", ") || t("shared_version_unknown") || "v.Unknown"}</span>
                                                    </div>
                                                  </>
                                                ) : (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("vault_missing_dlc")}</p>
                                                    {missingPacks.map((p: string) => (
                                                      <div key={p} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-1">
                                                        {mapDlcCode(p)}
                                                      </div>
                                                    ))}
                                                  </>
                                                )}
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div className="flex items-center gap-2 mb-3 shrink-0">
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">
                                                    {t("yeet_cascade")}
                                                  </span>
                                                  <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                    {t("protocol_override")}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">
                                                  {t("artifacts_removed")}
                                                </p>
                                                {drawerCasualties.map((r: any) => (
                                                  <div
                                                    key={r.hash || r.name}
                                                    className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex items-center gap-2"
                                                  >
                                                    {(r.displayName || r.name || "").replace(/_/g, " ")}
                                                  </div>
                                                ))}
                                              </div>
                                            </>
                                          )}
                                          <div className="flex gap-2 pt-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleInActiveSet(flavor.name, false);
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:scale-105 transition-all shadow-lg"
                                            >
                                              {t("modcard_btn_proceed")}
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-105 transition-all shadow-lg"
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
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border backdrop-blur-md shadow-sm ${flavor.status === (t("status_verified")) ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]" : flavor.status === (t("status_unverified")) ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"}`}>
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
                                                    {isFlavorEquipped
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
                                              className={`w-8 h-8 flex items-center justify-center font-black rounded-xl backdrop-blur-md border transition-all shadow-xl ${isFlavorEquipped ? "bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] rotate-45 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110" : "bg-[color-mix(in_srgb,var(--success)_5%,transparent)] border-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:scale-110"}`}
                                            >
                                              {isFlavorGhosted && !isFlavorEquipped
                                                ? <span className="material-symbols-outlined !text-[14px]">{flavorGhostReason === "VERSION_MISMATCH" ? "hourglass_empty" : hasMissingDeps ? "extension" : "block"}</span>
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
                <div className="flex justify-center items-center gap-4 mt-4 mb-12">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_prev")}
                  </button>
                  <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                    {currentPage} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_next")}
                  </button>
                </div>
              )}
              {quarantineList.length > 0 && (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
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
                            className="flex-1 px-4 py-2 bg-[var(--success)] !text-black border-none border rounded-xl"
                          >
                            {t("btn_restore")}
                          </button>
                          <button
                            onClick={() => purgeMod(filename)}
                            className="flex-1 px-4 py-2 theme-panel-danger theme-btn-danger border rounded-xl"
                          >
                            {t("ui_btn_purge")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
              {isBulkMode && createPortal(
                <div className="fixed bottom-16 right-0 z-[3000] pointer-events-none flex justify-center items-end" style={{ left: 'var(--sidebar-width, 288px)' }}>
                  <div className="theme-glass-panel backdrop-blur-3xl px-8 py-4 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_100px_rgba(0,0,0,0.8)] pointer-events-auto flex items-center gap-4 transition-all animate-in slide-in-from-bottom-10">
                    <button
                      onClick={() => setIsBulkMode(false)}
                      className="h-12 px-6 rounded-[var(--radius)] font-black uppercase tracking-widest transition-all text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2 relative z-10"
                    >
                      <span className="material-symbols-outlined !text-[24px]">{t("icon_cancel")}</span>
                      {t("shared_cancel")}
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
            </div>
  );
}

