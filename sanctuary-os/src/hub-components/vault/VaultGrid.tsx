import React from 'react';
import { formatDisplayName, getHighestVersion, mapDlcCode, getExtensionRegex, getFileLabel, HoverTooltip, EmptyState, cleanSearchName, SearchBar } from '../../shared';
import { ModCard } from '../../ModCard';

export function VaultGrid(props: any) {
  const { paginatedMods, t, playSets, activePlaySetIndex, activeGameSchema, anarchyRules, isBulkMode, selectedMods, toggleModSelection, setDrawerConfirmHash, toggleInActiveSet, isVersionMatch, drawerCasualties, selectedVersion, hasMissingDeps, missingPacks, isSwappedState, isBetaSwap, isFlavorGhosted, isFlavorEquipped, setMetaNameInput, setMetaAuthorInput, setMetaVersionInput, setMetaDescInput, setMetaImageInput, setMetaAllowWriteInput, setActiveDossier, drawerConfirmHash, flavorGhostReason, setIsDropzoneOpen, currentPage, setCurrentPage, totalPages, equippedDisplayMods, modListIndex, dependencyGraph, uppercaseEquippedMods, localConflictsMemo, ownedDLC, maskedDLC, displayModList, supabase, setMetaUrlInput, applyConflictOverride, setActiveTier3Conflict, expandedFolder, setExpandedFolder, hideGhostCards, setSelectedMods, setActiveLocalFolder, setIsLocalFolderEditorOpen } = props;
  const localSets = JSON.parse(localStorage.getItem("sanctuary_local_sets") || "[]");
  const [drawerSearchQuery, setDrawerSearchQuery] = React.useState("");
  React.useEffect(() => {
    setDrawerSearchQuery("");
  }, [expandedFolder]);
  const areArchetypes = (hash1: string, hash2: string) => {
    if (!hash1 || !hash2) return false;
    return localSets.some((s: any) => (
      (s.archetypes?.core === hash1 && (s.archetypes?.twins?.includes(hash2) || s.archetypes?.addons?.includes(hash2))) ||
      (s.archetypes?.core === hash2 && (s.archetypes?.twins?.includes(hash1) || s.archetypes?.addons?.includes(hash1))) ||
      ((s.archetypes?.twins?.includes(hash1) || s.archetypes?.addons?.includes(hash1)) && (s.archetypes?.twins?.includes(hash2) || s.archetypes?.addons?.includes(hash2)))
    ));
  };
  return (
    <>
      <div id="vault-grid-container" className={`grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-24 pl-2 pr-6 relative`}>
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
                let wouldBeRemoved = [mod];
                const parentSet = localSets.find((s: any) => s.archetypes?.core === mod.hash || s.archetypes?.twins?.includes(mod.hash));

                if (parentSet) {
                  const siblings = equippedDisplayMods.filter((m: any) =>
                    !m.isVirtual && m.name && m.name !== mod.name &&
                    parentSet.items.includes(m.hash)
                  );
                  wouldBeRemoved.push(...siblings);
                } else if (mod.relationshipType === "core") {
                  const familyAnchor = mod.familyId || mod.dbId;
                  const siblings = equippedDisplayMods.filter(
                    (m: any) =>
                      !m.isVirtual &&
                      m.name &&
                      m.name !== mod.name &&
                      (String(m.familyId) === String(familyAnchor) ||
                        String(m.dbId) === String(familyAnchor) ||
                        String(m.setId) === String(mod.dbId))
                  );
                  wouldBeRemoved.push(...siblings);
                }

                casualties = getDeepCasualties(wouldBeRemoved);
                if (wouldBeRemoved.length > 1) {
                  const siblingNames = wouldBeRemoved.filter(m => m.name !== mod.name).map(m => m.displayName || m.name);
                  casualties = [...new Set([...casualties, ...siblingNames])];
                }
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
                        if (areArchetypes(mObj.hash, matchObj.hash)) return null;
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
                      if (areArchetypes(mObj.hash, mData.hash)) return;
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
                      if (areArchetypes(mObj.hash, matchObj.hash)) return;

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


              const extRegex = getExtensionRegex(activeGameSchema);

              if (m.requirements) {
                m.requirements.forEach((req: any) => {
                  const reqIdStr = typeof req === 'string' ? req : req.id || req.dbId;
                  const reqName = typeof req === 'string' ? req : req.name;
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
                  const twinBaseName = twinName?.split(/[\\/]/).pop()?.replace(extRegex, "").toUpperCase();
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
                  id={`mod-card-${mainKey}`}
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
                  onContextMenu={props.onContextMenu ? (e: any) => props.onContextMenu(e, mod) : undefined}
                />
                {mod.isParent && expandedFolder === mainKey && (
                  <div className="col-span-full theme-glass-panel rounded-[var(--radius)] p-6 mt-4 mb-2 relative isolate [transform:translateZ(0)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-8 pl-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-black text-[var(--text)] uppercase tracking-widest">
                          <span className="theme-text-accent">
                            {formatDisplayName(renderedMod.displayName || renderedMod.name)}
                          </span>
                        </h3>
                      </div>
                      <div className="relative w-64">
                        <SearchBar
                          value={drawerSearchQuery}
                          onChange={(v) => setDrawerSearchQuery(v)}
                          placeholder={t("search_ph") || "Search Artifacts..."}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 max-h-[600px] overflow-y-auto custom-scrollbar p-4 -m-4">
                      {(renderedMod.flavors || [])
                        .filter((flavor: any) => {
                          if (!drawerSearchQuery) return true;
                          const query = drawerSearchQuery.toLowerCase();
                          return (flavor.displayName || flavor.name || "").toLowerCase().includes(query) || (flavor.author || "").toLowerCase().includes(query);
                        })
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
                              const localRivals = mod.isFlavorFolder
                                ? (renderedMod.flavors || []).filter(
                                  (f: any) =>
                                    f.name !== flavor.name &&
                                    activeSetMods.includes(f.name) &&
                                    !areArchetypes(flavor.hash, f.hash),
                                )
                                : [];
                              const globalRivals = equippedDisplayMods.filter((m: any) => {
                                if (m.name === flavor.name) return false;
                                if (areArchetypes(flavor.hash, m.hash)) return false;
                                const isSameFlavorGroup = flavor.flavorGroupId && String(m.flavorGroupId) === String(flavor.flavorGroupId);
                                const isBetaRival = (flavor.relationshipType === 'beta' && m.relationshipType !== 'beta' || flavor.relationshipType !== 'beta' && m.relationshipType === 'beta') && (String(m.familyId) === String(flavor.familyId) || String(m.dbId) === String(flavor.familyId || flavor.dbId));
                                return isSameFlavorGroup || isBetaRival;
                              });
                              const allRivals = [...localRivals, ...globalRivals].filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                              drawerCasualties = getDrawerDeepCasualties(allRivals);
                            } else {
                              let wouldBeRemoved = [flavor];
                              const parentSet = localSets.find((s: any) => s.archetypes?.core === flavor.hash || s.archetypes?.twins?.includes(flavor.hash));

                              if (parentSet) {
                                const siblings = equippedDisplayMods.filter((m: any) =>
                                  !m.isVirtual && m.name && m.name !== flavor.name &&
                                  parentSet.items.includes(m.hash)
                                );
                                wouldBeRemoved.push(...siblings);
                              } else if (flavor.relationshipType === "core") {
                                const anchor = flavor.familyId || flavor.dbId;
                                const siblings = equippedDisplayMods.filter((m: any) =>
                                  !m.isVirtual && m.name && m.name !== flavor.name &&
                                  (String(m.familyId) === String(anchor) || String(m.dbId) === String(anchor) || String(m.setId) === String(flavor.dbId))
                                );
                                wouldBeRemoved.push(...siblings);
                              }

                              drawerCasualties = getDrawerDeepCasualties(wouldBeRemoved).filter(
                                (c: any) => c.name !== flavor.name,
                              );

                              if (wouldBeRemoved.length > 1) {
                                const siblingObjs = wouldBeRemoved.filter(m => m.name !== flavor.name);
                                drawerCasualties = [...drawerCasualties, ...siblingObjs].filter((v, i, a) => a.findIndex(t => (t.name || t) === (v.name || v)) === i);
                              }
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

                            return (
                              <ModCard
                                compact={true}
                                key={`sub-${flavor.hash}-${subIdx}`}
                                mod={flavor}
                                gameVersion={selectedVersion}
                                ownedDLC={ownedDLC}
                                maskedDLC={maskedDLC}
                                isInActiveSet={isFlavorEquipped}
                                casualtyList={drawerCasualties}
                                anarchyRules={anarchyRules}
                                tier3List={[]}
                                missingDeps={flavor.missingReqs || []}
                                flavorGhostReason={flavorGhostReason}
                                isSelfGhosted={isFlavorGhosted}
                                isSelfSwapped={isSwappedState}
                                isSelfBetaSwap={isBetaSwap}
                                onToggleSet={async (e: any, overrideBroken: boolean = false) => {
                                  e.stopPropagation();
                                  if (flavor.isGhosted || missingPacks.length > 0 || hasMissingDeps || flavorGhostReason === "VERSION_MISMATCH") {
                                    if (!overrideBroken) {
                                      setDrawerConfirmHash(drawerConfirmHash === flavor.hash ? null : flavor.hash);
                                      return;
                                    }
                                  }
                                  if (!isFlavorEquipped && drawerCasualties.length > 0 && drawerConfirmHash !== flavor.hash && anarchyRules?.intercept !== false) {
                                    setDrawerConfirmHash(flavor.hash);
                                    return;
                                  }
                                  await toggleInActiveSet(flavor.name, overrideBroken);
                                  setDrawerConfirmHash(null);
                                }}
                                onInspectItem={(item: any) => {
                                  setActiveDossier(item);
                                }}
                                onContextMenu={(e: any) => {
                                  if (props.onContextMenu) {
                                    props.onContextMenu(e, flavor);
                                  }
                                }}
                                onClick={() => {
                                  setMetaNameInput(flavor.displayName || flavor.name);
                                  setMetaAuthorInput(flavor.author || mod.author || "");
                                  setMetaVersionInput(flavor.version || mod.version || "");
                                  setMetaDescInput(flavor.description || mod.description || "");
                                  setMetaImageInput(flavor.image_url || flavor.imageUrl || mod.image_url || mod.imageUrl || "");
                                  setMetaAllowWriteInput(flavor.allow_write || mod.allow_write || false);
                                  setActiveDossier(flavor);
                                }}
                              />
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
        <div className={`flex justify-center items-center gap-4 mt-4 mb-24`}>
          <button
            onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-6 py-3 theme-glass-inner rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
          >
            {t("nav_prev")}
          </button>
          <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-6 py-3 theme-glass-inner rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
          >
            {t("nav_next")}
          </button>
        </div>
      )
      }

    </>
  );
}
