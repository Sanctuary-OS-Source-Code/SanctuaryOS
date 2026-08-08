import React from 'react';
import { formatDisplayName, getHighestVersion, mapDlcCode, getExtensionRegex, getFileLabel, HoverTooltip, EmptyState, cleanSearchName, SearchBar } from '../../shared';
import { ModCard } from '../../ModCard';

const DeferredRender = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return ready ? <>{children}</> : <div className="flex items-center justify-center p-20 w-full"><div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" /></div>;
};

const AccordionDrawer = ({ children, isOpen }: { children: React.ReactNode, isOpen: boolean }) => {
  const [render, setRender] = React.useState(isOpen);
  const [visible, setVisible] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setRender(true);
      const timer = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div className={`col-span-full overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] ${visible ? 'max-h-[1000px] opacity-100 scale-100' : 'max-h-0 opacity-0 scale-[0.98]'}`}>
      <div className="pt-4 pb-12 px-2">
        {children}
      </div>
    </div>
  );
};

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
  const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
  const cleanedActiveSet = React.useMemo(() => {
    const s = new Set<string>();
    activeSetMods.forEach((m: string) => s.add(m.replace(/^(sanctuary[/\\])+/i, '')));
    return s;
  }, [activeSetMods]);

  const cardComputations = React.useMemo(() => {
    const map = new Map();

    paginatedMods.forEach((mod: any) => {
      const isEquipped = mod.isParent
        ? (() => {
          const anchor = mod.dbId || mod.familyId;
          if (mod.isFlavorFolder) {
            return (mod.flavors || []).some((f: any) =>
              activeSetMods.includes(f.name) || cleanedActiveSet.has(f.name)
            );
          }
          if (anchor) {
            return (mod.flavors || []).some((f: any) =>
              activeSetMods.includes(f.name) || cleanedActiveSet.has(f.name)
            );
          }
          return (mod.flavors || []).some((f: any) =>
            activeSetMods.includes(f.name) || cleanedActiveSet.has(f.name)
          );
        })()
        : activeSetMods.includes(mod.name) || cleanedActiveSet.has(mod.name);
      
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
            const siblingNames = wouldBeRemoved.filter((m: any) => m.name !== mod.name).map((m: any) => m.displayName || m.name);
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
      
      map.set(mod.hash || mod.name, {
        isEquipped,
        casualties,
        tier3List,
        isFlavorSwapCard,
        missingReqs,
      });
    });
    
    return map;
  }, [
    paginatedMods,
    playSets,
    activePlaySetIndex,
    equippedDisplayMods,
    modListIndex,
    dependencyGraph,
    localSets,
    anarchyRules,
    uppercaseEquippedMods,
    localConflictsMemo,
    activeGameSchema,
    expandedFolder
  ]);

  const drawerComputations = React.useMemo(() => {
    const map = new Map();
    paginatedMods.forEach((mod: any) => {
      const isExpanded = expandedFolder === (mod.hash || mod.name);

      (mod.flavors || []).forEach((flavor: any) => {
        const isFlavorEquipped = activeSetMods.includes(flavor.name);
        
        // If the folder isn't expanded, we only care about maintaining the equipped state
        // for the sliding close animation. Skip all heavy math.
        if (!isExpanded) {
          map.set(flavor.hash || flavor.name, {
            isFlavorEquipped,
            drawerCasualties: [],
            isSwappedState: false,
            isBetaSwap: false,
            missingPacks: [],
            hasMissingDeps: false,
            flavorVersionMismatch: false,
            flavorGhostReason: null,
            isFlavorGhosted: false
          });
          return;
        }

        const getDrawerDeepCasualties = (seeds: any[]) => {
          let queue = [...seeds];
          let seen = new Set<string>();
          let result: any[] = [];
          while (queue.length > 0) {
            const current = queue.shift();
            if (!current || seen.has(current.name)) continue;
            seen.add(current.name);
            result.push(current);
            const dependents = dependencyGraph.get(current.name) || [];
            queue.push(...dependents);
          }
          return result;
        };

        let drawerCasualties: any[] = [];
        let isSwappedState = false;
        let isBetaSwap = false;

        if (!isFlavorEquipped) {
          const localRivals = mod.isFlavorFolder
            ? (mod.flavors || []).filter((f: any) => f.name !== flavor.name && activeSetMods.includes(f.name) && !areArchetypes(flavor.hash, f.hash))
            : [];
          const globalRivals = equippedDisplayMods.filter((m: any) => {
            if (m.name === flavor.name) return false;
            const isSameFlavorGroup = (flavor.flavorGroupId && String(m.flavorGroupId) === String(flavor.flavorGroupId)) || (flavor.communityGroupId && String(m.communityGroupId) === String(flavor.communityGroupId));
            const isBetaRival = (flavor.relationshipType === 'beta' && m.relationshipType !== 'beta' || flavor.relationshipType !== 'beta' && m.relationshipType === 'beta') && (String(m.familyId) === String(flavor.familyId) || String(m.dbId) === String(flavor.familyId || flavor.dbId));
            if (isSameFlavorGroup || isBetaRival) {
              if (areArchetypes(flavor.hash, m.hash)) return false;
              return true;
            }
            return false;
          });
          const allRivals = [...localRivals, ...globalRivals].filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
          drawerCasualties = getDrawerDeepCasualties(allRivals);
          
          if (localRivals.length > 0 || globalRivals.length > 0) {
             const hasBeta = [...localRivals, ...globalRivals].some(r => r.relationshipType === 'beta');
             if (flavor.relationshipType === 'beta' || hasBeta) {
                isBetaSwap = true;
             } else {
                isSwappedState = true;
             }
          }
        } else {
          let wouldBeRemoved = [flavor];
          const parentSet = localSets.find((s: any) => s.archetypes?.core === flavor.hash || s.archetypes?.twins?.includes(flavor.hash));
          if (parentSet) {
            const siblings = equippedDisplayMods.filter((m: any) => !m.isVirtual && m.name && m.name !== flavor.name && parentSet.items.includes(m.hash));
            wouldBeRemoved.push(...siblings);
          } else if (flavor.relationshipType === "core") {
            const anchor = flavor.familyId || flavor.dbId;
            const siblings = equippedDisplayMods.filter((m: any) => !m.isVirtual && m.name && m.name !== flavor.name && (String(m.familyId) === String(anchor) || String(m.dbId) === String(anchor) || String(m.setId) === String(flavor.dbId)));
            wouldBeRemoved.push(...siblings);
          }
          drawerCasualties = getDrawerDeepCasualties(wouldBeRemoved).filter((c: any) => c.name !== flavor.name);
          if (wouldBeRemoved.length > 1) {
            const siblingObjs = wouldBeRemoved.filter((m: any) => m.name !== flavor.name);
            drawerCasualties = [...drawerCasualties, ...siblingObjs].filter((v, i, a) => a.findIndex(t => (t.name || t) === (v.name || v)) === i);
          }
        }
        if (anarchyRules?.intercept === false) {
          drawerCasualties = [];
        }

        let rawFlavorDLC: string[] = [];
        if (mod.requiredDLC) {
          if (typeof mod.requiredDLC === 'string') {
            try { rawFlavorDLC.push(...JSON.parse(mod.requiredDLC)); }
            catch { rawFlavorDLC.push(...mod.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim())); }
          }
          else if (Array.isArray(mod.requiredDLC)) rawFlavorDLC.push(...mod.requiredDLC);
        }
        if (flavor.requiredDLC) {
          if (typeof flavor.requiredDLC === 'string') {
            try { rawFlavorDLC.push(...JSON.parse(flavor.requiredDLC)); }
            catch { rawFlavorDLC.push(...flavor.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim())); }
          }
          else if (Array.isArray(flavor.requiredDLC)) rawFlavorDLC.push(...flavor.requiredDLC);
        }

        let flavorDLC = Array.from(new Set(rawFlavorDLC)).filter(Boolean);
        const missingPacks = flavorDLC.filter((p: string) => {
          const baseCode = p.split(' ')[0].toUpperCase();
          return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        });
        const hasMissingDeps = flavor.missingReqs && flavor.missingReqs.length > 0;

        const flavorVersionMismatch = (flavor.compatible_versions && flavor.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(flavor.compatible_versions, selectedVersion)) || (mod.compatible_versions && mod.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(mod.compatible_versions, selectedVersion));
        const flavorGhostReason = flavor.ghostReason || (flavorVersionMismatch ? "VERSION_MISMATCH" : null) || (mod.ghostReason === "VERSION_MISMATCH" ? "VERSION_MISMATCH" : null);
        const isFlavorGhosted = missingPacks.length > 0 || hasMissingDeps || flavor.isGhosted || flavorGhostReason === "VERSION_MISMATCH";

        map.set(flavor.hash || flavor.name, {
          isFlavorEquipped,
          drawerCasualties,
          isSwappedState,
          isBetaSwap,
          missingPacks,
          hasMissingDeps,
          flavorVersionMismatch,
          flavorGhostReason,
          isFlavorGhosted
        });
      });
    });
    return map;
  }, [paginatedMods, activeSetMods, equippedDisplayMods, dependencyGraph, activeGameSchema, localSets, anarchyRules, ownedDLC, maskedDLC, selectedVersion]);


  return (
    <>
      <div id="vault-grid-container" className={`grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6 pb-24 pl-2 pr-6 relative`}>
        {paginatedMods.length === 0 ? (
          <EmptyState icon="search_off" title={t("registry_no_mods")} subtitle={t("vault_no_results_sub")} className="col-span-full py-24" />
        ) : (
          paginatedMods.map((mod: any, index: number) => {
            const mainKey = `${mod.hash || mod.name}-${index}`;
            const comp = cardComputations.get(mod.hash || mod.name) || { isEquipped: false, casualties: [], tier3List: [], isFlavorSwapCard: false, missingReqs: [] };
            const { isEquipped, casualties, tier3List, isFlavorSwapCard, missingReqs } = comp;

            let renderedMod = mod;

            const renderedModCard = (
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
                onToggleSet={(e: any, overrideBroken: boolean = false) => {
                  e.stopPropagation();
                  toggleInActiveSet(mod.name, !overrideBroken);
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
            );

            return (
              <React.Fragment key={mainKey}>
                {/* GHOST PLACEHOLDER IN GRID TO PREVENT SHIFTING */}
                <div className="contents">
                  {React.cloneElement(renderedModCard, { isGhostPlaceholder: expandedFolder === mainKey })}
                </div>

                <AccordionDrawer isOpen={expandedFolder === mainKey}>
                  <div className="w-full glass-panel rounded-[32px] p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col gap-8 relative isolate">

                  {/* Unified Full-Width Header */}
                  <div className="flex flex-wrap gap-4 items-center justify-between pb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/[10%] border border-[var(--accent)]/[20%] flex items-center justify-center shrink-0 shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.1)]">
                        <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">folder_open</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-2xl md:text-3xl font-black text-[var(--text)] uppercase tracking-widest leading-none">
                            {formatDisplayName(renderedMod.displayName || renderedMod.name)}
                          </h3>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)] opacity-80 flex items-center gap-2 mt-1">
                          <span className="material-symbols-outlined !text-[14px]">account_tree</span>
                          {t("nav_exploring") || "EXPLORING"} {(renderedMod.flavors || []).length} {t("items") || "ARTIFACTS"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="relative flex-1 md:w-72">
                        <SearchBar
                          value={drawerSearchQuery}
                          onChange={(v: string) => setDrawerSearchQuery(v)}
                          placeholder={t("search_ph") || "Search Artifacts..."}
                        />
                      </div>
                      <button onClick={() => setExpandedFolder(null)} className="w-12 h-12 rounded-xl glass-surface hover:bg-red-500/[10%] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--text)] transition-all shadow-sm shrink-0">
                        <span className="material-symbols-outlined !text-[24px]">close</span>
                      </button>
                    </div>
                  </div>

                  {/* Content Area: Left Card + Right Grid */}
                  <div className="flex flex-col xl:flex-row gap-10 relative z-10">

                    {/* Left Side: The Parent Card */}
                    <div className="w-full xl:w-[350px] shrink-0 flex flex-col relative">
                      <div className="w-full relative">
                        {React.cloneElement(renderedModCard, { hideHitBox: true })}
                        {/* Subtle anchor gradient behind the card */}
                        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-[var(--accent)]/10 blur-[50px] rounded-full pointer-events-none z-[-1]" />
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="hidden xl:block w-px bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_10%,transparent)] via-[color-mix(in_srgb,var(--text)_5%,transparent)] to-transparent" />

                    {/* Right Side: The Folder Contents */}
                    <div className="flex-1 min-w-0">
                      <DeferredRender>
                        {/* Inner Grid */}
                        <div className="grid grid-cols-1 xl:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5 max-h-[500px] xl:max-h-[600px] overflow-y-auto custom-scrollbar p-6">
                        {(renderedMod.flavors || [])
                          .filter((flavor: any) => {
                            if (!drawerSearchQuery) return true;
                            const query = drawerSearchQuery.toLowerCase();
                            return (flavor.displayName || flavor.name || "").toLowerCase().includes(query) || (flavor.author || "").toLowerCase().includes(query);
                          })
                          .map(
                            (flavor: any, subIdx: number) => {
                              const comp = drawerComputations.get(flavor.hash || flavor.name) || { isFlavorEquipped: false, drawerCasualties: [], isSwappedState: false, isBetaSwap: false, missingPacks: [], hasMissingDeps: false, flavorVersionMismatch: false, flavorGhostReason: null, isFlavorGhosted: false };
                              const { isFlavorEquipped, drawerCasualties, isSwappedState, isBetaSwap, missingPacks, hasMissingDeps, flavorVersionMismatch, flavorGhostReason, isFlavorGhosted } = comp;

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
                                    setDrawerConfirmHash(null);
                                    await toggleInActiveSet(flavor.name, !overrideBroken);
                                  }}
                                  onContextMenu={(e: any) => {
                                    if (props.onContextMenu) {
                                      props.onContextMenu(e, flavor);
                                    }
                                  }}
                                  onSelect={() => {
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
                      </DeferredRender>
                    </div>
                  </div>
                </div>
                </AccordionDrawer>
            </React.Fragment>
          );
        })
        )}
      </div>
      {totalPages > 1 && (
        <div className={`flex justify-center items-center gap-4 mt-4 mb-24`}>
          <button
            onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-6 py-3 glass-surface rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            {t("nav_prev")}
          </button>
          <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-6 py-3 glass-surface rounded-xl overflow-hidden font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            {t("nav_next")}
          </button>
        </div>
      )
      }

    </>
  );
}
