import {
  getHighestVersion,
  formatVersionRangesLabel,
  getExtensionRegex,
  isVersionMatch,
  parseStringArray,
  cleanSearchName,
  formatDisplayName,
  stripPriorityTierPrefix,
  resolveModHighlanderSlot,
} from "../shared";
import {
  extractCleanUuid,
  collectAllCandidateUuids,
  normTitleForMatch,
} from "../mod-dossier/dossierHelpersAndFetch";

export function useModDossierEquipAlerts({
  onToggleInActiveSet,
  activeGameSchema,
  selectedVersion,
  storePlaySets,
  anarchyRules,
  effectiveOwnedDLC,
  effectiveMaskedDLC,
  setDossierAlertPending,
  vaultIndex,
  mod,
  selectedKid,
  setSelectedKid,
  isModNameEquipped,
  groupedKids,
  groupedRelations,
  kids,
  getVersions,
  familyVersion,
}: any) {
  const getBatchCasualties = (
    targetNames: string[],
    rootLabel?: string
  ): string[] => {
    if (!targetNames || targetNames.length === 0) return [];
    const extRegex = getExtensionRegex(activeGameSchema);
    const getBaseNoScript = (raw: string) =>
      String(raw || "")
        .split(/[\\/]/)
        .pop()
        ?.replace(extRegex, "")
        .toUpperCase()
        .replace(/_SCRIPT(S)?$/i, "") || "";
    const normLookup = (s: string) =>
      stripPriorityTierPrefix(String(s || ""), activeGameSchema)
        .replace(/\\/g, "/")
        .toLowerCase();

    // Build fast O(1) lookup structures over vaultIndex.physicalMods once per batch
    const byBaseNoScript = new Map<string, any[]>();
    const byNormRel = new Map<string, any>();
    const byNormBase = new Map<string, any>();
    const equippedWithReqs: any[] = [];

    for (const pm of vaultIndex.physicalMods) {
      if (!pm?.name) continue;
      const bns = getBaseNoScript(pm.name);
      if (bns) {
        let arr = byBaseNoScript.get(bns);
        if (!arr) {
          arr = [];
          byBaseNoScript.set(bns, arr);
        }
        arr.push(pm);
      }
      const nr = normLookup(pm.name);
      if (nr && !byNormRel.has(nr)) byNormRel.set(nr, pm);
      const nb = nr.split("/").pop() || "";
      if (nb && !byNormBase.has(nb)) byNormBase.set(nb, pm);

      if (isModNameEquipped(pm.name)) {
        const hasReqs =
          (Array.isArray(pm.requirements) && pm.requirements.length > 0) ||
          (Array.isArray(pm.requires) && pm.requires.length > 0) ||
          (Array.isArray(pm.twins) && pm.twins.length > 0);
        if (hasReqs) equippedWithReqs.push(pm);
      }
    }

    const resolveTargetMod = (tName: string): any => {
      const direct =
        vaultIndex.physicalByName.get(tName)?.[0] ||
        vaultIndex.physicalByName.get(tName.toLowerCase())?.[0];
      if (direct) return direct;
      const tNorm = normLookup(tName);
      const tBase = tNorm.split("/").pop() || tNorm;
      return (
        byNormRel.get(tNorm) ||
        byNormBase.get(tBase) ||
        (mod?.name === tName || normLookup(mod?.name || "") === tNorm ? mod : null)
      );
    };

    const initialTargets: any[] = [];
    const initialNameSet = new Set<string>(targetNames);
    for (const tn of targetNames) {
      const found = resolveTargetMod(tn);
      if (found) {
        if (found.isVirtual && Array.isArray(found.flavors) && found.flavors.length > 0) {
          for (const fl of found.flavors) {
            if (fl?.name) {
              initialTargets.push(fl);
              initialNameSet.add(fl.name);
            }
          }
        } else {
          initialTargets.push(found);
          if (found.name) initialNameSet.add(found.name);
        }
      }
    }
    if (initialTargets.length === 0) return [];

    const toDelete = new Set<string>();
    const deletedModMap = new Map<string, any>();
    const deletedUuids = new Set<string>();
    const deletedDbIds = new Set<string>();
    const deletedHashes = new Set<string>();
    const deletedDispUpperList: string[] = [];

    const registerDeletedMod = (mObj: any) => {
      if (!mObj?.name || toDelete.has(mObj.name)) return;
      toDelete.add(mObj.name);
      deletedModMap.set(mObj.name, mObj);
      collectAllCandidateUuids(mObj).forEach((u) => deletedUuids.add(u));
      if (mObj.dbId) deletedDbIds.add(String(mObj.dbId));
      if (mObj.hash) deletedHashes.add(String(mObj.hash).toLowerCase());
      const dispUpper = String(mObj.displayName || mObj.name || "").toUpperCase();
      if (dispUpper) {
        deletedDispUpperList.push(dispUpper);
        const spaced = dispUpper.replace(/_/g, " ");
        if (spaced !== dispUpper) deletedDispUpperList.push(spaced);
      }
    };

    const localSets = Array.isArray(storePlaySets) ? storePlaySets : [];

    for (const mItem of initialTargets) {
      if (!mItem?.name) continue;
      registerDeletedMod(mItem);

      const mItemBase = getBaseNoScript(mItem.name);
      if (mItemBase) {
        const sameBase = byBaseNoScript.get(mItemBase);
        if (sameBase) {
          for (const cand of sameBase) {
            if (cand?.name && cand.name !== mItem.name && isModNameEquipped(cand.name)) {
              registerDeletedMod(cand);
            }
          }
        }
      }

      // Only expand family/archetype siblings when checking a single item/module,
      // or if not already covered by the batch target list
      if (targetNames.length <= 4) {
        const familyAnchor = mItem.familyId || mItem.dbId;
        const isMaster = mItem.dbId && String(mItem.dbId) === String(familyAnchor);
        const isArchMember = localSets.some(
          (s: any) =>
            s?.archetypes?.core === mItem.hash ||
            s?.archetypes?.twins?.includes(mItem.hash)
        );
        if (
          mItem.isVirtual ||
          isMaster ||
          isArchMember ||
          mItem.relationshipType === "twin" ||
          mItem.relationshipType === "core" ||
          mItem.relationshipType === "beta"
        ) {
          const anchorUuid = extractCleanUuid(familyAnchor, mItem.dbId).toLowerCase();
          const famCands = anchorUuid ? vaultIndex.byUuid.get(anchorUuid) || [] : [];
          for (const fm of famCands) {
            if (fm?.name && !fm.isVirtual && isModNameEquipped(fm.name)) {
              registerDeletedMod(fm);
            }
          }
        }
      }
    }

    let keepChecking = true;
    while (keepChecking) {
      keepChecking = false;
      for (const m of equippedWithReqs) {
        if (!m?.name || toDelete.has(m.name)) continue;
        const allModReqs = [
          ...(Array.isArray(m.requirements) ? m.requirements : []),
          ...(Array.isArray(m.requires) ? m.requires : []),
          ...(Array.isArray(m.twins) ? m.twins : []),
        ];
        const isDependent = allModReqs.some((r: any) => {
          if (!r) return false;
          const rawReqId =
            typeof r === "string" ? r : r.id || r.dbId || r.hash || "";
          const cleanReqUuid = extractCleanUuid(rawReqId).toLowerCase();
          if (cleanReqUuid && deletedUuids.has(cleanReqUuid)) return true;
          if (rawReqId) {
            if (deletedDbIds.has(String(rawReqId))) return true;
            if (deletedHashes.has(String(rawReqId).toLowerCase())) return true;
          }
          const reqName =
            typeof r === "string"
              ? r.split("@").pop() || r
              : r.name || r.displayName || r.id || "";
          const isReqNumeric = !isNaN(Number(reqName));
          if (!isReqNumeric) {
            const reqBaseName = String(reqName)
              .split(/[\\/]/)
              .pop()
              ?.replace(extRegex, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "");
            if (reqBaseName && reqBaseName.length > 2) {
              const reqSpaced = reqBaseName.replace(/_/g, " ");
              if (
                deletedDispUpperList.some(
                  (d) => d.includes(reqBaseName) || d.includes(reqSpaced)
                )
              ) {
                return true;
              }
            }
          }
          return false;
        });

        if (isDependent) {
          registerDeletedMod(m);
          keepChecking = true;
        }
      }
    }

    initialNameSet.forEach((n) => toDelete.delete(n));
    if (toDelete.size === 0) return [];

    const firstTarget = initialTargets[0];
    const cleanTarget =
      rootLabel ||
      (
        firstTarget?.displayName ||
        (firstTarget?.name || targetNames[0] || "").split(/[\\/]/).pop() ||
        ""
      )
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");

    const cleanDeps = Array.from(toDelete).map((delName) => {
      const d =
        deletedModMap.get(delName) ||
        vaultIndex.physicalByName.get(delName)?.[0];
      if (!d)
        return (delName.split(/[\\/]/).pop() || delName)
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");
      return (d.displayName || (d.name || "").split(/[\\/]/).pop() || "")
        .replace(/_/g, " ")
        .replace(/\.[^/.]+$/, "");
    });

    return [cleanTarget, ...Array.from(new Set(cleanDeps))];
  };

  const getCasualties = (targetName: string): string[] =>
    getBatchCasualties([targetName]);

  const evaluatePreEquipAlerts = (
    targetNames: string[],
    explicitItems: any[] = []
  ) => {
    const extRegex = getExtensionRegex(activeGameSchema);
    const resolvedTargets: any[] = [];
    const seenNames = new Set<string>();
    const targetNameSet = new Set<string>(targetNames);

    const addTargetObj = (obj: any) => {
      if (!obj) return;
      const key = String(obj.name || obj.hash || obj.dbId || "");
      if (key && seenNames.has(key)) return;
      if (key) seenNames.add(key);
      resolvedTargets.push(obj);
    };

    explicitItems.forEach(addTargetObj);
    const flavorByName = new Map<string, any>();
    if (Array.isArray(mod?.flavors)) {
      mod.flavors.forEach((f: any) => {
        if (f?.name) flavorByName.set(f.name, f);
      });
    }
    targetNames.forEach((n) => {
      const found =
        vaultIndex.physicalByName.get(n)?.[0] ||
        vaultIndex.physicalByName.get(n.toLowerCase())?.[0] ||
        flavorByName.get(n) ||
        (mod?.name === n ? mod : null);
      if (found) addTargetObj(found);
    });
    if (resolvedTargets.length === 0 && mod) {
      addTargetObj(mod);
    }

    // 1. Game Version Mismatch
    const mismatchedTargets = selectedVersion
      ? resolvedTargets.filter((tm) => {
          const vList = getVersions(tm).filter(Boolean);
          return vList.length > 0 && !isVersionMatch(vList, selectedVersion);
        })
      : [];
    const mismatchedVersionsList = Array.from(
      new Set(mismatchedTargets.flatMap((tm) => getVersions(tm)).filter(Boolean))
    );
    const effectiveTargetVer =
      mismatchedVersionsList.length > 0
        ? formatVersionRangesLabel(mismatchedVersionsList)
        : familyVersion;

    const isGameVersionMismatch = mismatchedTargets.length > 0;

    // 2. Missing DLC
    const rawDlcSet = new Set<string>();
    const collectDlc = (item: any) => {
      if (!item?.requiredDLC) return;
      parseStringArray(item.requiredDLC).forEach((d: string) => {
        const code = d.split(" ")[0].toUpperCase().trim();
        if (code && code !== "BASE") rawDlcSet.add(d.trim());
      });
    };
    collectDlc(mod);
    resolvedTargets.forEach(collectDlc);
    const missingPacks = Array.from(rawDlcSet).filter((p: string) => {
      const baseCode = p.split(" ")[0].toUpperCase().trim();
      return (
        !effectiveOwnedDLC.includes(baseCode) ||
        effectiveMaskedDLC.includes(baseCode)
      );
    });

    // 3. Missing Dependencies & Twins
    const missingDeps: any[] = [];
    const seenMissingKeys = new Set<string>();
    const selfUuids = new Set<string>();
    const selfBaseNames = new Set<string>();
    [mod, ...resolvedTargets, ...(mod?.flavors || [])].forEach((item) => {
      if (!item) return;
      collectAllCandidateUuids(item).forEach((u) => selfUuids.add(u));
      if (item.name) {
        selfBaseNames.add(
          String(item.name)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || ""
        );
      }
    });

    groupedRelations.forEach((rel: any) => {
      if (rel && rel.isInstalled === false) {
        const key = String(rel.dbId || rel.hash || rel._groupedTitle || "").toLowerCase();
        if (key && !seenMissingKeys.has(key)) {
          seenMissingKeys.add(key);
          missingDeps.push(rel);
        }
      }
    });

    resolvedTargets.forEach((tm) => {
      const reqList = [
        ...(Array.isArray(tm?.requirements) ? tm.requirements : []),
        ...(Array.isArray(tm?.requires) ? tm.requires : []),
        ...(Array.isArray(tm?.twins) ? tm.twins : []),
      ];
      reqList.forEach((req: any) => {
        if (!req) return;
        const rawId =
          typeof req === "string" ? req : req.id || req.dbId || req.hash || "";
        const cleanId = extractCleanUuid(rawId).toLowerCase();
        const rawName =
          typeof req === "string"
            ? req.split("@").pop() || req
            : req.name || req.displayName || String(rawId);
        const baseName =
          String(rawName)
            .split(/[\\/]/)
            .pop()
            ?.replace(extRegex, "")
            .toLowerCase() || "";

        if (cleanId && selfUuids.has(cleanId)) return;
        if (baseName && selfBaseNames.has(baseName)) return;

        let installedMatch: any = null;
        if (cleanId) {
          installedMatch =
            vaultIndex.physicalByUuid.get(cleanId)?.[0] ||
            vaultIndex.virtualByUuid.get(cleanId) ||
            null;
        }
        if (!installedMatch && rawId) {
          installedMatch =
            vaultIndex.physicalByHash.get(String(rawId).toLowerCase())?.[0] ||
            null;
        }
        if (!installedMatch && baseName && isNaN(Number(baseName))) {
          const normTitle = normTitleForMatch(rawName);
          if (normTitle) {
            installedMatch = vaultIndex.physicalByNormTitle.get(normTitle)?.[0] || null;
          }
          if (!installedMatch) {
            installedMatch = vaultIndex.physicalMods.find((m: any) => {
              const mDisp = String(m.displayName || m.name || "").toLowerCase();
              return (
                mDisp.includes(baseName) ||
                mDisp.replace(/_/g, " ").includes(baseName.replace(/_/g, " "))
              );
            });
          }
        }
        if (!installedMatch) {
          const dedupKey = cleanId || baseName || String(rawId).toLowerCase();
          if (dedupKey && !seenMissingKeys.has(dedupKey)) {
            seenMissingKeys.add(dedupKey);
            missingDeps.push(
              typeof req === "object"
                ? req
                : { id: cleanId || rawId, name: cleanSearchName(rawName, activeGameSchema) }
            );
          }
        }
      });
    });

    // 4. Broken / Corrupted Status
    const getIsBrokenMod = (m: any) => {
      if (!m) return false;
      const st = String(m.status || "").toLowerCase();
      let broken = st === "broken" || st === "corrupted";
      if (
        broken &&
        st === "broken" &&
        m.compatible_versions &&
        m.compatible_versions.length > 0 &&
        selectedVersion
      ) {
        if (selectedVersion !== getHighestVersion(getVersions(m))) {
          broken = false;
        }
      }
      return broken;
    };
    const brokenMods = resolvedTargets.filter(getIsBrokenMod);
    if (brokenMods.length === 0 && getIsBrokenMod(mod) && !mod.isVirtual) {
      brokenMods.push(mod);
    }

    // 5. Flavor / Beta Swap Rivals & 6. Severity 4 / Severity 3 Collisions
    const flavorRivals: any[] = [];
    const fatalConflicts: any[] = [];
    const tier3Conflicts: any[] = [];
    const seenRivals = new Set<string>();
    const seenFatal = new Set<string>();
    const seenTier3 = new Set<string>();

    const getModBaseFamilyKey = (x: any): string =>
      String(x?.baseFamilyId || x?.familyId || x?.dbId || x?.name || "")
        .split("@")[0]
        .trim()
        .toLowerCase();

    const equippedModObjects = vaultIndex.physicalMods.filter(
      (m: any) => m?.name && !targetNameSet.has(m.name) && isModNameEquipped(m.name)
    );
    const equippedRivalCandidates = equippedModObjects.filter(
      (eq: any) =>
        resolveModHighlanderSlot(eq) != null ||
        eq.relationshipType === "flavor" ||
        eq.communityGroupId != null ||
        eq.relationshipType === "beta"
    );
    const equippedWithConflicts = equippedModObjects.filter(
      (eq: any) => Array.isArray(eq.conflicts) && eq.conflicts.length > 0
    );
    const equippedByUuid = new Map<string, any>();
    const equippedByCleanName = new Map<string, any>();
    for (const eq of equippedModObjects) {
      collectAllCandidateUuids(eq).forEach((u) => {
        if (!equippedByUuid.has(u)) equippedByUuid.set(u, eq);
      });
      const eqBase =
        String(eq.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      if (eqBase && !equippedByCleanName.has(eqBase)) {
        equippedByCleanName.set(eqBase, eq);
      }
      const eqDisp = String(eq.displayName || "").toUpperCase();
      if (eqDisp && !equippedByCleanName.has(eqDisp)) {
        equippedByCleanName.set(eqDisp, eq);
      }
    }

    const matchedExclusiveSlots: string[] = [];

    resolvedTargets.forEach((tm) => {
      if (!tm) return;
      if (anarchyRules?.highlander !== false) {
        const allowParentSlotFallback =
          tm.relationshipType !== "addon" && tm.relationshipType !== "flavor";
        const tmSlot =
          resolveModHighlanderSlot(tm) ||
          (allowParentSlotFallback ? resolveModHighlanderSlot(mod) : null);
        const tmBaseFam = getModBaseFamilyKey(tm);
        if (
          tmSlot != null ||
          tm.relationshipType === "flavor" ||
          tm.communityGroupId != null ||
          tm.relationshipType === "beta" ||
          equippedRivalCandidates.length > 0
        ) {
          equippedRivalCandidates.forEach((eq: any) => {
            if (eq.name === tm.name) return;
            const eqSlot = resolveModHighlanderSlot(eq);
            const eqBaseFam = getModBaseFamilyKey(eq);
            const eqCleanId = String(eq.dbId || eq.id || "").trim();
            const isExplicitTwin =
              tm.relationshipType === "twin" ||
              eq.relationshipType === "twin" ||
              (Array.isArray(tm.interchangeableIds) &&
                eqCleanId &&
                tm.interchangeableIds.map(String).includes(eqCleanId));
            const areSameModTwins = Boolean(
              tmBaseFam && eqBaseFam === tmBaseFam && isExplicitTwin
            );
            const isHighlanderSlotRival = Boolean(
              tmSlot &&
              eqSlot &&
              tmSlot.key === eqSlot.key &&
              !areSameModTwins
            );
            const isIntraFamilyFlavorRival = Boolean(
              tm.relationshipType === "flavor" &&
              eq.relationshipType === "flavor" &&
              tmBaseFam &&
              eqBaseFam === tmBaseFam
            );
            const isCommunityRival = Boolean(
              tm.communityGroupId &&
              eq.communityGroupId &&
              String(tm.communityGroupId) === String(eq.communityGroupId)
            );
            const isBetaRival =
              ((tm.relationshipType === "beta" && eq.relationshipType !== "beta") ||
                (tm.relationshipType !== "beta" && eq.relationshipType === "beta")) &&
              (tm.familyId || tm.dbId) &&
              (String(eq.familyId) === String(tm.familyId || tm.dbId) ||
                String(eq.dbId) === String(tm.familyId || tm.dbId));

            if (
              isHighlanderSlotRival ||
              isIntraFamilyFlavorRival ||
              isCommunityRival ||
              isBetaRival
            ) {
              const isModuleScoped =
                eq.relationshipType === "addon" ||
                eq.relationshipType === "flavor" ||
                (tmBaseFam && eqBaseFam === tmBaseFam);
              const rivalKey =
                isHighlanderSlotRival && !isModuleScoped ? eqBaseFam || eq.name : eq.name;
              if (!seenRivals.has(rivalKey)) {
                seenRivals.add(rivalKey);
                let displayTitle = eq.displayName || eq.name || "";
                if (isHighlanderSlotRival && !isModuleScoped && (eq.familyId || eq.dbId)) {
                  const parentCandidates =
                    vaultIndex.byUuid.get(
                      extractCleanUuid(eq.baseFamilyId, eq.familyId, eq.dbId).toLowerCase()
                    ) || [];
                  const virtualParent = parentCandidates.find((p: any) => p?.isVirtual && p?.displayName);
                  if (virtualParent?.displayName) {
                    displayTitle = virtualParent.displayName;
                  }
                }
                if (
                  isHighlanderSlotRival &&
                  tmSlot?.label &&
                  !matchedExclusiveSlots.includes(tmSlot.label)
                ) {
                  matchedExclusiveSlots.push(tmSlot.label);
                }
                flavorRivals.push({
                  ...eq,
                  _displayTitle: displayTitle,
                  _slotLabel: isHighlanderSlotRival ? tmSlot?.label : undefined,
                });
              }
            }
          });
        }
      }

      const tmBase =
        String(tm.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      const tmDispUpper = String(tm.displayName || "").toUpperCase();
      const tmUuidSet = new Set(collectAllCandidateUuids(tm));

      const allTargetConflicts = [
        ...(Array.isArray(tm.conflicts) ? tm.conflicts : []),
        ...(Array.isArray(mod?.conflicts) ? mod.conflicts : []),
      ];

      allTargetConflicts.forEach((c: any) => {
        if (!c) return;
        const rank = Number(c.severity_rank || 4);
        const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
        const enemyClean = c.enemy_name
          ? String(c.enemy_name)
            .replace(/\.[^/.]+$/i, "")
            .toUpperCase()
            .replace(/_SCRIPT(S)?$/i, "")
          : "";

        const matchedEquipped =
          (enemyId ? equippedByUuid.get(enemyId) : null) ||
          (enemyClean ? equippedByCleanName.get(enemyClean) : null);

        if (matchedEquipped) {
          if (rank === 4 && anarchyRules?.intercept !== false) {
            if (!seenFatal.has(matchedEquipped.name)) {
              seenFatal.add(matchedEquipped.name);
              fatalConflicts.push(matchedEquipped);
            }
          } else if (rank === 3) {
            if (!seenTier3.has(matchedEquipped.name)) {
              seenTier3.add(matchedEquipped.name);
              tier3Conflicts.push(matchedEquipped);
            }
          }
        }
      });

      equippedWithConflicts.forEach((eq: any) => {
        eq.conflicts.forEach((c: any) => {
          if (!c) return;
          const rank = Number(c.severity_rank || 4);
          const enemyId = c.enemy_id ? extractCleanUuid(c.enemy_id).toLowerCase() : "";
          const enemyClean = c.enemy_name
            ? String(c.enemy_name)
              .replace(/\.[^/.]+$/i, "")
              .toUpperCase()
              .replace(/_SCRIPT(S)?$/i, "")
            : "";
          const isMatch =
            (enemyId && tmUuidSet.has(enemyId)) ||
            (enemyClean && (tmBase === enemyClean || tmDispUpper === enemyClean));
          if (isMatch) {
            if (rank === 4 && anarchyRules?.intercept !== false) {
              if (!seenFatal.has(eq.name)) {
                seenFatal.add(eq.name);
                fatalConflicts.push(eq);
              }
            } else if (rank === 3) {
              if (!seenTier3.has(eq.name)) {
                seenTier3.add(eq.name);
                tier3Conflicts.push(eq);
              }
            }
          }
        });
      });
    });

    const hasAnyAlert =
      isGameVersionMismatch ||
      missingPacks.length > 0 ||
      missingDeps.length > 0 ||
      brokenMods.length > 0 ||
      flavorRivals.length > 0 ||
      fatalConflicts.length > 0 ||
      tier3Conflicts.length > 0;

    return {
      hasAnyAlert,
      isGameVersionMismatch,
      requiredGameVersion: effectiveTargetVer,
      missingPacks,
      missingDeps,
      brokenMods,
      flavorRivals,
      exclusiveSlotName: matchedExclusiveSlots[0] || "",
      fatalConflicts,
      tier3Conflicts,
    };
  };

  const allEquippableManifestNames = (() => {
    const set = new Set<string>();
    const addValidName = (n: any) => {
      if (
        n &&
        typeof n === "string" &&
        !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
      ) {
        set.add(n);
      }
    };

    if (groupedKids.length > 0) {
      groupedKids.forEach((kidGroup: any) => {
        if (kidGroup?.isInstalled === false) return;
        const gMods: any[] =
          Array.isArray(kidGroup?._groupedMods) &&
            kidGroup._groupedMods.length > 0
            ? kidGroup._groupedMods
            : [kidGroup];
        gMods.forEach((gm: any) => addValidName(gm?.name));
      });
    } else if (kids.length > 0) {
      kids.forEach((k: any) => addValidName(k?.name));
    } else if (!mod.isVirtual) {
      addValidName(mod.name);
    }

    return Array.from(set);
  })();

  const allEquipped =
    allEquippableManifestNames.length > 0 &&
    allEquippableManifestNames.every((n) => isModNameEquipped(n));

  const triggerYeetCascadeAlert = (
    casualties: string[],
    onConfirm: () => void
  ) => {
    setDossierAlertPending({
      mode: "yeet_cascade",
      casualties,
      onConfirm,
    });
  };

  const safeToggle = (targetName: string, forceMode?: "add" | "remove") => {
    if (!targetName) return;
    const isCurrentlyEquipped = isModNameEquipped(targetName);
    const shouldRemove =
      forceMode === "remove"
        ? true
        : forceMode === "add"
          ? false
          : isCurrentlyEquipped;
    const doToggle = (swapOpts?: {
      confirmedSwap?: boolean;
      skipHighlanderSwap?: boolean;
    }) => {
      onToggleInActiveSet(
        targetName,
        false,
        shouldRemove,
        !shouldRemove,
        swapOpts
      );
      if (
        selectedKid &&
        selectedKid.name === targetName &&
        shouldRemove
      ) {
        setSelectedKid(null);
      }
    };

    if (shouldRemove) {
      const c = getCasualties(targetName);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, () => doToggle());
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts([targetName]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: formatDisplayName(targetName),
          ...alerts,
          onConfirm: () => doToggle({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => doToggle({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
    }
    doToggle({ confirmedSwap: true });
  };

  const safeToggleGroup = (groupItem: any) => {
    const groupMods: any[] =
      Array.isArray(groupItem?._groupedMods) && groupItem._groupedMods.length > 0
        ? groupItem._groupedMods
        : Array.isArray(groupItem?.flavors) && groupItem.flavors.length > 0
          ? groupItem.flavors
          : [groupItem];
    const validNames = Array.from(
      new Set(
        groupMods
          .map((gm: any) => gm?.name)
          .filter(
            (n: any) =>
              n &&
              typeof n === "string" &&
              !/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i.test(n)
          )
      )
    );
    if (validNames.length === 0) {
      if (groupItem?.name) safeToggle(groupItem.name);
      return;
    }

    const isGroupEquipped = validNames.some((n) => isModNameEquipped(n));
    const performGroupToggle = (swapOpts?: {
      confirmedSwap?: boolean;
      skipHighlanderSwap?: boolean;
    }) => {
      if (isGroupEquipped) {
        const toRem = validNames.filter((n) => isModNameEquipped(n));
        if (toRem.length > 0) {
          onToggleInActiveSet(toRem, false, true, false);
        }
      } else {
        onToggleInActiveSet(validNames, false, false, true, swapOpts);
      }
    };

    const groupLabel =
      groupItem?._groupedTitle ||
      groupItem?.displayName ||
      formatDisplayName(validNames[0]);

    if (isGroupEquipped) {
      const c = getBatchCasualties(validNames, groupLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, () => performGroupToggle());
        return;
      }
    } else {
      const alerts = evaluatePreEquipAlerts(validNames, [groupItem, ...groupMods]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: groupLabel,
          ...alerts,
          onConfirm: () => performGroupToggle({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => performGroupToggle({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
    }

    performGroupToggle({ confirmedSwap: true });
  };

  const handleToggleAll = () => {
    if (allEquippableManifestNames.length === 0) {
      if (mod?.name) safeToggle(mod.name);
      return;
    }

    const rootLabel =
      mod.displayName ||
      (mod.name || "").replace(/^(FOLDER_|SET_|LOCAL_SET_)/i, "");

    if (allEquipped) {
      const equippedNames = allEquippableManifestNames.filter((n) =>
        isModNameEquipped(n)
      );
      const doRemoveAll = () => {
        if (equippedNames.length > 0) {
          onToggleInActiveSet(equippedNames, false, true, false);
        }
      };

      const c = getBatchCasualties(equippedNames, rootLabel);
      if (c.length > 0) {
        triggerYeetCascadeAlert(c, doRemoveAll);
        return;
      }
      doRemoveAll();
    } else {
      const unequippedNames = allEquippableManifestNames.filter(
        (n) => !isModNameEquipped(n)
      );
      const doEquipAll = (swapOpts?: {
        confirmedSwap?: boolean;
        skipHighlanderSwap?: boolean;
      }) => {
        if (unequippedNames.length > 0) {
          onToggleInActiveSet(unequippedNames, false, false, true, swapOpts);
        }
      };
      const alerts = evaluatePreEquipAlerts(unequippedNames, [mod]);
      if (alerts.hasAnyAlert) {
        setDossierAlertPending({
          mode: "pre_equip",
          targetLabel: rootLabel,
          ...alerts,
          onConfirm: () => doEquipAll({ confirmedSwap: true }),
          onKeepBoth:
            alerts.flavorRivals.length > 0
              ? () => doEquipAll({ skipHighlanderSwap: true })
              : undefined,
        });
        return;
      }
      doEquipAll({ confirmedSwap: true });
    }
  };

  return {
    allEquippableManifestNames,
    allEquipped,
    safeToggle,
    safeToggleGroup,
    handleToggleAll,
  };
}
