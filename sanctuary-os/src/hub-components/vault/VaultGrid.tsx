import React from 'react';
import { formatDisplayName, getHighestVersion, mapDlcCode, getExtensionRegex, getFileLabel, HoverTooltip, EmptyState, cleanSearchName } from '../../shared';
import { ModCard } from '../../ModCard';

export function VaultGrid(props: any) {
 const { paginatedMods, t, playSets, activePlaySetIndex, activeGameSchema, anarchyRules, isBulkMode, selectedMods, toggleModSelection, setDrawerConfirmHash, toggleInActiveSet, isVersionMatch, drawerCasualties, selectedVersion, hasMissingDeps, missingPacks, isSwappedState, isBetaSwap, isFlavorGhosted, isFlavorEquipped, setMetaNameInput, setMetaAuthorInput, setMetaVersionInput, setMetaDescInput, setMetaImageInput, setMetaAllowWriteInput, setActiveDossier, drawerConfirmHash, flavorGhostReason, setIsDropzoneOpen, currentPage, setCurrentPage, totalPages, equippedDisplayMods, modListIndex, dependencyGraph, uppercaseEquippedMods, localConflictsMemo, ownedDLC, maskedDLC, displayModList, supabase, setMetaUrlInput, applyConflictOverride, setActiveTier3Conflict, expandedFolder, setExpandedFolder, hideGhostCards, setSelectedMods } = props;
 return (
 <>
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-24 pl-2 pr-6`}>
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
                                            <span>{getFileLabel(flavor.name, activeGameSchema)}</span>
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
        )}
      
 </>
 );
}
