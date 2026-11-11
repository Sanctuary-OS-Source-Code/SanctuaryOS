import React from 'react';
import { formatDisplayName, getExtensionRegex, isScriptExtension, EmptyState, AccordionDrawer, stripPriorityTierPrefix, ActionPill } from '../../shared';
import { ModCard } from '../../ModCard';

function DrawerFilterSection({ title, options, value, onChange, t }: any) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-col mb-4 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
        {title}
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt: any) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {opt.label}
              </span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t ? t("icon_check", "check") : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VaultGrid(props: any) {
  const { vaultLayout = "standard", paginatedMods, t, playSets, activePlaySetIndex, activeGameSchema, anarchyRules, isBulkMode, selectedMods, setDrawerConfirmHash, toggleInActiveSet, isVersionMatch, selectedVersion, setMetaNameInput, setMetaAuthorInput, setMetaVersionInput, setMetaDescInput, setMetaImageInput, setMetaAllowWriteInput, setActiveDossier, drawerConfirmHash, currentPage, setCurrentPage, totalPages, equippedDisplayMods, modListIndex, dependencyGraph, uppercaseEquippedMods, localConflictsMemo = [], ownedDLC, maskedDLC, displayModList, supabase, setMetaUrlInput, applyConflictOverride, setActiveTier3Conflict, expandedFolder, setExpandedFolder, hideGhostCards, hasActiveFilters, onResetFilters, setSelectedMods } = props;
  const localSets = Array.isArray(playSets) ? playSets : [];
  const [drawerSearchQuery, setDrawerSearchQuery] = React.useState("");
  const deferredDrawerSearch = React.useDeferredValue(drawerSearchQuery);
  const [drawerEquipFilter, setDrawerEquipFilter] = React.useState<"ALL" | "EQUIPPED" | "UNEQUIPPED">("ALL");
  const [drawerCategoryFilter, setDrawerCategoryFilter] = React.useState<string>("ALL");
  const [drawerStatusFilter, setDrawerStatusFilter] = React.useState<string>("ALL");
  const [drawerVisibleLimit, setDrawerVisibleLimit] = React.useState<number>(20);
  const drawerScrollRef = React.useRef<HTMLDivElement | null>(null);
  const drawerSentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDrawerSearchQuery("");
    setDrawerEquipFilter("ALL");
    setDrawerCategoryFilter("ALL");
    setDrawerStatusFilter("ALL");
    setDrawerVisibleLimit(20);
  }, [expandedFolder]);

  React.useEffect(() => {
    setDrawerVisibleLimit(20);
  }, [deferredDrawerSearch, drawerEquipFilter, drawerCategoryFilter, drawerStatusFilter]);
  const archetypePeersByHash = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (let i = 0; i < localSets.length; i++) {
      const arch = localSets[i]?.archetypes;
      if (!arch) continue;
      const group: string[] = [];
      if (arch.core) group.push(arch.core);
      if (Array.isArray(arch.twins)) group.push(...arch.twins.filter(Boolean));
      if (Array.isArray(arch.addons)) group.push(...arch.addons.filter(Boolean));
      if (group.length < 2) continue;
      for (let a = 0; a < group.length; a++) {
        const hA = group[a];
        let peers = map.get(hA);
        if (!peers) {
          peers = new Set<string>();
          map.set(hA, peers);
        }
        for (let b = 0; b < group.length; b++) {
          if (a !== b) peers.add(group[b]);
        }
      }
    }
    return map;
  }, [localSets]);
  const areArchetypes = React.useCallback((hash1: string, hash2: string) => {
    if (!hash1 || !hash2) return false;
    return archetypePeersByHash.get(hash1)?.has(hash2) || false;
  }, [archetypePeersByHash]);
  const activeSetMods = playSets[activePlaySetIndex]?.mods || [];
  const cleanedActiveSet = React.useMemo(() => {
    const s = new Set<string>();
    activeSetMods.forEach((m: string) => {
      if (!m || typeof m !== "string") return;
      s.add(m);
      const stripped = stripPriorityTierPrefix(m, activeGameSchema);
      if (stripped) s.add(stripped);
      const cleanFile = m.split(/[\\/]/).pop() || m;
      if (cleanFile) s.add(cleanFile);
    });
    return s;
  }, [activeSetMods, activeGameSchema]);

  const checkConflicts = React.useCallback((mObj: any, targetCasualties: any[], targetTier3: any[]) => {
    const mObjCleanN = (mObj.name || "").split(/[\\/]/).pop()?.replace(/\.[^/.]+$/i, "").toUpperCase() || "";
    const mObjBase = mObjCleanN.replace(/_SCRIPT(S)?$/i, "");
    const mObjDispUpper = mObj.displayName?.toUpperCase();
    if (mObj.conflicts && mObj.conflicts.length > 0) {
      const processSeverity = (targetRank: number, targetList: any[]) => {
        const found = mObj.conflicts.filter((c: any) => Number(c.severity_rank) == targetRank).map((c: any) => {
          const matchItem = uppercaseEquippedMods.find((item: any) => {
            const mData = item.mData;
            if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
            if (c.enemy_name) {
              const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase().replace(/_SCRIPT(S)?$/i, "");
              if (mObjBase === targetClean || (item.emBaseNoScript ?? item.emBaseClean.replace(/_SCRIPT(S)?$/i, "")) === targetClean || mObjDispUpper === targetClean || (item.emDispNoScript ?? item.emDisp.replace(/_SCRIPT(S)?$/i, "")) === targetClean) return true;
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
      processSeverity(4, targetCasualties);
      processSeverity(3, targetTier3);
    }

    uppercaseEquippedMods.forEach((item: any) => {
      const mData = item.mData;
      if (mData.conflicts && mData.conflicts.length > 0) {
        const found = mData.conflicts.filter((c: any) => {
          if (c.enemy_id && String(mObj.dbId) === String(c.enemy_id)) return true;
          if (c.enemy_name) {
            const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase().replace(/_SCRIPT(S)?$/i, "");
            if (mObjBase === targetClean || mObjDispUpper === targetClean) return true;
          }
          return false;
        });

        found.forEach((c: any) => {
          if (areArchetypes(mObj.hash, mData.hash)) return;
          const targetRank = Number(c.severity_rank);
          if (targetRank == 4) targetCasualties.push({ name: mData.displayName || mData.name, rawName: mData.name, note: c.conflict_note || c.resolution_note || "" });
          if (targetRank == 3) targetTier3.push({ name: mData.displayName || mData.name, rawName: mData.name, note: c.conflict_note || c.resolution_note || "" });
        });
      }
    });

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

          if (targetRank == 4) targetCasualties.push({ name: matchObj.displayName || matchObj.name, rawName: matchObj.name, note: lc.resolution_note || "Local Scan Detects Tuning Overlap" });
          if (targetRank == 3) targetTier3.push({ name: matchObj.displayName || matchObj.name, rawName: matchObj.name, note: lc.resolution_note || "Local Scan Detects Tuning Overlap" });
        }
      }
    });
  }, [uppercaseEquippedMods, localConflictsMemo, areArchetypes]);

  const { cardComputations, missingReqsByMod } = React.useMemo(() => {
    const map = new Map();
    const reqsByMod = new WeakMap<object, any[]>();

    paginatedMods.forEach((mod: any) => {
      const isEquipped = mod.isParent
        ? (mod.flavors || []).some((f: any) => cleanedActiveSet.has(f.name))
        : cleanedActiveSet.has(mod.name);
      
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

        checkConflicts(mod, casualties, tier3List);
        if (mod.isVirtual && mod.flavors) {
          mod.flavors.forEach((f: any) => checkConflicts(f, casualties, tier3List));
        }

        casualties = Array.from(new Map(casualties.map((item: any) => [item.name || item, item])).values());
        tier3List = Array.from(new Map(tier3List.map((item: any) => [item.name || item, item])).values());
      }
      if (anarchyRules?.intercept === false) {
        casualties = [];
      }

      const missingReqs: any[] = [];
      const checkModDeps = (m: any) => {
        if (!m || typeof m !== "object") return;
        const cachedModReqs = reqsByMod.get(m);
        if (cachedModReqs !== undefined) {
          cachedModReqs.forEach((r: any) => {
            if (!missingReqs.some(existing => existing.id === r.id)) missingReqs.push(r);
          });
          return;
        }

        const modReqs: any[] = [];
        reqsByMod.set(m, modReqs);
        const pushMissing = (reqOrStr: any, fallbackUrl?: string) => {
          const isObj = typeof reqOrStr === 'object';
          const id = isObj ? (reqOrStr.name || reqOrStr.id) : reqOrStr;
          const finalUrl = isObj ? (reqOrStr.url || reqOrStr.link) : fallbackUrl;
          if (!missingReqs.some(r => r.id === id)) missingReqs.push({ id, url: finalUrl });
          if (!modReqs.some((r: any) => r.id === id)) modReqs.push({ id, url: finalUrl });
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
    
    return { cardComputations: map, missingReqsByMod: reqsByMod };
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
    activeGameSchema
  ]);

  const expandedModEntry = React.useMemo(() => {
    if (!expandedFolder) return null;
    for (let index = 0; index < paginatedMods.length; index++) {
      const mod = paginatedMods[index];
      const mainKey = `${mod.hash || mod.name}-${index}`;
      if (mainKey === expandedFolder) {
        return { mod, index, mainKey };
      }
    }
    return null;
  }, [expandedFolder, paginatedMods]);

  const resolveFlavorCategory = React.useCallback((flavor: any): string => {
    const explicitCat = String(
      flavor?.category_override || flavor?.category || flavor?.subType || ""
    ).trim();
    if (
      explicitCat &&
      !/^(package|script|collection|folder|local|unknown|mod|module|artifact)$/i.test(explicitCat)
    ) {
      return explicitCat;
    }
    if (isScriptExtension(String(flavor?.name || flavor?.file_extension || ""), activeGameSchema)) {
      return "Script";
    }
    return explicitCat || "Module";
  }, [activeGameSchema]);

  const availableDrawerCategories = React.useMemo(() => {
    const flavors = expandedModEntry?.mod?.flavors || [];
    const set = new Set<string>();
    for (let i = 0; i < flavors.length; i++) {
      const cat = resolveFlavorCategory(flavors[i]);
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expandedModEntry, resolveFlavorCategory]);

  const filteredDrawerFlavors = React.useMemo(() => {
    const mod = expandedModEntry?.mod;
    if (!mod) return [];
    const flavors = Array.isArray(mod.flavors) ? mod.flavors : [];
    const normQuery = deferredDrawerSearch
      .trim()
      .toLowerCase()
      .replace(/[_.\-/\\]+/g, " ")
      .replace(/\s+/g, " ");

    return flavors.filter((flavor: any) => {
      const isEquipped = cleanedActiveSet.has(flavor.name);
      if (drawerEquipFilter === "EQUIPPED" && !isEquipped) return false;
      if (drawerEquipFilter === "UNEQUIPPED" && isEquipped) return false;

      if (drawerCategoryFilter !== "ALL") {
        const cat = resolveFlavorCategory(flavor);
        if (cat.toLowerCase() !== drawerCategoryFilter.toLowerCase()) return false;
      }

      if (drawerStatusFilter !== "ALL") {
        const rawStatus = String(flavor.status || "").toLowerCase();
        const isLocalOnly =
          !flavor.dbId ||
          rawStatus === "local" ||
          rawStatus === "unverified" ||
          String(flavor.version || "").toLowerCase() === "v.local";
        if (drawerStatusFilter === "UNVERIFIED") {
          if (!isLocalOnly) return false;
        } else if (rawStatus !== drawerStatusFilter.toLowerCase()) {
          return false;
        }
      }

      if (normQuery) {
        const disp = formatDisplayName(flavor.displayName || flavor.name || "")
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const rawName = String(flavor.name || "")
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const auth = String(flavor.author || mod.author || "")
          .toLowerCase()
          .replace(/[_.\-/\\]+/g, " ");
        const catStr = resolveFlavorCategory(flavor).toLowerCase();
        if (
          !disp.includes(normQuery) &&
          !rawName.includes(normQuery) &&
          !auth.includes(normQuery) &&
          !catStr.includes(normQuery)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    expandedModEntry,
    deferredDrawerSearch,
    drawerEquipFilter,
    drawerCategoryFilter,
    drawerStatusFilter,
    cleanedActiveSet,
    resolveFlavorCategory,
  ]);

  const visibleDrawerFlavors = React.useMemo(
    () =>
      filteredDrawerFlavors.length > drawerVisibleLimit
        ? filteredDrawerFlavors.slice(0, drawerVisibleLimit)
        : filteredDrawerFlavors,
    [filteredDrawerFlavors, drawerVisibleLimit]
  );

  React.useEffect(() => {
    if (drawerVisibleLimit >= filteredDrawerFlavors.length) return;
    const node = drawerSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          React.startTransition(() => {
            setDrawerVisibleLimit((prev) =>
              Math.min(filteredDrawerFlavors.length, prev + 25)
            );
          });
        }
      },
      { root: drawerScrollRef.current, rootMargin: "320px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [drawerVisibleLimit, filteredDrawerFlavors.length, expandedFolder]);

  const hasActiveDrawerFilters =
    drawerEquipFilter !== "ALL" ||
    drawerCategoryFilter !== "ALL" ||
    drawerStatusFilter !== "ALL";

  const drawerFilterPopoverContent = React.useMemo(
    () => (
      <div className="flex flex-col w-[440px] p-4 max-w-[calc(100vw-40px)] text-left">
        <DrawerFilterSection
          t={t}
          title={t("blueprint", "{Blueprint}")}
          value={drawerEquipFilter}
          onChange={(val: "ALL" | "EQUIPPED" | "UNEQUIPPED") =>
            setDrawerEquipFilter(val)
          }
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            {
              id: "EQUIPPED",
              label: t("filter_in_blueprint", "In {Blueprint}"),
            },
            {
              id: "UNEQUIPPED",
              label: t("filter_not_equipped", "Not Equipped"),
            },
          ]}
        />

        {availableDrawerCategories.length > 1 && (
          <DrawerFilterSection
            t={t}
            title={t("filter_category", "Filter Category")}
            value={drawerCategoryFilter}
            onChange={(val: string) => setDrawerCategoryFilter(val)}
            options={[
              { id: "ALL", label: t("filter_all", "All") },
              ...availableDrawerCategories.map((cat) => ({
                id: cat,
                label:
                  cat === "Script"
                    ? t("type_script", "Script")
                    : cat === "Package"
                      ? t("type_package", "Package")
                      : cat,
              })),
            ]}
          />
        )}

        <DrawerFilterSection
          t={t}
          title={t("filter_status", "Filter Status")}
          value={drawerStatusFilter}
          onChange={(val: string) => setDrawerStatusFilter(val)}
          options={[
            { id: "ALL", label: t("filter_all", "All") },
            { id: "stable", label: t("status_stable", "STABLE") },
            { id: "UNVERIFIED", label: t("unverified", "Unverified") },
            { id: "unstable", label: t("label_unstable", "Unstable") },
            { id: "corrupted", label: t("status_corrupted", "Corrupted") },
          ]}
        />

        {hasActiveDrawerFilters && (
          <button
            type="button"
            onClick={() => {
              setDrawerEquipFilter("ALL");
              setDrawerCategoryFilter("ALL");
              setDrawerStatusFilter("ALL");
            }}
            className="mt-1 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[11px] font-bold text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
              {t("icon_filter_alt_off", "filter_alt_off")}
            </span>
            <span>{t("btn_clear", "Clear Filters")}</span>
          </button>
        )}
      </div>
    ),
    [
      t,
      drawerEquipFilter,
      availableDrawerCategories,
      drawerCategoryFilter,
      drawerStatusFilter,
      hasActiveDrawerFilters,
    ]
  );

  const drawerComputations = React.useMemo(() => {
    const map = new Map();
    const mod = expandedModEntry?.mod;
    if (!mod) return map;

    const modBaseCasualties: any[] = [];
    const modBaseTier3: any[] = [];
    checkConflicts(mod, modBaseCasualties, modBaseTier3);

    let modRawDLC: string[] = [];
    if (mod.requiredDLC) {
      if (typeof mod.requiredDLC === 'string') {
        try { modRawDLC.push(...JSON.parse(mod.requiredDLC)); }
        catch { modRawDLC.push(...mod.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim())); }
      } else if (Array.isArray(mod.requiredDLC)) {
        modRawDLC.push(...mod.requiredDLC);
      }
    }
    const modVersionMismatch = Boolean(
      mod.compatible_versions &&
      mod.compatible_versions.length > 0 &&
      selectedVersion &&
      selectedVersion !== "" &&
      !isVersionMatch(mod.compatible_versions, selectedVersion)
    );

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

    visibleDrawerFlavors.forEach((flavor: any) => {
      const isFlavorEquipped = cleanedActiveSet.has(flavor.name);

      let drawerCasualties: any[] = [];
      let isSwappedState = false;
      let isBetaSwap = false;

      if (!isFlavorEquipped) {
        const localRivals = mod.isFlavorFolder
          ? (mod.flavors || []).filter((f: any) => f.name !== flavor.name && cleanedActiveSet.has(f.name) && !areArchetypes(flavor.hash, f.hash))
          : [];
        const globalRivals =
          flavor.flavorGroupId || flavor.communityGroupId || flavor.relationshipType === 'beta'
            ? equippedDisplayMods.filter((m: any) => {
                if (m.name === flavor.name) return false;
                const isSameFlavorGroup = (flavor.flavorGroupId && String(m.flavorGroupId) === String(flavor.flavorGroupId)) || (flavor.communityGroupId && String(m.communityGroupId) === String(flavor.communityGroupId));
                const isBetaRival = (flavor.relationshipType === 'beta' && m.relationshipType !== 'beta' || flavor.relationshipType !== 'beta' && m.relationshipType === 'beta') && (String(m.familyId) === String(flavor.familyId) || String(m.dbId) === String(flavor.familyId || flavor.dbId));
                if (isSameFlavorGroup || isBetaRival) {
                  if (areArchetypes(flavor.hash, m.hash)) return false;
                  return true;
                }
                return false;
              })
            : [];
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

      let flavorTier3: any[] = [];
      if (!isFlavorEquipped) {
        if (modBaseCasualties.length > 0) drawerCasualties.push(...modBaseCasualties);
        if (modBaseTier3.length > 0) flavorTier3.push(...modBaseTier3);
        checkConflicts(flavor, drawerCasualties, flavorTier3);

        drawerCasualties = Array.from(new Map(drawerCasualties.map((item: any) => [item.name || item, item])).values());
        flavorTier3 = Array.from(new Map(flavorTier3.map((item: any) => [item.name || item, item])).values());
      }
      if (anarchyRules?.intercept === false) {
        drawerCasualties = [];
      }

      let rawFlavorDLC: string[] = [...modRawDLC];
      if (flavor.requiredDLC) {
        if (typeof flavor.requiredDLC === 'string') {
          try { rawFlavorDLC.push(...JSON.parse(flavor.requiredDLC)); }
          catch { rawFlavorDLC.push(...flavor.requiredDLC.replace(/[\{\}\[\]]/g, '').split(',').map((s: string) => s.replace(/^"/, '').replace(/"$/, '').trim())); }
        }
        else if (Array.isArray(flavor.requiredDLC)) rawFlavorDLC.push(...flavor.requiredDLC);
      }

      let flavorDLC = Array.from(new Set(rawFlavorDLC))
        .map((p: string) => String(p).replace(/[\{\}\[\]"']/g, "").trim())
        .filter((p: string) => {
          const code = p.split(' ')[0].toUpperCase().trim();
          return Boolean(code) && code !== "BASE";
        });
      const missingPacks = flavorDLC.filter((p: string) => {
        const baseCode = p.split(' ')[0].toUpperCase().trim();
        return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
      });
      const flavorMissingReqs = (flavor && typeof flavor === "object" ? missingReqsByMod.get(flavor) : undefined) ?? flavor?.missingReqs;
      const modMissingReqs = (mod && typeof mod === "object" ? missingReqsByMod.get(mod) : undefined) ?? mod?.missingReqs;
      const hasMissingDeps = Boolean((flavorMissingReqs && flavorMissingReqs.length > 0) || (modMissingReqs && modMissingReqs.length > 0));

      const flavorVersionMismatch = Boolean(
        (flavor.compatible_versions && flavor.compatible_versions.length > 0 && selectedVersion && selectedVersion !== "" && !isVersionMatch(flavor.compatible_versions, selectedVersion)) ||
        modVersionMismatch
      );
      const flavorGhostReason = flavorVersionMismatch ? "VERSION_MISMATCH" : (missingPacks.length > 0 ? "MISSING_DLC" : null);
      const isFlavorGhosted = missingPacks.length > 0 || hasMissingDeps || Boolean(flavorVersionMismatch);

      map.set(flavor.hash || flavor.name, {
        isFlavorEquipped,
        drawerCasualties,
        flavorTier3,
        isSwappedState,
        isBetaSwap,
        missingPacks,
        hasMissingDeps,
        flavorVersionMismatch,
        flavorGhostReason,
        isFlavorGhosted
      });
    });

    return map;
  }, [expandedModEntry, visibleDrawerFlavors, cleanedActiveSet, equippedDisplayMods, dependencyGraph, activeGameSchema, localSets, anarchyRules, ownedDLC, maskedDLC, selectedVersion, checkConflicts]);


  const gridLayoutClass = vaultLayout === "list" ? "grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(450px,1fr))]" : vaultLayout === "compact" ? "grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(220px,1fr))]" : "grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(350px,1fr))]";

  return (
    <>
      <div id="vault-grid-container" className={`${gridLayoutClass} gap-6 pb-24 pl-2 pr-6 relative`}>
        {paginatedMods.length === 0 ? (
          <EmptyState
            icon={t("icon_search_off", "search_off")}
            title={t("registry_no_mods", "No {Mods} Found")}
            subtitle={t("vault_no_results_sub", "Try adjusting your search criteria or filters.")}
            action={
              hasActiveFilters && onResetFilters ? (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="px-4 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.30))] text-xs font-black tracking-wide text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                    {t("icon_filter_alt_off", "filter_alt_off")}
                  </span>
                  <span>{t("btn_clear", "Clear Filters")}</span>
                </button>
              ) : undefined
            }
            className="col-span-full py-24"
          />
        ) : (
          paginatedMods.map((mod: any, index: number) => {
            const mainKey = `${mod.hash || mod.name}-${index}`;
            const comp = cardComputations.get(mod.hash || mod.name) || { isEquipped: false, casualties: [], tier3List: [], isFlavorSwapCard: false, missingReqs: [] };
            const { isEquipped, casualties, tier3List, isFlavorSwapCard, missingReqs } = comp;

            let renderedMod = mod;

            const renderedModCard = (
              <ModCard
                layout={vaultLayout}
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
                isGhostPlaceholder={expandedFolder === mainKey}
                isExpanded={expandedFolder === mainKey}
                isFlavorSwap={isFlavorSwapCard}
                onExpand={() =>
                  setExpandedFolder((prev: string | null) =>
                    prev === mainKey ? null : mainKey,
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
                  {renderedModCard}
                </div>

                {expandedFolder === mainKey && (
                <AccordionDrawer isOpen={true}>
                  <div
                    className="w-full glass-panel rounded-3xl p-6 md:p-8 border border-[color-mix(in_srgb,var(--accent)_25%,rgba(255,255,255,0.16))] shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex flex-col gap-6 relative isolate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Unified Full-Width Folder Header */}
                    <div className="flex flex-wrap gap-4 items-center justify-between pb-5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] relative z-20 w-full">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">
                            {t("icon_folder_open", "folder_open")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <h3 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight leading-tight truncate">
                            {formatDisplayName(renderedMod.displayName || renderedMod.name)}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0">
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_account_tree", "account_tree")}
                              </span>
                              <span>
                                {t("nav_exploring", "Exploring")}{" "}
                                {filteredDrawerFlavors.length !== (renderedMod.flavors || []).length
                                  ? `${filteredDrawerFlavors.length} / ${(renderedMod.flavors || []).length}`
                                  : (renderedMod.flavors || []).length}{" "}
                                {t("term_mods", "Artifacts")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto relative z-30">
                        <div className="flex-1 md:w-80 lg:w-96" onClick={(e) => e.stopPropagation()}>
                          <ActionPill
                            searchQuery={drawerSearchQuery}
                            setSearchQuery={setDrawerSearchQuery}
                            searchPlaceholder={t("search_ph", "Search {mods}...")}
                            primaryPopover={{
                              icon: t("icon_tune", "tune"),
                              label: t("filters", "Filters"),
                              content: drawerFilterPopoverContent,
                            }}
                            className="!w-full !max-w-full"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrawerSearchQuery("");
                            setExpandedFolder(null);
                          }}
                          className="w-11 h-11 rounded-2xl glass-surface hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_35%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--text)] transition-colors shadow-sm shrink-0 cursor-pointer pointer-events-auto"
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_close", "close")}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Folder Sub-Cards Grid */}
                    <div className="w-full relative z-10">
                      {filteredDrawerFlavors.length === 0 ? (
                        <EmptyState
                          icon={t("icon_search_off", "search_off")}
                          title={t("registry_no_mods", "No {Mods} Found")}
                          minHeightClass="min-h-[180px]"
                          className="col-span-full py-6"
                        />
                      ) : (
                        <div
                          ref={drawerScrollRef}
                          onScroll={(e) => {
                            if (drawerVisibleLimit >= filteredDrawerFlavors.length) return;
                            const el = e.currentTarget;
                            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 360) {
                              React.startTransition(() => {
                                setDrawerVisibleLimit((prev) =>
                                  Math.min(filteredDrawerFlavors.length, prev + 25)
                                );
                              });
                            }
                          }}
                          className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 max-h-[520px] lg:max-h-[620px] overflow-y-auto custom-scrollbar p-1"
                        >
                          {visibleDrawerFlavors.map((flavor: any, subIdx: number) => {
                            const comp = drawerComputations.get(flavor.hash || flavor.name) || { isFlavorEquipped: cleanedActiveSet.has(flavor.name), drawerCasualties: [], flavorTier3: [], isSwappedState: false, isBetaSwap: false, missingPacks: [], hasMissingDeps: false, flavorVersionMismatch: false, flavorGhostReason: null, isFlavorGhosted: false };
                            const { isFlavorEquipped, drawerCasualties, flavorTier3, isSwappedState, isBetaSwap, missingPacks, hasMissingDeps, flavorGhostReason, isFlavorGhosted } = comp;

                            const flavorMissingReqs = (flavor && typeof flavor === "object" ? missingReqsByMod.get(flavor) : undefined) ?? flavor?.missingReqs ?? [];
                            const modMissingReqs = (mod && typeof mod === "object" ? missingReqsByMod.get(mod) : undefined) ?? mod?.missingReqs ?? [];
                            const combinedMissingDeps = [...flavorMissingReqs, ...modMissingReqs].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

                            return (
                              <ModCard
                                compact={true}
                                hideHitBox={true}
                                key={`sub-${flavor.hash || flavor.name}-${subIdx}`}
                                mod={flavor}
                                gameVersion={selectedVersion}
                                ownedDLC={ownedDLC}
                                maskedDLC={maskedDLC}
                                isInActiveSet={isFlavorEquipped}
                                casualtyList={drawerCasualties}
                                anarchyRules={anarchyRules}
                                tier3List={flavorTier3 || []}
                                missingDeps={combinedMissingDeps}
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
                                  if (!overrideBroken && !isFlavorEquipped && drawerCasualties.length > 0 && drawerConfirmHash !== flavor.hash && anarchyRules?.intercept !== false) {
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
                          })}
                          {drawerVisibleLimit < filteredDrawerFlavors.length && (
                            <div ref={drawerSentinelRef} className="col-span-full h-2" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionDrawer>
                )}
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
            className="px-6 py-3 glass-surface rounded-xl overflow-hidden font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            {t("nav_prev", "PREV")}
          </button>
          <span className="text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] px-4">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-6 py-3 glass-surface rounded-xl overflow-hidden font-black text-[10px] capitalize tracking-widest disabled:opacity-30 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          >
            {t("nav_next", "NEXT")}
          </button>
        </div>
      )
      }

    </>
  );
}



