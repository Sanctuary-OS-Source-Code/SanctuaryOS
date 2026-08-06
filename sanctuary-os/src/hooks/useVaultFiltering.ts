import React from 'react';
import { isVersionMatch, getHighestVersion, getLowestVersion, getExtensionRegex } from '../shared';

export function useVaultFiltering({
  playSets,
  activePlaySetIndex,
  displayModList,
  modList,
  activeGameSchema,
  visibleMods,
  selectedVersion,
  hideGhostCards,
  equipFilter,
  archiveVersionFilter,
  ownedDLC,
  maskedDLC
}: any) {
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
    });

    return { byDbId, byHash, byInterchangeableId, byName, namesAndDisplayNames };
  }, [modList, activeGameSchema]);


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

  return {
    activeSetModsMemo,
    equippedDisplayMods,
    virtualFolderIds,
    localConflictsMemo,
    uppercaseEquippedMods,
    modListIndex,
    finalVisibleMods,
    dependencyGraph
  };
}
