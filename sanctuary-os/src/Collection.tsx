import React from 'react';
import { createPortal } from 'react-dom';
import { ViewHeader, CustomDropdown, formatDisplayName, isVersionMatch, getHighestVersion, mapDlcCode, HubTabButton, standardButtonClass, standardDangerButtonClass, standardSuccessButtonClass, SidePanel, SidebarActionButton } from './shared';
import { useLexicon } from './LexiconContext';
import { invoke } from '@tauri-apps/api/core';
import { ModCard } from './ModCard';
import { useStore } from './store';
export default function Collection(props: any) {
  const [isSidePanelOpen, setIsSidePanelOpen] = React.useState(false);
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

    if (equipFilter === "ARCHIVES") {
      if (isCompatibleWithOS) return false;
      if (archiveVersionFilter && archiveVersionFilter !== "") {
        let highestArchiveVer = "0.0.0";
        if (mod.isVirtual) {
          const allVers = (mod.flavors || []).flatMap((f: any) => {
            const v = f.compatible_versions;
            return typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
          });
          highestArchiveVer = getHighestVersion(allVers);
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
          // For virtual folders on UNEQUIPPED tab, show them if ANY flavor is NOT equipped
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
                title={t("vault_title") || "Your Vault"}
                subtitle={t("vault_subtitle") || "Local library, secured assets, and installed artifacts"}
                icon={t("ui_icon_architect") || "account_balance"}
                iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
              >
                <div className="flex flex-wrap gap-4 items-center justify-end">

                  <div className="flex items-center theme-glass-panel rounded-2xl p-1 border border-white/10 shadow-inner">
                    <button onClick={() => setIsSidePanelOpen(true)} className="h-12 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black">
                      <span className="material-symbols-outlined text-xl normal-case">{t("ui_icon_tune") || "tune"}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest">{t("ui_btn_tools") || "TOOLS"}</span>
                    </button>
                  </div>
                </div>
              </ViewHeader>
              
              {/* Main Tabs & Assets Toolbar */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-1 overflow-x-auto accent-scrollbar p-1 theme-glass-panel rounded-2xl border border-white/5 shadow-inner shrink-0">
                  <HubTabButton id="ALL" icon="inventory_2" label={t("vault_filter_all_vault") || "Main"} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="EQUIPPED" icon="check_circle" label={t("vault_filter_equipped") || "In Blueprint"} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="UNEQUIPPED" icon="cancel" label={t("vault_filter_unequipped") || "Not Equipped"} activeTab={equipFilter} setTab={setEquipFilter} />
                  <HubTabButton id="ARCHIVES" icon="archive" label={t("vault_filter_archives") || "ARCHIVES"} activeTab={equipFilter} setTab={setEquipFilter} />
                </div>
              </div>

              {/* Filter Row */}
              <div className="theme-glass-panel p-6 rounded-[2rem] shadow-xl border border-white/10 mb-8 animate-in slide-in-from-top-4 duration-500 flex flex-wrap gap-4 items-center relative z-20">
                
                {/* Search Bar */}
                <div className="flex-1 min-w-[250px] relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)] text-lg flex items-center justify-center">
                    <span className="material-symbols-outlined !text-[20px] drop-shadow-md">{t("ui_icon_search") || "search"}</span>
                  </div>
                  <input
                    type="text"
                    placeholder={t("vault_search") || "Search artifacts..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full theme-glass-inner rounded-2xl pl-12 pr-5 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent transition-all shadow-inner"
                  />
                </div>

                {/* Classification Dropdown */}
                <div className="w-[180px]">
                  <CustomDropdown disableTint={true}
                    value={activeCategory}
                    onChange={(val: string[]) => { setActiveCategory(val[0]); setActiveSubType("ALL"); }}
                    options={[
                      { id: "ALL", label: t("vault_cat_all") || "ALL" },
                      { id: "CAS", label: t("vault_cat_cas") || "CAS" },
                      { id: "BuildBuy", label: t("vault_cat_buildbuy") || "BuildBuy" },
                      { id: "Script", label: t("vault_cat_script") || "Script" },
                      { id: "Animation", label: t("vault_cat_animation") || "Animation" }
                    ]}
                  />
                </div>

                {/* CAS Sub-Category Dropdown */}
                {activeCategory === "CAS" && (
                  <div className="w-[180px] animate-in fade-in slide-in-from-right-4">
                    <CustomDropdown disableTint={true}
                      value={activeSubType}
                      onChange={(val: string[]) => setActiveSubType(val[0])}
                      options={[
                        { id: "ALL", label: t("vault_sub_all") || "ALL" },
                        { id: "Tattoo", label: t("vault_sub_tattoo") || "Tattoo" },
                        { id: "Hair", label: t("vault_sub_hair") || "Hair" },
                        { id: "Clothing", label: t("vault_sub_clothing") || "Clothing" }
                      ]}
                    />
                  </div>
                )}

                {/* Verification Dropdown */}
                <div className="w-[180px]">
                  <CustomDropdown disableTint={true}
                    value={filterStatus}
                    onChange={(val: string[]) => setFilterStatus(val[0])}
                    options={[
                      { id: "ALL", label: t("vault_filter_tag_all") || "ALL" },
                      { id: "VERIFIED", label: t("vault_filter_tag_verified") || "VERIFIED" },
                      { id: "REVIEW", label: t("vault_filter_tag_review") || "UNDER REVIEW" },
                      { id: "UNVERIFIED", label: t("vault_filter_tag_unverified") || "UNVERIFIED" }
                    ]}
                  />
                </div>

                {/* Archive Version Dropdown */}
                {equipFilter === "ARCHIVES" && (
                  <div className="w-[180px]">
                    {(() => {
                      const archiveOptionsRaw = Array.from(new Set(displayModList.flatMap((m: any) => {
                        const getVersions = (target: any) => {
                          const v = target.compatible_versions;
                          return typeof v === 'string' ? v.split(',').map((s:string) => s.trim()) : (v || []);
                        };
                        let versions: string[] = [];
                        if (m.isVirtual) {
                          versions = (m.flavors || []).flatMap((f: any) => getVersions(f));
                        } else {
                          versions = getVersions(m);
                        }
                        
                        if (selectedVersion && selectedVersion !== "") {
                           if (isVersionMatch(versions, selectedVersion)) return [];
                        }
                        const highest = getHighestVersion(versions);
                        return [highest];
                      }).filter(Boolean)));
                      
                      const archiveOptions = (archiveOptionsRaw as string[])
                        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                        .map(v => ({ id: v, label: v === "Unknown" ? t("status_unknown") : v }));
                        
                      const activeVal = archiveVersionFilter && archiveOptions.some(o => o.id === archiveVersionFilter) 
                        ? archiveVersionFilter 
                        : (archiveOptions[0]?.id || "");

                      // Auto-update filter if it's empty but we have options
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
                          placeholder={t("vault_filter_archive_version") || "ARCHIVE VERSION"}
                          multiSelect={false}
                        />
                      );
                    })()}
                  </div>
                )}

                  {/* Hide Ghosts Toggle */}
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
                      {t("vault_btn_hide_ghosts") || "ONLY SHOW ELIGIBLE"}
                    </button>
                  )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-8">
                {paginatedMods
                  .map((mod: any, index: number) => {
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
                                const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
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
                      
                      // Inject Tier 4 Conflicts
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
                          const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
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
                          
                          if (match && match.hash === m.hash) match = null; // not self
                          
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
                          <div className="col-span-full theme-glass-panel rounded-[3rem] p-8 my-4">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="text-xl font-black text-[var(--text)] uppercase">
                                {t("vault_folder_prefix") || "Collection:"}{" "}
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
                                <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_check_circle") || "check_circle"}</span> {t("vault_btn_equip_all") || "EQUIP ALL"}
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
                                                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
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
                                    <div
                                      key={`sub-${flavor.hash}-${subIdx}`}
                                      className={`p-3 border rounded-xl relative flex transition-all cursor-pointer min-h-[56px] group/flavorshadow ${isConfirming ? "bg-transparent border-transparent flex-col items-stretch p-0" : isFlavorGhosted && !isFlavorEquipped ? "bg-red-950/20 border-[var(--danger)]/30 hover:border-[var(--danger)]/50 opacity-50 grayscale" : "theme-glass-inner shadow-sm hover:shadow-md hover:scale-[1.02] hover:theme-border-accent"} ${isConfirming ? "" : "items-center justify-between"}`}
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
                                      {isFlavorGhosted && !isConfirming && (
                                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-[70] hidden group-hover/flavorshadow:flex flex-col items-center justify-center theme-glass-panel backdrop-blur-3xl border px-4 py-3 rounded-2xl whitespace-nowrap max-w-[280px] pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 overflow-hidden border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-[0_10px_50px_rgba(220,38,38,0.2)]">
                                            <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent opacity-50 z-0 pointer-events-none" />
                                            <div className="relative z-10 flex flex-col items-center">
                                              <div className="text-[9px] font-black uppercase opacity-90 mb-0.5 text-[var(--danger)]">
                                                {hasMissingDeps ? (t("modcard_missing_artifacts") || "Missing Artifacts") : flavorGhostReason === "VERSION_MISMATCH" ? t("vault_unsupported_version") || "UNSUPPORTED VERSION" : (t("modcard_missing_dlc") || "Missing DLC")}
                                              </div>
                                              <div className="text-[11px] font-black w-full text-center whitespace-normal leading-tight text-red-300">
                                                {hasMissingDeps 
                                                  ? formatDisplayName(typeof flavor.missingReqs[0] === 'string' ? flavor.missingReqs[0] : (flavor.missingReqs[0]?.name || flavor.missingReqs[0]?.id || '')) + (flavor.missingReqs.length > 1 ? ` (+${flavor.missingReqs.length - 1})` : "")
                                                  : flavorGhostReason === "VERSION_MISMATCH"
                                                  ? `Required: ${getHighestVersion(flavor.compatible_versions || renderedMod.compatible_versions || [])} | Current: ${selectedVersion || "Unknown"}`
                                                  : missingPacks.map((p: string) => mapDlcCode(p)).join(", ")}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      {isConfirming ? (
                                          <div
                                            className="w-full flex flex-col rounded-[2rem] border theme-glass-panel p-5 animate-in fade-in zoom-in-95 shadow-2xl border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]"
                                          >
                                          {isFlavorGhosted && !isFlavorEquipped ? (
                                            <>
                                              <div className="flex items-center gap-2 mb-3 shrink-0">
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">
                                                    {t("collection_missing_deps") || "MISSING DEPENDENCIES"}
                                                  </span>
                                                  <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                    {t("collection_proceed_caution") || "PROCEED WITH CAUTION"}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                {hasMissingDeps ? (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("collection_missing_artifacts") || "Missing Artifacts:"}</p>
                                                    {flavor.missingReqs.map((req: any) => {
                                                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                                                      const reqUrl = typeof req === 'string' ? null : req.url;
                                                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || reqIdStr;
                                                      const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(cleanName)}`;
                                                      return (
                                                        <a 
                                                          key={reqIdStr} 
                                                          href="#" 
                                                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-white/10 transition-colors cursor-pointer" 
                                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                                                        >
                                                          <span className="truncate">{cleanName}</span>
                                                          <span className="material-symbols-outlined !text-[14px] opacity-70">{reqUrl ? (t("ui_icon_import") || "download") : (t("ui_icon_search") || "search")}</span>
                                                        </a>
                                                      );
                                                    })}
                                                  </>
                                                ) : flavorGhostReason === "VERSION_MISMATCH" ? (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("vault_unsupported_version") || "UNSUPPORTED VERSION"}</p>
                                                    <div className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex flex-col gap-1 mb-1">
                                                      <span>{t("hub_label_game_versions") || "GAME VERSIONS"}: {([] as string[]).concat(flavor.compatible_versions || renderedMod.compatible_versions || []).join(", ") || t("shared_version_unknown") || "v.Unknown"}</span>
                                                    </div>
                                                  </>
                                                ) : (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">{t("collection_missing_dlc") || "Missing DLC Packs:"}</p>
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
                                                    {t("modcard_yeet_cascade") || "Yeet Cascade:"}
                                                  </span>
                                                  <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                    {t("modcard_override_exclusive") || "Protocol Override Required"}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">
                                                  {t("modcard_artifacts_removed") || "Artifacts to be Removed:"}
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
                                              {t("modcard_btn_proceed") || "Proceed Anyway"}
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] font-black text-[9px] uppercase tracking-widest hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:scale-105 transition-all shadow-lg"
                                            >
                                              {t("modcard_btn_safety") || "Back to Safety"}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex flex-col overflow-hidden pr-2 text-left gap-1">
                                            <div className="flex items-center gap-2">
                                              {flavor.status && (
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border backdrop-blur-md shadow-sm ${flavor.status === (t("status_verified") || "VERIFIED") ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)]" : flavor.status === (t("status_unverified") || "UNVERIFIED") ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)]" : "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"}`}>
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
                                                    /\.package$|\.ts4script$/i,
                                                    "",
                                                  )}
                                              </span>
                                            </div>
                                            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mt-1 uppercase tracking-widest flex items-center gap-2">
                                              {(flavor.relationshipType === 'beta' || (flavor.relationshipType !== 'core' && flavor.sub_type?.toLowerCase() === 'beta')) && <span className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] px-2 py-0.5 rounded text-[8px] font-black backdrop-blur-md shadow-sm">{t("badge_beta") || "BETA"}</span>}
                                              {((!flavor.relationshipType && flavor.sub_type?.toLowerCase() !== 'beta') || flavor.relationshipType === 'core') && <span className="bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] px-2 py-0.5 rounded text-[8px] font-black backdrop-blur-md shadow-sm">{t("badge_stable") || "STABLE"}</span>}
                                              <span className="opacity-50">|</span>
                                              <span>{flavor.mod_versions?.[0]?.version_label || flavor.version || t("dossier_vlocal") || "V.LOCAL"}</span>
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
                                                      ? t("vault_yeet_cascade") || "Yeet Cascade:"
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
                                                : <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_plus") || "add"}</span>}
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-4 mb-12">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_prev") || "PREV"}
                  </button>
                  <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                    {currentPage} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_next") || "NEXT"}
                  </button>
                </div>
              )}
              {quarantineList.length > 0 && (
                <div
                  id="quarantine-zone"
                  className="mt-12 p-10 theme-panel-danger border rounded-[3rem] space-y-6 animate-in slide-in-from-bottom-8"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <h3 className="theme-text-danger font-black tracking-tighter text-3xl uppercase leading-none flex items-center gap-3">
                      {t("vault_quarantine_title") || "Quarantine Sector"}
                    </h3>
                    <p className="theme-text-danger opacity-80 font-bold text-[10px] uppercase tracking-widest pl-12">
                      {t("vault_quarantine_desc") || "Isolated Signatures Requiring Purge or Restoration"}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                    {quarantineList.map((filename: string) => (
                      <div
                        key={filename}
                        className="theme-glass-inner p-5 rounded-2xl flex flex-col justify-between group hover:theme-border-danger transition-colors"
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
                            {t("vault_btn_restore") || "RESTORE"}
                          </button>
                          <button
                            onClick={() => purgeMod(filename)}
                            className="flex-1 px-4 py-2 theme-panel-danger theme-btn-danger border rounded-xl"
                          >
                            {t("vault_btn_purge") || "PURGE"}
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
                  <div className="theme-glass-panel backdrop-blur-3xl px-8 py-4 rounded-[2.5rem] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_100px_rgba(0,0,0,0.8)] pointer-events-auto flex items-center gap-4 transition-all animate-in slide-in-from-bottom-10">
                    <button
                      onClick={() => setIsBulkMode(false)}
                      className="h-12 px-6 rounded-[1.5rem] font-black uppercase tracking-widest transition-all text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-2 relative z-10"
                    >
                      <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_cancel") || "cancel"}</span>
                      {t("ui_btn_cancel") || "CANCEL"}
                    </button>

                    <div className="w-px h-8 bg-white/10 relative z-10" />

                    <div className="flex flex-col items-center justify-center gap-1 px-4 min-w-[100px]">
                      <span className="text-[var(--text)] font-black text-xl leading-none">{selectedMods.length}</span>
                      <span className="text-[var(--text)] font-black text-[9px] tracking-[0.2em] opacity-80 leading-none mr-[-0.2em]">{t("shared_selected") || "SELECTED"}</span>
                    </div>

                    <div className="w-px h-8 bg-white/10 relative z-10" />

                    <button
                      onClick={() => setBulkModal(true)}
                      disabled={selectedMods.length === 0}
                      className="h-12 px-6 rounded-[1.5rem] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--accent-rgb),0.2)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
                    >
                      <span className="material-symbols-outlined !text-[28px]">{t("ui_icon_architecture") || "architecture"}</span>
                      {t("status_draft_blueprint") || "DRAFT BLUEPRINT"}
                    </button>

                    <button
                      onClick={() => setLocalFolderModal(true)}
                      disabled={selectedMods.length === 0}
                      className="h-12 px-6 rounded-[1.5rem] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--success-rgb),0.2)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
                    >
                      <span className="material-symbols-outlined !text-[28px]">{t("ui_icon_create_new_folder") || "create_new_folder"}</span>
                      {t("vault_btn_group_folder") || "GROUP FOLDER"}
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
                      className="h-12 px-6 rounded-[1.5rem] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(var(--danger-rgb),0.2)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative z-10 hover:scale-105 active:scale-95"
                    >
                      <span className="material-symbols-outlined !text-[28px]">{t("ui_icon_delete_forever") || "delete_forever"}</span>
                      {t("vault_btn_purge_archives") || "PURGE ARCHIVES"}
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
                      <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_close") || "close"}</span>
                    </button>

                    <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 overflow-hidden">
                      <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                        <span className="material-symbols-outlined text-[var(--danger)] !leading-none translate-y-6" style={{ fontSize: '100px' }}>{t("ui_icon_delete_forever") || "delete_forever"}</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent pointer-events-none" />
                    </div>
                    
                    <div className="px-10 pt-8 pb-4 relative shrink-0">
                      <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{(!isBulkMode || selectedMods.length === 0) ? (t("vault_btn_purge_artifacts") || "PURGE ARCHIVES") : (t("vault_btn_purge_selected") || "PURGE SELECTED")}</h3>
                      <p className="text-[10px] font-black text-[var(--danger)] opacity-80 uppercase tracking-widest mt-2 whitespace-pre-wrap leading-relaxed">
                        {t("confirm_mass_purge_archive") || "Are you sure you want to PERMANENTLY DELETE the following Archive(s)?\n\nThis cannot be undone."}
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-6">
                      <div className="grid grid-cols-1 gap-4">
                        {purgeTargetFiles.map((filename) => (
                          <div key={filename} className="group relative flex flex-col items-start p-4 rounded-3xl border transition-all hover:scale-[1.02] hover:shadow-2xl backdrop-blur-md theme-glass-panel border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-white/5 hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                            <div className="flex flex-col min-w-0 pr-12 w-full">
                              <span className="text-[11px] font-black text-[var(--text)] uppercase truncate group-hover:text-[var(--danger)] transition-colors">
                                {formatDisplayName(filename, t)}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-2 shrink-0">
                                  <span>{filename.toLowerCase().endsWith('.ts4script') ? 'SCRIPT' : filename.toLowerCase().endsWith('.zip') ? 'ARCHIVE' : 'PACKAGE'}</span>
                                  <span className="opacity-50">•</span>
                                  <span>{t("dossier_vlocal") || "V.LOCAL"}</span>
                                </span>
                              </div>
                            </div>
                            <div className="absolute top-1/2 -translate-y-1/2 right-4 w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center font-black transition-all shadow-lg backdrop-blur-md border bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]">
                              <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_delete_forever") || "delete_forever"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="px-8 pb-8 pt-4 flex justify-center items-center gap-4 shrink-0 relative z-20 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      <button
                        onClick={async () => {
                          setStatus(t("status_purging_artifacts") || "Purging artifacts...");
                          try {
                            const config: any = await invoke("get_saved_coordinates");
                            const msg = await invoke("purge_vault_artifacts", {
                              vaultPath: config.vault_path,
                              filenames: purgeTargetFiles,
                            });
                            setStatus(`${t("ui_icon_success") || "check_circle"} ${msg}`);
                            setIsBulkMode(false);
                            setSelectedMods([]);
                            setPurgeTargetFiles(null);
                            runRadarSweep(false);
                          } catch (err) {
                            setStatus(`${t("status_error") || "Error:"}${err}`);
                          }
                        }}
                        className={`px-16 py-4 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 ${standardDangerButtonClass}`}
                      >
                        <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_delete_forever") || "delete_forever"}</span>
                        {t("scout_confirm_purge") || "CONFIRM PURGE"}
                      </button>
                    </div>
                  </div>
                </>, document.body
              )}

      <SidePanel
        isOpen={isSidePanelOpen}
        onClose={() => setIsSidePanelOpen(false)}
        title={t("vault_tools_title") || "VAULT TOOLS"}
        subtitle={t("vault_tools_subtitle") || "ACTIONS & FILTERS"}
        icon="tune"
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex flex-col gap-6">
           {playSets && playSets.length > 0 && (
             <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card">
               <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
               <div className="flex items-center gap-4 mb-6 relative z-10">
                 <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                   <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_layers") || "layers"}</span>
                 </div>
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("vault_active_blueprint") || "Blueprint"}</h3>
               </div>
               
               <div className="flex gap-2 relative z-10">
                 <div className="flex-1">
                   <CustomDropdown
                     disableTint={true}
                     value={props.activePlaySetIndex}
                     options={playSets.map((set: any, idx: number) => ({ id: idx, label: set.name }))}
                     onChange={(val: any) => props.setActivePlaySetIndex && props.setActivePlaySetIndex(Number(val))}
                   />
                 </div>
                 <button
                   onClick={() => equipPlaySet && equipPlaySet(playSets[props.activePlaySetIndex]?.name)}
                   className="h-14 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2 shrink-0"
                 >
                   <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_success") || "check_circle"}</span> {t("playsets_btn_save") || "SAVE"}
                 </button>
               </div>
             </div>
           )}

           <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card">
             <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
             <div className="flex items-center gap-4 mb-6 relative z-10">
               <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
                 <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_bolt") || "bolt"}</span>
               </div>
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("vault_sidebar_actions") || "ACTIONS"}</h3>
             </div>
             
             <div className="flex flex-col gap-3 relative z-10">
               <SidebarActionButton id="REFRESH" icon="refresh" label={t("vault_btn_refresh") || "Radar Sweep"} onClick={() => { runRadarSweep(true); setIsSidePanelOpen(false); }} active={false} />
               <SidebarActionButton 
                 id="SELECT_ASSETS" 
                 icon={isBulkMode ? "cancel" : "checklist"} 
                 label={isBulkMode ? t("ui_btn_cancel") || "CANCEL" : t("vault_btn_select_assets") || "SELECT ASSETS"} 
                 onClick={() => { setIsBulkMode(!isBulkMode); setIsSidePanelOpen(false); }} 
                 active={isBulkMode} 
                 danger={isBulkMode}
               />
               <SidebarActionButton 
                 id="SELECT_ALL" 
                 icon="library_add_check" 
                 label={t("vault_btn_select_all") || "SELECT ALL"} 
                 onClick={() => {
                   if (!isBulkMode) setIsBulkMode(true);
                   const allNames = finalVisibleMods.map((m: any) => m.name);
                   if (allNames.length > 0) {
                     const allSelected = allNames.every((n: string) => selectedMods.includes(n));
                     if (allSelected) {
                       setSelectedMods([]);
                     } else {
                       const newSelected = new Set([...selectedMods, ...allNames]);
                       setSelectedMods(Array.from(newSelected));
                     }
                   }
                   setIsSidePanelOpen(false);
                 }} 
                 active={false} 
               />
               {equipFilter === "ARCHIVES" && (
                 <SidebarActionButton 
                   id="PURGE_FOLDER" 
                   icon="delete_sweep" 
                   danger={true} 
                   label={t("vault_btn_purge_folder") || "PURGE ARCHIVES"} 
                   onClick={() => {
                      const allFilesToPurge = new Set<string>();
                      finalVisibleMods.forEach((mod: any) => {
                        if (mod && mod.isVirtual && mod.flavors) {
                          mod.flavors.forEach((f: any) => {
                            if (f.name) allFilesToPurge.add(f.name);
                          });
                        } else if (mod && mod.name) {
                          allFilesToPurge.add(mod.name);
                        }
                      });
                      if (allFilesToPurge.size === 0) return;
                      setPurgeTargetFiles(Array.from(allFilesToPurge));
                      setIsSidePanelOpen(false);
                   }} 
                   active={false} 
                 />
               )}
             </div>
           </div>

           {(() => {
             const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
             if (localSets.length === 0) return null;
             
             return (
               <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card mt-2">
                 <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex items-center gap-4 mb-6 relative z-10">
                   <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--accent)]">
                     <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_folder") || "folder"}</span>
                   </div>
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("vault_local_folders") || "LOCAL FOLDERS"}</h3>
                 </div>
                 
                 <div className="flex gap-2 relative z-10">
                   <div className="flex-1">
                     <CustomDropdown
                       disableTint={true}
                       value={activeLocalFolder || localSets[0]?.id}
                       options={localSets.map((set: any) => ({ id: set.id, label: set.name }))}
                       onChange={(val: any) => setActiveLocalFolder(String(val))}
                     />
                   </div>
                   <button
                     onClick={() => {
                         const target = activeLocalFolder || localSets[0]?.id;
                         if (!target) return;
                         setIsLocalFolderEditorOpen(true);
                     }}
                     className="h-14 px-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-white/10 text-[var(--text)]/70 backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:text-[var(--text)] font-black shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center shrink-0"
                   >
                     <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_edit") || "edit"}</span>
                   </button>
                 </div>
               </div>
             );
           })()}
        </div>
      </SidePanel>

      <SidePanel
        isOpen={isLocalFolderEditorOpen}
        onClose={() => {
          setIsLocalFolderEditorOpen(false);
          setConfirmDeleteId(null);
          setRenameFolderInput("");
        }}
        title={t("vault_local_folders_edit") || "EDIT FOLDER"}
        subtitle={t("vault_local_folders") || "LOCAL FOLDERS"}
        icon="folder_managed"
        iconColorClass="theme-text-accent"
        widthClass="w-[525px]"
        backdropZ="z-[40002]"
        panelZ="z-[40003]"
        ambientGlows={
          <>
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/3 -left-32 w-96 h-96 bg-[var(--text)] opacity-10 blur-[100px] rounded-full pointer-events-none" />
          </>
        }
      >
        {(() => {
          const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
          const target = activeLocalFolder || localSets[0]?.id;
          if (!target) return null;
          const targetSet = localSets.find((s: any) => s.id === target);
          if (!targetSet) return null;
          
          return (
            <div className="flex flex-col gap-6 h-full">
              <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card shrink-0">
                 <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex flex-col gap-3 relative z-10">
                   <label className="text-[9px] font-black uppercase text-[var(--subtext)] tracking-widest pl-2 opacity-60">
                     {t("vault_local_folders_rename_prompt") || "RENAME FOLDER"}
                   </label>
                   <div className="flex gap-2">
                     <input
                       type="text"
                       value={renameFolderInput === "" ? targetSet.name : renameFolderInput}
                       onChange={(e) => setRenameFolderInput(e.target.value)}
                       className="flex-1 h-14 bg-black/20 border border-white/10 rounded-2xl px-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
                     />
                     <button
                       onClick={() => {
                           const val = renameFolderInput === "" ? targetSet.name : renameFolderInput;
                           if (val.trim() && val.trim() !== targetSet.name) {
                               const updated = localSets.map((s: any) => s.id === target ? { ...s, name: val.trim() } : s);
                               localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                               setRenameFolderInput("");
                               runRadarSweep(true);
                           }
                       }}
                       className="h-14 px-6 rounded-2xl bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] font-black shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center shrink-0 uppercase tracking-widest text-[10px]"
                     >
                       {t("ui_btn_save") || "SAVE"}
                     </button>
                   </div>
                 </div>
              </div>

              <div className="theme-glass-panel border border-white/5 rounded-3xl p-6 shadow-lg relative overflow-hidden group/card flex-1 flex flex-col min-h-0">
                 <div className="absolute inset-0 bg-gradient-to-tl from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
                   <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
                     <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_inventory") || "inventory_2"}</span>
                   </div>
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("vault_local_folders_contents") || "FOLDER CONTENTS"}</h3>
                 </div>
                 
                 <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                   {targetSet.items.map((hash: string) => {
                     const art = displayModList.find((m: any) => m.hash === hash);
                     if (!art) return null;
                     return (
                       <div key={hash} className="theme-glass-inner p-3 rounded-2xl flex items-center gap-4 group/item transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 hover:theme-border-accent">
                         <div className="flex-1 flex flex-col min-w-0">
                           <span className="text-[11px] font-black text-[var(--text)] truncate uppercase">
                             {(art.displayName || art.name).replace(/_/g, " ").replace(/\.package$|\.ts4script$/i, "")}
                           </span>
                           <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest">
                             {art.author || t("bp_unknown_creator_full") || "Unknown Mason"}
                           </span>
                         </div>
                         <button
                           onClick={() => {
                             const updatedItems = targetSet.items.filter((h: string) => h !== hash);
                             const updatedSets = localSets.map((s: any) => s.id === target ? { ...s, items: updatedItems } : s);
                             localStorage.setItem("sanctuary_local_sets", JSON.stringify(updatedSets));
                             runRadarSweep(true);
                           }}
                           className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border border-white/5 text-[var(--text)]/50 flex items-center justify-center shrink-0 hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:text-[var(--danger)] transition-all hover:scale-110"
                         >
                           <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_close") || "close"}</span>
                         </button>
                       </div>
                     );
                   })}
                   {targetSet.items.length === 0 && (
                     <div className="text-center py-12 opacity-50 font-bold uppercase text-[10px] tracking-widest flex flex-col items-center gap-2">
                       <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_inbox") || "inbox"}</span>
                       {t("vault_local_folders_empty") || "FOLDER IS EMPTY"}
                     </div>
                   )}
                 </div>
                 
                 <div className="pt-6 mt-2 border-t border-white/5 shrink-0 relative z-10">
                   <button
                     onClick={() => {
                       if (confirmDeleteId === target) {
                         const updated = localSets.filter((s: any) => s.id !== target);
                         localStorage.setItem("sanctuary_local_sets", JSON.stringify(updated));
                         if (activeLocalFolder === target) setActiveLocalFolder("");
                         setIsLocalFolderEditorOpen(false);
                         setConfirmDeleteId(null);
                         runRadarSweep(true);
                       } else {
                         setConfirmDeleteId(target);
                       }
                     }}
                     className={`w-full h-14 rounded-2xl border backdrop-blur-md font-black shadow-sm transition-all flex items-center justify-center uppercase tracking-widest text-[11px] ${confirmDeleteId === target ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] shadow-[0_0_20px_rgba(220,38,38,0.2)] animate-pulse' : 'bg-transparent border-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]/60 hover:bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_20%,transparent)]'}`}
                   >
                     {confirmDeleteId === target ? (t("vault_local_folders_confirm_delete") || "CONFIRM DELETE?") : (t("vault_local_folders_delete") || "DELETE FOLDER")}
                   </button>
                 </div>
              </div>
            </div>
          );
        })()}
      </SidePanel>
            </div>
  );
}
