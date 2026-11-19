import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useMemo, useCallback, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { getExtensionRegex, formatDisplayName, deduplicateBlueprintArtifacts, stripPriorityTierPrefix, resolveModHighlanderSlot } from "../shared";

export * from "./playset/types";
export * from "./playset/loadOrderCompiler";
export * from "./playset/conflictPrecomputer";
import { usePlaySetLifecycleAndEquip } from "./playset/usePlaySetLifecycleAndEquip";
import { usePlaySetRulesAndMissing } from "./playset/usePlaySetRulesAndMissing";
export { useConflictOverride } from "./playset/conflictOverrideEngine";

interface ModIndicesBundle {
  modMap: Map<string, any>;
  hashToMod: Map<string, any>;
  baseToMod: Map<string, any>;
  byDbId: Map<string, any>;
  byFamilyOrDbId: Map<string, any[]>;
  byInterchangeableId: Map<string, any>;
  bySetId: Map<string, any[]>;
  byHighlanderSlot: Map<string, any[]>;
  byCommunityGroup: Map<string, any[]>;
  byParsedBaseName: Map<string, any[]>;
  normRelToMod: Map<string, any>;
  normBaseToMod: Map<string, any>;
  modsWithConflicts: any[];
  modsWithRequirements: any[];
  namesAndDisplayNames: {
    name: string;
    displayNameUpper: string;
    displayNameSpaced: string;
    orig: any;
  }[];
  precomputedBaseNames: Map<string, string>;
}

let cachedModIndicesListRef: any = null;
let cachedModIndicesSchemaRef: any = null;
let cachedModIndicesResult: ModIndicesBundle | null = null;
export function usePlaySetLogic() {
  const {
    playSets,
    setPlaySets,
    activePlaySetIndex,
    setActivePlaySetIndex,
    activeSetName,
    setActiveSetName,
    anarchyRules,
    modList,
    activeGameSchema,
    setStatus,
    ownedDLC,
    maskedDLC,
    setIgnoredGlobal,
    isGlobalConfigLoaded,
  } = useStore(
    useShallow((s) => ({
      playSets: s.playSets,
      setPlaySets: s.setPlaySets,
      activePlaySetIndex: s.activePlaySetIndex,
      setActivePlaySetIndex: s.setActivePlaySetIndex,
      activeSetName: s.activeSetName,
      setActiveSetName: s.setActiveSetName,
      anarchyRules: s.anarchyRules,
      modList: s.modList,
      activeGameSchema: s.activeGameSchema,
      setStatus: s.setStatus,
      ownedDLC: s.ownedDLC,
      maskedDLC: s.maskedDLC,
      setIgnoredGlobal: s.setIgnoredGlobal,
      isGlobalConfigLoaded: s.isGlobalConfigLoaded,
    }))
  );
  const { t } = useLexicon();
  const { setPendingImportSet, setMissingImportMods, isScanning, isSilentScanning } = useModalStore(
    useShallow((s) => ({
      setPendingImportSet: s.setPendingImportSet,
      setMissingImportMods: s.setMissingImportMods,
      isScanning: s.isScanning,
      isSilentScanning: s.isSilentScanning,
    }))
  );

  const {
    modMap,
    hashToMod,
    baseToMod,
    byDbId,
    byFamilyOrDbId,
    byInterchangeableId,
    bySetId,
    byHighlanderSlot,
    byCommunityGroup,
    byParsedBaseName,
    normRelToMod,
    normBaseToMod,
    modsWithConflicts,
    modsWithRequirements,
    namesAndDisplayNames,
    precomputedBaseNames,
  } = useMemo(() => {
    if (
      cachedModIndicesResult &&
      cachedModIndicesListRef === modList &&
      cachedModIndicesSchemaRef === activeGameSchema
    ) {
      return cachedModIndicesResult;
    }
    const extRegex = getExtensionRegex(activeGameSchema);
    const m1 = new Map<string, any>();
    const m2 = new Map<string, any>();
    const m3 = new Map<string, any>();
    const byDbId = new Map<string, any>();
    const byFamilyOrDbId = new Map<string, any[]>();
    const byInterchangeableId = new Map<string, any>();
    const bySetId = new Map<string, any[]>();
    const byHighlanderSlot = new Map<string, any[]>();
    const byCommunityGroup = new Map<string, any[]>();
    const byParsedBaseName = new Map<string, any[]>();
    const normRelToMod = new Map<string, any>();
    const normBaseToMod = new Map<string, any>();
    const modsWithConflicts: any[] = [];
    const modsWithRequirements: any[] = [];
    const namesAndDisplayNames: any[] = [];
    const precomputedBaseNames = new Map<string, string>();

    const pushToMap = (map: Map<string, any[]>, key: string, val: any) => {
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(val);
    };

    modList.forEach((m: any) => {
      if (!m?.name) return;
      m1.set(m.name, m);
      if (m.hash) m2.set(m.hash, m);
      const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, "");
      if (mBase && !m3.has(mBase)) m3.set(mBase, m);
      const normRel = stripPriorityTierPrefix(String(m.name), activeGameSchema)
        .replace(/\\/g, "/")
        .toLowerCase();
      if (normRel && (!normRelToMod.has(normRel) || !m.isVirtual)) {
        normRelToMod.set(normRel, m);
      }
      const normBase = normRel.split("/").pop() || "";
      if (normBase && (!normBaseToMod.has(normBase) || !m.isVirtual)) {
        normBaseToMod.set(normBase, m);
      }
      if (m.familyId != null) pushToMap(byFamilyOrDbId, String(m.familyId), m);
      if (m.dbId != null && String(m.dbId) !== String(m.familyId)) {
        pushToMap(byFamilyOrDbId, String(m.dbId), m);
      }
      if (Array.isArray(m.interchangeableIds)) {
        for (const icId of m.interchangeableIds) {
          const k = String(icId);
          if (k && (!byInterchangeableId.has(k) || !m.isVirtual)) {
            byInterchangeableId.set(k, m);
          }
        }
      }
      if (m.setId != null) pushToMap(bySetId, String(m.setId), m);
      if (!m.isVirtual) {
        if (m.dbId) byDbId.set(String(m.dbId), m);
        const hSlot = resolveModHighlanderSlot(m);
        if (hSlot) pushToMap(byHighlanderSlot, hSlot.key, m);
        if (m.communityGroupId != null) pushToMap(byCommunityGroup, String(m.communityGroupId), m);
        if (Array.isArray(m.conflicts) && m.conflicts.length > 0) {
          modsWithConflicts.push(m);
        }
        if (Array.isArray(m.requirements) && m.requirements.length > 0) {
          modsWithRequirements.push(m);
        }
        const dn = m.displayName || "";
        namesAndDisplayNames.push({
          name: m.name || "",
          displayNameUpper: dn.toUpperCase(),
          displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
          orig: m,
        });
      }
      const parsedBase =
        m.name
          .split(/[\\/]/)
          .pop()
          ?.replace(extRegex, "")
          .toUpperCase()
          .replace(/_SCRIPT(S)?$/i, "") || "";
      precomputedBaseNames.set(m.name, parsedBase);
      if (parsedBase) pushToMap(byParsedBaseName, parsedBase, m);
    });

    const computedResult = {
      modMap: m1,
      hashToMod: m2,
      baseToMod: m3,
      byDbId,
      byFamilyOrDbId,
      byInterchangeableId,
      bySetId,
      byHighlanderSlot,
      byCommunityGroup,
      byParsedBaseName,
      normRelToMod,
      normBaseToMod,
      modsWithConflicts,
      modsWithRequirements,
      namesAndDisplayNames,
      precomputedBaseNames,
    };
    cachedModIndicesListRef = modList;
    cachedModIndicesSchemaRef = activeGameSchema;
    cachedModIndicesResult = computedResult;
    return computedResult;
  }, [modList, activeGameSchema]);

  // Automatic Blueprint Self-Healing & Sanitization:
  // Once the Vault scan has settled (never during cold boot or mid-scan streaming),
  // automatically heal renamed/updated artifacts via DNA hash or extension-matched base name,
  // prune deleted ghost entries, and deduplicate Blueprint artifact lists.
  useEffect(() => {
    if (
      !isGlobalConfigLoaded ||
      isScanning ||
      isSilentScanning ||
      !Array.isArray(modList) ||
      modList.length === 0
    ) {
      return;
    }

    const extRegex = getExtensionRegex(activeGameSchema);
    const exactVaultMap = new Map<string, any>();
    const strippedLowerVaultMap = new Map<string, any>();
    const cleanLowerVaultMap = new Map<string, any>();
    const dnaVaultMap = new Map<string, any>();
    const baseExtVaultMap = new Map<string, any>();

    const indexVaultMod = (m: any) => {
      if (!m || m.isVirtual || !m.name) return;
      if (!exactVaultMap.has(m.name)) exactVaultMap.set(m.name, m);
      const stripped = stripPriorityTierPrefix(String(m.name), activeGameSchema);
      const strippedLow = stripped.replace(/\\/g, "/").toLowerCase();
      if (strippedLow && !strippedLowerVaultMap.has(strippedLow)) {
        strippedLowerVaultMap.set(strippedLow, m);
      }
      const cleanFile = stripped.split(/[\\/]/).pop() || stripped;
      const cleanLow = cleanFile.toLowerCase();
      if (cleanLow && !cleanLowerVaultMap.has(cleanLow)) {
        cleanLowerVaultMap.set(cleanLow, m);
      }
      if (m.hash && !dnaVaultMap.has(String(m.hash))) {
        dnaVaultMap.set(String(m.hash), m);
      }
      const dotIdx = cleanLow.lastIndexOf(".");
      const ext = dotIdx >= 0 ? cleanLow.slice(dotIdx) : "";
      const baseOnly = cleanFile.replace(extRegex, "").toLowerCase();
      if (baseOnly) {
        const compositeKey = `${baseOnly}::${ext}`;
        if (!baseExtVaultMap.has(compositeKey)) {
          baseExtVaultMap.set(compositeKey, m);
        }
      }
    };

    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      if (!m) continue;
      if (m.isVirtual) {
        if (Array.isArray(m.flavors)) {
          for (let j = 0; j < m.flavors.length; j++) {
            indexVaultMod(m.flavors[j]);
          }
        }
        continue;
      }
      indexVaultMod(m);
    }

    if (exactVaultMap.size === 0) return;

    setPlaySets((currentPlaySets: any[]) => {
      if (!Array.isArray(currentPlaySets) || currentPlaySets.length === 0) {
        return currentPlaySets;
      }

      let anySetChanged = false;
      const cleanedPlaySets = currentPlaySets.map((set: any) => {
        if (!set || !Array.isArray(set.mods) || set.mods.length === 0) return set;

        let setChanged = false;
        const rawCandidates: string[] = [];
        const nextHashes: Record<string, string> = { ...(set.modHashes || {}) };
        const nextMeta: Record<string, any> = set.modMeta ? { ...set.modMeta } : {};
        const remapCleanLower = new Map<string, string>();

        for (let i = 0; i < set.mods.length; i++) {
          const rawMod = set.mods[i];
          const modName =
            typeof rawMod === "string"
              ? rawMod
              : String(rawMod?.name || rawMod?.path || "");
          if (
            !modName ||
            modName.startsWith("FOLDER_") ||
            modName.startsWith("SET_") ||
            modName.startsWith("LOCAL_SET_")
          ) {
            setChanged = true;
            continue;
          }

          const strippedName = stripPriorityTierPrefix(modName, activeGameSchema);
          const tierPrefix =
            modName.length > strippedName.length
              ? modName.slice(0, modName.length - strippedName.length)
              : "";
          const cleanFile = strippedName.split(/[\\/]/).pop() || strippedName;
          const cleanLow = cleanFile.toLowerCase();
          const strippedLow = strippedName.replace(/\\/g, "/").toLowerCase();

          // 1. Direct or path-moved match
          const directMod =
            exactVaultMap.get(modName) ||
            exactVaultMap.get(strippedName) ||
            strippedLowerVaultMap.get(strippedLow) ||
            cleanLowerVaultMap.get(cleanLow);

          if (directMod) {
            const canonicalVaultRel = stripPriorityTierPrefix(
              String(directMod.name),
              activeGameSchema
            );
            const resolvedEntry = tierPrefix
              ? `${tierPrefix}${canonicalVaultRel}`
              : exactVaultMap.has(modName)
                ? modName
                : directMod.name;

            if (resolvedEntry !== modName || typeof rawMod !== "string") {
              setChanged = true;
            }
            if (directMod.hash && nextHashes[resolvedEntry] !== directMod.hash) {
              nextHashes[resolvedEntry] = directMod.hash;
              if (resolvedEntry !== modName) delete nextHashes[modName];
            }
            rawCandidates.push(resolvedEntry);
            continue;
          }

          // 2. DNA Hash Self-Heal (file was renamed on disk)
          const oldHash =
            nextHashes[modName] || nextHashes[strippedName] || nextHashes[cleanFile];
          let healedMod = oldHash ? dnaVaultMap.get(String(oldHash)) : undefined;

          // 3. Extension-Safe Base-Name Self-Heal (version label updated in filename)
          if (!healedMod) {
            const dotIdx = cleanLow.lastIndexOf(".");
            const ext = dotIdx >= 0 ? cleanLow.slice(dotIdx) : "";
            const baseOnly = cleanFile.replace(extRegex, "").toLowerCase();
            if (baseOnly) {
              healedMod = baseExtVaultMap.get(`${baseOnly}::${ext}`);
            }
          }

          if (healedMod) {
            const canonicalVaultRel = stripPriorityTierPrefix(
              String(healedMod.name),
              activeGameSchema
            );
            const healedClean =
              canonicalVaultRel.split(/[\\/]/).pop() || canonicalVaultRel;
            const healedEntry = tierPrefix
              ? `${tierPrefix}${canonicalVaultRel}`
              : healedMod.name;

            rawCandidates.push(healedEntry);
            if (healedMod.hash) {
              nextHashes[healedEntry] = healedMod.hash;
            }
            if (healedEntry !== modName) {
              if (nextMeta[modName] && !nextMeta[healedEntry]) {
                nextMeta[healedEntry] = nextMeta[modName];
              }
              delete nextMeta[modName];
              delete nextHashes[modName];
            }
            if (cleanLow && healedClean.toLowerCase() !== cleanLow) {
              remapCleanLower.set(cleanLow, healedClean);
            }
            setChanged = true;
            continue;
          }

          // 4. Genuinely deleted/missing from Vault -> prune cleanly
          delete nextHashes[modName];
          delete nextHashes[strippedName];
          delete nextHashes[cleanFile];
          delete nextMeta[modName];
          delete nextMeta[strippedName];
          delete nextMeta[cleanFile];
          setChanged = true;
        }

        const dedupedMods = deduplicateBlueprintArtifacts(
          rawCandidates,
          activeGameSchema
        );
        if (dedupedMods.length !== set.mods.length) {
          setChanged = true;
        } else if (!setChanged) {
          for (let i = 0; i < dedupedMods.length; i++) {
            if (dedupedMods[i] !== set.mods[i]) {
              setChanged = true;
              break;
            }
          }
        }

        if (!setChanged) return set;

        anySetChanged = true;

        const survivingCleanLower = new Set<string>();
        dedupedMods.forEach((mPath: string) => {
          const s = stripPriorityTierPrefix(mPath, activeGameSchema);
          const c = (s.split(/[\\/]/).pop() || s).toLowerCase();
          if (c) survivingCleanLower.add(c);
        });

        let nextModTiers = set.modTiers;
        if (set.modTiers && typeof set.modTiers === "object") {
          const cleanedTiers: Record<string, string> = {};
          Object.entries(set.modTiers).forEach(([k, v]) => {
            const kClean = (k.split(/[\\/]/).pop() || k).toLowerCase();
            const remapped = remapCleanLower.get(kClean);
            const finalKey = remapped || k;
            const finalClean = (finalKey.split(/[\\/]/).pop() || finalKey).toLowerCase();
            if (survivingCleanLower.has(finalClean) && typeof v === "string") {
              cleanedTiers[finalKey] = v;
            }
          });
          nextModTiers = cleanedTiers;
        }

        let nextLoadOrder = set.loadOrder;
        if (Array.isArray(set.loadOrder)) {
          nextLoadOrder = set.loadOrder
            .map((n: string) => {
              const c = (String(n || "").split(/[\\/]/).pop() || String(n || "")).toLowerCase();
              return remapCleanLower.get(c) || n;
            })
            .filter((n: string) => {
              const c = (String(n || "").split(/[\\/]/).pop() || String(n || "")).toLowerCase();
              return survivingCleanLower.has(c);
            });
        }

        let nextLoadRules = set.loadRules;
        if (Array.isArray(set.loadRules)) {
          nextLoadRules = set.loadRules
            .map((r: any) => {
              if (!r?.modA || !r?.modB) return null;
              const cA = (String(r.modA).split(/[\\/]/).pop() || String(r.modA)).toLowerCase();
              const cB = (String(r.modB).split(/[\\/]/).pop() || String(r.modB)).toLowerCase();
              return {
                ...r,
                modA: remapCleanLower.get(cA) || r.modA,
                modB: remapCleanLower.get(cB) || r.modB,
              };
            })
            .filter((r: any) => {
              if (!r) return false;
              const cA = (String(r.modA).split(/[\\/]/).pop() || String(r.modA)).toLowerCase();
              const cB = (String(r.modB).split(/[\\/]/).pop() || String(r.modB)).toLowerCase();
              return survivingCleanLower.has(cA) && survivingCleanLower.has(cB);
            });
        }

        return {
          ...set,
          mods: dedupedMods,
          modHashes: nextHashes,
          modMeta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
          modTiers: nextModTiers,
          loadOrder: nextLoadOrder,
          loadRules: nextLoadRules,
          ignoredGhosts: undefined,
        };
      });

      return anySetChanged ? cleanedPlaySets : currentPlaySets;
    });
  }, [
    isGlobalConfigLoaded,
    isScanning,
    isSilentScanning,
    modList,
    activeGameSchema,
    setPlaySets,
  ]);

  const toggleInActiveSet = useCallback(
    (
      targetNameOrNames: string | string[],
      excludeBroken: boolean = true,
      forceRemove: boolean = false,
      forceActive: boolean = false,
      swapOpts?: { confirmedSwap?: boolean; skipHighlanderSwap?: boolean }
    ) => {
      const targetList = (
        Array.isArray(targetNameOrNames) ? targetNameOrNames : [targetNameOrNames]
      ).filter((n) => typeof n === "string" && n.length > 0);
      if (targetList.length === 0) return;

      // Pre-flight Exclusive Slot / Flavor Swap Alert Gate:
      // Never silently auto-remove an equipped rival {Mod} — intercept direct equip calls
      // (context menu, dependency equip, shortcut) and surface a Swap / Keep Both alert.
      if (
        !forceRemove &&
        !swapOpts?.confirmedSwap &&
        !swapOpts?.skipHighlanderSwap &&
        anarchyRules?.highlander !== false
      ) {
        const liveSet = useStore.getState().playSets?.[activePlaySetIndex];
        if (liveSet && Array.isArray(liveSet.mods) && liveSet.mods.length > 0) {
          const normPreRel = (n: string) =>
            stripPriorityTierPrefix(String(n || ""), activeGameSchema)
              .replace(/\\/g, "/")
              .toLowerCase();
          const normPreBase = (n: string) => normPreRel(n).split("/").pop() || "";

          const equippedExact = new Set<string>();
          const equippedRel = new Set<string>();
          const equippedBase = new Set<string>();
          for (const entry of liveSet.mods) {
            const rawStr =
              typeof entry === "string" ? entry : entry?.name || entry?.path || "";
            if (!rawStr) continue;
            equippedExact.add(rawStr);
            const rel = normPreRel(rawStr);
            if (rel) equippedRel.add(rel);
            const base = rel.split("/").pop() || "";
            if (base) equippedBase.add(base);
          }

          const isCurrentlyEquipped = (name: string): boolean => {
            if (!name) return false;
            if (equippedExact.has(name)) return true;
            const rel = normPreRel(name);
            if (rel && equippedRel.has(rel)) return true;
            const base = rel.split("/").pop() || "";
            return Boolean(base && equippedBase.has(base));
          };

          const getPreBaseFamilyKey = (x: any): string =>
            String(x?.baseFamilyId || x?.familyId || x?.dbId || x?.name || "")
              .split("@")[0]
              .trim()
              .toLowerCase();

          const equippingPairs: { modObj: any; parentMod: any }[] = [];
          const equippingNamesSet = new Set<string>();
          const equippingTargetTitles: string[] = [];

          for (const targetName of targetList) {
            const targetMod =
              modMap.get(targetName) ||
              normRelToMod.get(normPreRel(targetName)) ||
              normBaseToMod.get(normPreBase(targetName));
            if (!targetMod) continue;

            const kids = targetMod.isVirtual
              ? Array.from(
                new Set([
                  ...(byFamilyOrDbId.get(String(targetMod.dbId)) || []),
                  ...(bySetId.get(String(targetMod.dbId)) || []),
                  ...(Array.isArray(targetMod.flavors) ? targetMod.flavors : []),
                ])
              ).filter((m: any) => m && !m.isVirtual && m.name)
              : [];

            const willEquip = forceActive
              ? true
              : targetMod.isVirtual
                ? !kids.some((k) => isCurrentlyEquipped(k.name))
                : !isCurrentlyEquipped(targetMod.name || targetName);

            if (!willEquip) continue;

            equippingTargetTitles.push(
              formatDisplayName(targetMod.displayName || targetMod.name || targetName)
            );

            if (targetMod.isVirtual) {
              const hasFlavors = kids.some((k) => k.relationshipType === "flavor");
              const chosenKids = hasFlavors
                ? [
                  ...kids.filter((k) => k.relationshipType !== "flavor"),
                  ...(kids.some(
                    (k) => k.relationshipType === "flavor" && isCurrentlyEquipped(k.name)
                  )
                    ? []
                    : kids.filter((k) => k.relationshipType === "flavor").slice(0, 1)),
                ]
                : kids;
              for (const k of chosenKids) {
                if (k?.name) {
                  equippingNamesSet.add(k.name);
                  equippingPairs.push({ modObj: k, parentMod: targetMod });
                }
              }
            } else if (targetMod.name) {
              equippingNamesSet.add(targetMod.name);
              equippingPairs.push({ modObj: targetMod, parentMod: targetMod });
            }
          }

          if (equippingPairs.length > 0) {
            const seenRivalKeys = new Set<string>();
            const dedupedRivals: {
              name: string;
              displayName: string;
              slotLabel?: string;
            }[] = [];
            const matchedSlotLabels: string[] = [];

            for (const { modObj, parentMod } of equippingPairs) {
              const allowParentSlotFallback =
                modObj.relationshipType !== "addon" && modObj.relationshipType !== "flavor";
              const modSlot =
                resolveModHighlanderSlot(modObj) ||
                (allowParentSlotFallback ? resolveModHighlanderSlot(parentMod) : null);
              const modBaseFam = getPreBaseFamilyKey(modObj);
              const rivalCandidates = new Set<any>();

              if (modSlot) {
                const hs = byHighlanderSlot.get(modSlot.key);
                if (hs) hs.forEach((m) => rivalCandidates.add(m));
              }
              if (modObj.communityGroupId != null) {
                const cg = byCommunityGroup.get(String(modObj.communityGroupId));
                if (cg) cg.forEach((m) => rivalCandidates.add(m));
              }
              const famKey = modObj.familyId || modObj.dbId;
              if (famKey != null) {
                const fam = byFamilyOrDbId.get(String(famKey));
                if (fam) fam.forEach((m) => rivalCandidates.add(m));
              }

              rivalCandidates.forEach((m: any) => {
                if (
                  !m ||
                  m.isVirtual ||
                  !m.name ||
                  equippingNamesSet.has(m.name) ||
                  !isCurrentlyEquipped(m.name)
                ) {
                  return;
                }
                const mSlot = resolveModHighlanderSlot(m);
                const mBaseFam = getPreBaseFamilyKey(m);
                const mCleanId = String(m.dbId || m.id || "").trim();
                const isExplicitTwin =
                  modObj.relationshipType === "twin" ||
                  m.relationshipType === "twin" ||
                  (Array.isArray(modObj.interchangeableIds) &&
                    mCleanId &&
                    modObj.interchangeableIds.map(String).includes(mCleanId)) ||
                  Boolean(
                    precomputedBaseNames.get(modObj.name) &&
                    precomputedBaseNames.get(modObj.name) === precomputedBaseNames.get(m.name)
                  );
                const areSameModTwins = Boolean(
                  modBaseFam && mBaseFam === modBaseFam && isExplicitTwin
                );
                const isHighlanderSlotRival = Boolean(
                  modSlot &&
                  mSlot &&
                  mSlot.key === modSlot.key &&
                  !areSameModTwins
                );
                const isIntraFamilyFlavorRival = Boolean(
                  modObj.relationshipType === "flavor" &&
                  m.relationshipType === "flavor" &&
                  modBaseFam &&
                  mBaseFam === modBaseFam
                );
                const isCommunityRival = Boolean(
                  m.communityGroupId &&
                  String(m.communityGroupId) === String(modObj.communityGroupId)
                );
                const isBetaRival =
                  ((modObj.relationshipType !== "beta" &&
                    m.relationshipType === "beta") ||
                    (modObj.relationshipType === "beta" &&
                      m.relationshipType !== "beta")) &&
                  (String(m.familyId) === String(modObj.familyId) ||
                    String(m.dbId) === String(modObj.familyId || modObj.dbId));

                if (
                  isHighlanderSlotRival ||
                  isIntraFamilyFlavorRival ||
                  isCommunityRival ||
                  isBetaRival
                ) {
                  const isModuleScoped =
                    m.relationshipType === "addon" ||
                    m.relationshipType === "flavor" ||
                    (modBaseFam && mBaseFam === modBaseFam);
                  const dedupKey =
                    isHighlanderSlotRival && !isModuleScoped
                      ? mBaseFam || m.name
                      : m.name;
                  if (seenRivalKeys.has(dedupKey)) return;
                  seenRivalKeys.add(dedupKey);

                  let rivalTitle = formatDisplayName(m.displayName || m.name);
                  if (isHighlanderSlotRival && !isModuleScoped && (m.familyId || m.dbId)) {
                    const parentFolder = modList.find(
                      (vm: any) =>
                        vm?.isVirtual &&
                        (String(vm.dbId) === String(m.familyId || m.dbId) ||
                          String(vm.baseFamilyId || "").toLowerCase() === mBaseFam)
                    );
                    if (parentFolder?.displayName) {
                      rivalTitle = formatDisplayName(parentFolder.displayName);
                    }
                  }
                  if (
                    isHighlanderSlotRival &&
                    modSlot?.label &&
                    !matchedSlotLabels.includes(modSlot.label)
                  ) {
                    matchedSlotLabels.push(modSlot.label);
                  }
                  dedupedRivals.push({
                    name: m.name,
                    displayName: rivalTitle,
                    slotLabel: isHighlanderSlotRival ? modSlot?.label : undefined,
                  });
                }
              });
            }

            if (dedupedRivals.length > 0) {
              const targetTitle =
                equippingTargetTitles.length === 1
                  ? equippingTargetTitles[0]
                  : `${equippingTargetTitles.length} ${t("term_mods", "{Mods}")}`;
              useModalStore.getState().setYeetConfirmPending({
                mode: "highlander_swap",
                targetTitle,
                slotName: matchedSlotLabels[0] || "",
                rivals: dedupedRivals,
                onConfirm: () =>
                  toggleInActiveSet(
                    targetList,
                    excludeBroken,
                    forceRemove,
                    forceActive,
                    { confirmedSwap: true }
                  ),
                onKeepBoth: () =>
                  toggleInActiveSet(
                    targetList,
                    excludeBroken,
                    forceRemove,
                    forceActive,
                    { skipHighlanderSwap: true }
                  ),
              });
              return;
            }
          }
        }
      }

      console.time("PlaySetLogic: toggleInActiveSet");
      setPlaySets((prevSets) => {
        const currentSet = prevSets[activePlaySetIndex];
        if (!currentSet) {
          console.timeEnd("PlaySetLogic: toggleInActiveSet");
          return prevSets;
        }
        const currentRules = anarchyRules || {
          highlander: true,
          family: true,
          dependencies: true,
          intercept: true,
        };
        const rawNewMods = new Set<any>(currentSet.mods);
        const healedMods = new Set<any>();
        const localSets = prevSets;
        const tierFolders: string[] = [];
        if (Array.isArray(activeGameSchema?.load_order?.priority_tiers)) {
          for (const tObj of activeGameSchema.load_order.priority_tiers) {
            const f = String(tObj?.folder || "").trim().toLowerCase();
            if (f && !tierFolders.includes(f)) tierFolders.push(f);
          }
        }
        const hasTierPrefix = (pathStr: string) => {
          const lower = pathStr.toLowerCase();
          return tierFolders.some(
            (tf) => lower.startsWith(`${tf}/`) || lower.startsWith(`${tf}\\`)
          );
        };
        const stripTierPrefix = (pathStr: string) => {
          let cur = pathStr;
          let changed = true;
          while (changed) {
            changed = false;
            const lower = cur.toLowerCase();
            for (const tf of tierFolders) {
              if (lower.startsWith(`${tf}/`) || lower.startsWith(`${tf}\\`)) {
                cur = cur.slice(tf.length + 1);
                changed = true;
                break;
              }
            }
          }
          return cur;
        };
        const sanctuaryMods = new Map<string, any>();
        rawNewMods.forEach((mObj: any) => {
          const m = typeof mObj === "string" ? mObj : mObj.name || mObj.path || "";
          if (hasTierPrefix(m)) {
            const cleanM = m.split(/[\\/]/).pop()?.toLowerCase();
            if (cleanM) sanctuaryMods.set(cleanM, mObj);
          }
        });

        rawNewMods.forEach((mObj: any) => {
          const m = typeof mObj === "string" ? mObj : mObj.name || mObj.path || "";
          if (hasTierPrefix(m)) {
            healedMods.add(mObj);
          } else {
            const cleanM = m.split(/[\\/]/).pop()?.toLowerCase();
            const foundSanc = cleanM ? sanctuaryMods.get(cleanM) : null;
            if (foundSanc) healedMods.add(foundSanc);
            else healedMods.add(mObj);
          }
        });
        const newMods = healedMods;

        const normRelPath = (n: string) =>
          stripTierPrefix(String(n || ""))
            .replace(/\\/g, "/")
            .toLowerCase();
        const normBaseName = (n: string) => normRelPath(n).split("/").pop() || "";

        // O(1) lookup maps synchronized with `newMods`
        const exactEntryMap = new Map<string, any>();
        const normRelEntryMap = new Map<string, any>();
        const baseNameEntryMap = new Map<string, any>();

        const indexEntry = (mObj: any) => {
          const strM = typeof mObj === "string" ? mObj : mObj?.name || mObj?.path || "";
          if (!strM) return;
          exactEntryMap.set(strM, mObj);
          const rel = normRelPath(strM);
          if (rel) normRelEntryMap.set(rel, mObj);
          const base = rel.split("/").pop() || "";
          if (base) baseNameEntryMap.set(base, mObj);
        };

        const unindexEntry = (mObj: any) => {
          const strM = typeof mObj === "string" ? mObj : mObj?.name || mObj?.path || "";
          if (!strM) return;
          if (exactEntryMap.get(strM) === mObj) exactEntryMap.delete(strM);
          const rel = normRelPath(strM);
          if (rel && normRelEntryMap.get(rel) === mObj) normRelEntryMap.delete(rel);
          const base = rel.split("/").pop() || "";
          if (base && baseNameEntryMap.get(base) === mObj) baseNameEntryMap.delete(base);
        };

        newMods.forEach(indexEntry);

        const findEntryInNewMods = (name: string): any => {
          if (!name) return undefined;
          const exact = exactEntryMap.get(name);
          if (exact !== undefined && newMods.has(exact)) return exact;
          const rel = normRelPath(name);
          if (rel) {
            const byRel = normRelEntryMap.get(rel);
            if (byRel !== undefined && newMods.has(byRel)) return byRel;
          }
          const base = rel.split("/").pop() || "";
          if (base) {
            const byBase = baseNameEntryMap.get(base);
            if (byBase !== undefined && newMods.has(byBase)) return byBase;
          }
          return undefined;
        };

        const hasInNewMods = (name: string) => findEntryInNewMods(name) !== undefined;

        const areArchetypes = (hash1: string, hash2: string) => {
          if (!hash1 || !hash2) return false;
          return localSets.some(
            (s: any) =>
              (s.archetypes?.core === hash1 &&
                (s.archetypes?.twins?.includes(hash2) ||
                  s.archetypes?.addons?.includes(hash2))) ||
              (s.archetypes?.core === hash2 &&
                (s.archetypes?.twins?.includes(hash1) ||
                  s.archetypes?.addons?.includes(hash1))) ||
              ((s.archetypes?.twins?.includes(hash1) ||
                s.archetypes?.addons?.includes(hash1)) &&
                (s.archetypes?.twins?.includes(hash2) ||
                  s.archetypes?.addons?.includes(hash2)))
          );
        };

        const checkGhosted = (mObj: any) => {
          if (mObj.isGhosted) return true;
          let rDLC = mObj.requiredDLC || [];
          if (typeof rDLC === "string")
            rDLC = rDLC
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
          if (
            rDLC.some((dlc: string) => {
              const baseCode = dlc.split(" ")[0].toUpperCase();
              return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
            })
          )
            return true;
          if (mObj.requirements) {
            const hasMissing = mObj.requirements.some((req: any) => {
              const reqId = typeof req === "string" ? req : req.id || req.dbId;
              const reqName = typeof req === "string" ? req : req.name;
              const reqBaseName =
                precomputedBaseNames.get(reqName) ||
                reqName
                  ?.split(/[\\/]/)
                  .pop()
                  ?.replace(getExtensionRegex(activeGameSchema), "")
                  .toUpperCase()
                  .replace(/_SCRIPT(S)?$/i, "") ||
                "";
              const isReqNumeric = !isNaN(Number(reqName));
              let match = null;
              if (reqId) {
                const reqKey = String(reqId);
                match =
                  byDbId.get(reqKey) ||
                  hashToMod.get(reqId) ||
                  byFamilyOrDbId.get(reqKey)?.find((m: any) => !m.isVirtual) ||
                  byInterchangeableId.get(reqKey);
              }
              if (!match && !isReqNumeric && reqBaseName) {
                match = namesAndDisplayNames.find(
                  (n) =>
                    n.displayNameUpper.includes(reqBaseName) ||
                    n.displayNameSpaced.includes(reqBaseName.replace(/_/g, " "))
                )?.orig;
              }
              return !match;
            });
            if (hasMissing) return true;
          }
          if (mObj.conflicts && mObj.conflicts.length > 0 && currentRules.intercept !== false) {
            const hasFatal = mObj.conflicts.some((c: any) => {
              if (c.severity_rank != 4) return false;
              if (c.enemy_id) {
                const enemyMod =
                  byDbId.get(String(c.enemy_id)) ||
                  byFamilyOrDbId.get(String(c.enemy_id))?.find((m: any) => !m.isVirtual);
                if (enemyMod && hasInNewMods(enemyMod.name)) {
                  if (mObj.hash && enemyMod.hash && areArchetypes(mObj.hash, enemyMod.hash)) {
                    return false;
                  }
                  return true;
                }
              }
              if (c.enemy_name) {
                const targetClean = c.enemy_name
                  .replace(/\.[^/.]+$/i, "")
                  .toUpperCase()
                  .replace(/_SCRIPT(S)?$/i, "");
                const cands = byParsedBaseName.get(targetClean) || [];
                for (const cand of cands) {
                  if (cand?.name && hasInNewMods(cand.name)) {
                    if (mObj.hash && cand.hash && areArchetypes(mObj.hash, cand.hash)) {
                      continue;
                    }
                    return true;
                  }
                }
              }
              return false;
            });
            if (hasFatal) return true;
          }
          return false;
        };

        const deletedInPass = new Set<string>();

        const removeEntryByName = (nameToRemove: string): boolean => {
          const entry = findEntryInNewMods(nameToRemove);
          if (entry === undefined) return false;
          unindexEntry(entry);
          newMods.delete(entry);
          deletedInPass.add(nameToRemove);
          return true;
        };

        const deepDelete = (nameToDelete: string, shallow: boolean = false) => {
          if (!removeEntryByName(nameToDelete)) return;

          const targetClean = precomputedBaseNames.get(nameToDelete) || "";
          if (targetClean) {
            const sameBaseMods = byParsedBaseName.get(targetClean);
            if (sameBaseMods) {
              for (const sib of sameBaseMods) {
                if (sib?.name && sib.name !== nameToDelete) {
                  removeEntryByName(sib.name);
                }
              }
            }
          }

          const mDataDelete = modMap.get(nameToDelete);
          if (mDataDelete) {
            const matchingSet = localSets.find(
              (s: any) => s.archetypes?.core === mDataDelete.hash
            );
            if (matchingSet) {
              const isAnyTwinEquipped = matchingSet.archetypes?.twins?.some(
                (tHash: string) => {
                  const tMod = hashToMod.get(tHash);
                  return tMod && hasInNewMods(tMod.name);
                }
              );

              if (!isAnyTwinEquipped) {
                const children = [
                  ...(matchingSet.archetypes?.twins || []),
                  ...(matchingSet.archetypes?.addons || []),
                ];
                children.forEach((childHash: string) => {
                  const childMod = hashToMod.get(childHash);
                  if (childMod && childMod.name && hasInNewMods(childMod.name)) {
                    deepDelete(childMod.name, true);
                  }
                });
              }
            }
          }
        };

        const getModBaseFamilyKey = (x: any): string =>
          String(x?.baseFamilyId || x?.familyId || x?.dbId || x?.name || "")
            .split("@")[0]
            .trim()
            .toLowerCase();

        const applyConflicts = (modObj: any) => {
          if (currentRules.highlander !== false && !swapOpts?.skipHighlanderSwap) {
            const rivalCandidates = new Set<any>();
            const modSlot = resolveModHighlanderSlot(modObj);
            const modBaseFam = getModBaseFamilyKey(modObj);
            if (modSlot) {
              const hs = byHighlanderSlot.get(modSlot.key);
              if (hs) hs.forEach((m) => rivalCandidates.add(m));
            }
            if (modObj.communityGroupId != null) {
              const cg = byCommunityGroup.get(String(modObj.communityGroupId));
              if (cg) cg.forEach((m) => rivalCandidates.add(m));
            }
            const famKey = modObj.familyId || modObj.dbId;
            if (famKey != null) {
              const fam = byFamilyOrDbId.get(String(famKey));
              if (fam) fam.forEach((m) => rivalCandidates.add(m));
            }

            rivalCandidates.forEach((m: any) => {
              if (!m || m.isVirtual || !m.name || m.name === modObj.name) return;
              if (!hasInNewMods(m.name)) return;
              const mSlot = resolveModHighlanderSlot(m);
              const mBaseFam = getModBaseFamilyKey(m);
              const mCleanId = String(m.dbId || m.id || "").trim();
              const isExplicitTwin =
                modObj.relationshipType === "twin" ||
                m.relationshipType === "twin" ||
                (Array.isArray(modObj.interchangeableIds) &&
                  mCleanId &&
                  modObj.interchangeableIds.map(String).includes(mCleanId)) ||
                Boolean(
                  precomputedBaseNames.get(modObj.name) &&
                  precomputedBaseNames.get(modObj.name) === precomputedBaseNames.get(m.name)
                );
              const areSameModTwins = Boolean(
                modBaseFam && mBaseFam === modBaseFam && isExplicitTwin
              );
              const isHighlanderSlotRival = Boolean(
                modSlot &&
                mSlot &&
                mSlot.key === modSlot.key &&
                !areSameModTwins
              );
              const isIntraFamilyFlavorRival = Boolean(
                modObj.relationshipType === "flavor" &&
                m.relationshipType === "flavor" &&
                modBaseFam &&
                mBaseFam === modBaseFam
              );
              const isCommunityRival = Boolean(
                m.communityGroupId &&
                String(m.communityGroupId) === String(modObj.communityGroupId)
              );
              const isBetaRival =
                ((modObj.relationshipType !== "beta" && m.relationshipType === "beta") ||
                  (modObj.relationshipType === "beta" && m.relationshipType !== "beta")) &&
                (String(m.familyId) === String(modObj.familyId) ||
                  String(m.dbId) === String(modObj.familyId || modObj.dbId));

              if (
                isHighlanderSlotRival ||
                isIntraFamilyFlavorRival ||
                isCommunityRival ||
                isBetaRival
              ) {
                deepDelete(m.name, true);
                if (
                  isHighlanderSlotRival &&
                  mBaseFam !== modBaseFam &&
                  m.relationshipType !== "addon" &&
                  m.relationshipType !== "flavor" &&
                  (m.familyId || m.dbId)
                ) {
                  const rivalFam = byFamilyOrDbId.get(String(m.familyId || m.dbId));
                  if (rivalFam) {
                    rivalFam.forEach((sib: any) => {
                      const sibIsCoreOrCompanion =
                        sib.relationshipType !== "addon" && sib.relationshipType !== "flavor";
                      if (
                        sib &&
                        !sib.isVirtual &&
                        sib.name &&
                        hasInNewMods(sib.name) &&
                        getModBaseFamilyKey(sib) === mBaseFam &&
                        (sibIsCoreOrCompanion || !m.relationshipType || m.relationshipType === "core")
                      ) {
                        deepDelete(sib.name, true);
                      }
                    });
                  }
                }
                setStatus(
                  `${t("radar_intercept", "RADAR")}: ${formatDisplayName(modObj.displayName || modObj.name)} ${t("flavor_replaced", "Will Replace")} ${formatDisplayName(m.displayName || m.name)}.`
                );
              }
            });
          }
          if (modObj.conflicts && modObj.conflicts.length > 0 && currentRules.intercept !== false) {
            modObj.conflicts.forEach((c: any) => {
              if (c.severity_rank == 4 && currentRules.intercept !== false) {
                let matchedMod: any = null;
                if (c.enemy_id) {
                  const cand =
                    byDbId.get(String(c.enemy_id)) ||
                    byFamilyOrDbId.get(String(c.enemy_id))?.find((m: any) => !m.isVirtual && hasInNewMods(m.name));
                  if (cand && hasInNewMods(cand.name)) matchedMod = cand;
                }
                if (!matchedMod && c.enemy_name) {
                  const targetClean = c.enemy_name
                    .replace(/\.[^/.]+$/i, "")
                    .toUpperCase()
                    .replace(/_SCRIPT(S)?$/i, "");
                  const cands = byParsedBaseName.get(targetClean) || [];
                  matchedMod = cands.find((m: any) => m?.name && hasInNewMods(m.name));
                }
                if (matchedMod && matchedMod.name) {
                  deepDelete(matchedMod.name, true);
                  setStatus(
                    `${t("anarchy_intercept", "Conflict Intercept")}: ${formatDisplayName(matchedMod.displayName || matchedMod.name)} ${t("artifact_removed", "Will {Remove}")} due to collision with ${formatDisplayName(modObj.displayName || modObj.name)}.`
                  );
                }
              }
            });
          }
        };

        const addPathCleanly = (nameToAdd: string) => {
          if (!nameToAdd) return;
          const targetBase = normBaseName(nameToAdd);
          if (targetBase) {
            const existing = baseNameEntryMap.get(targetBase);
            if (existing !== undefined && newMods.has(existing)) {
              const strE =
                typeof existing === "string"
                  ? existing
                  : existing?.name || existing?.path || "";
              if (strE !== nameToAdd && stripTierPrefix(strE) === strE) {
                unindexEntry(existing);
                newMods.delete(existing);
              }
            }
          }
          newMods.add(nameToAdd);
          indexEntry(nameToAdd);
        };

        const addWithFamily = (modObj: any) => {
          if (!modObj || !modObj.name) return;
          if (
            excludeBroken &&
            (modObj.status === t("status_corrupted", "Corrupted") ||
              modObj.status?.includes("BROKEN") ||
              checkGhosted(modObj))
          ) {
            setStatus(
              t(
                "critical_action",
                "CRITICAL ACTION REQUIRED: Fatal conflicts require resolution before deployment"
              )
            );
            return;
          }
          addPathCleanly(modObj.name);
          applyConflicts(modObj);

          if (currentRules.intercept !== false && modsWithConflicts.length > 0) {
            const modObjClean = precomputedBaseNames.get(modObj.name) || "";
            const modObjDispUpper = modObj.displayName?.toUpperCase() || "";
            for (const activeM of modsWithConflicts) {
              if (!activeM?.name || activeM.name === modObj.name || !hasInNewMods(activeM.name)) {
                continue;
              }
              for (const c of activeM.conflicts) {
                if (c.severity_rank == 4) {
                  let isReverseMatch = false;
                  if (c.enemy_id && String(modObj.dbId) === String(c.enemy_id)) {
                    isReverseMatch = true;
                  }
                  if (!isReverseMatch && c.enemy_name) {
                    const targetClean = c.enemy_name
                      .replace(/\.[^/.]+$/i, "")
                      .toUpperCase()
                      .replace(/_SCRIPT(S)?$/i, "");
                    if (modObjClean === targetClean || modObjDispUpper === targetClean) {
                      isReverseMatch = true;
                    }
                  }
                  if (isReverseMatch) {
                    deepDelete(activeM.name, true);
                    setStatus(
                      `${t("anarchy_intercept", "Conflict Intercept")}: ${formatDisplayName(activeM.displayName || activeM.name)} ${t("artifact_removed", "Will {Remove}")} due to collision with ${formatDisplayName(modObj.displayName || modObj.name)}.`
                    );
                    break;
                  }
                }
              }
            }
          }

          const anchor = modObj.familyId || modObj.dbId;
          const modBaseName = precomputedBaseNames.get(modObj.name) || "";
          const candidateMods = new Set<any>();
          if (anchor && currentRules.family !== false) {
            const famCandidates = byFamilyOrDbId.get(String(anchor));
            if (famCandidates) famCandidates.forEach((c) => candidateMods.add(c));
          }
          if (modBaseName) {
            const baseCandidates = byParsedBaseName.get(modBaseName);
            if (baseCandidates) baseCandidates.forEach((c) => candidateMods.add(c));
          }

          candidateMods.forEach((m) => {
            let isTwinMatch = false;
            const mBaseName = precomputedBaseNames.get(m.name) || "";
            if (mBaseName && modBaseName && mBaseName === modBaseName && m.name !== modObj.name) {
              isTwinMatch = true;
            }

            if (
              (anchor &&
                currentRules.family !== false &&
                (String(m.familyId) === String(anchor) ||
                  String(m.dbId) === String(anchor))) ||
              isTwinMatch
            ) {
              if (m.name && !m.isVirtual) {
                const objV = modObj.version;
                const mV = m.version;
                const sharesVersion =
                  !objV ||
                  !mV ||
                  objV === "v.Local" ||
                  mV === "v.Local" ||
                  objV === mV;
                if (!sharesVersion && !isTwinMatch) return;

                const isRival =
                  (m.relationshipType === "flavor" && m.name !== modObj.name) ||
                  (m.communityGroupId &&
                    String(m.communityGroupId) === String(modObj.communityGroupId) &&
                    m.name !== modObj.name);

                const isAddonOfTarget =
                  m.hash && modObj.hash
                    ? localSets.some(
                      (s: any) =>
                        (s.archetypes?.core === modObj.hash ||
                          s.archetypes?.twins?.includes(modObj.hash)) &&
                        s.archetypes?.addons?.includes(m.hash)
                    )
                    : false;

                if (
                  !isRival &&
                  !isAddonOfTarget &&
                  (m.relationshipType === "twin" ||
                    m.relationshipType === "beta" ||
                    m.relationshipType === "core" ||
                    !m.relationshipType ||
                    isTwinMatch)
                ) {
                  if (
                    !(
                      excludeBroken &&
                      (m.status === t("status_corrupted", "Corrupted") ||
                        m.status?.includes("BROKEN") ||
                        checkGhosted(m))
                    )
                  ) {
                    if (!deletedInPass.has(m.name) && !hasInNewMods(m.name)) {
                      applyConflicts(m);
                      addPathCleanly(m.name);
                    }
                  }
                }
              }
            }
          });
        };

        let didAnyEquip = false;
        let didAnyUnequip = false;

        for (const targetName of targetList) {
          const targetMod =
            modMap.get(targetName) ||
            normRelToMod.get(normRelPath(targetName)) ||
            normBaseToMod.get(normBaseName(targetName));

          if (!targetMod) {
            if (forceRemove) {
              if (removeEntryByName(targetName)) {
                didAnyUnequip = true;
                setStatus(
                  `${t("anarchy_intercept", "Conflict Intercept")}: ${formatDisplayName(targetName)} ${t("artifact_removed", "Will {Remove}")}.`
                );
              }
            }
            continue;
          }

          const kids = targetMod.isVirtual
            ? Array.from(
              new Set([
                ...(byFamilyOrDbId.get(String(targetMod.dbId)) || []),
                ...(bySetId.get(String(targetMod.dbId)) || []),
                ...(Array.isArray(targetMod.flavors) ? targetMod.flavors : []),
              ])
            ).filter((m: any) => m && !m.isVirtual && m.name)
            : [];
          const hasIntraFamilyFlavorVariants =
            targetMod.isVirtual && kids.some((k) => k.relationshipType === "flavor");

          let isEquipping = targetMod.isVirtual
            ? !kids.some((k) => hasInNewMods(k.name))
            : !hasInNewMods(targetMod.name || targetName);
          if (forceRemove) isEquipping = false;
          if (forceActive) isEquipping = true;

          if (isEquipping) {
            didAnyEquip = true;
            if (targetMod.isVirtual) {
              let validKids = kids;
              if (excludeBroken) {
                validKids = kids.filter((k) => {
                  if (
                    k.status === t("status_corrupted", "Corrupted") ||
                    k.status?.includes("BROKEN") ||
                    checkGhosted(k)
                  ) {
                    return false;
                  }
                  return true;
                });
              }
              if (hasIntraFamilyFlavorVariants) {
                const coreFiles = validKids.filter((k) => k.relationshipType !== "flavor");
                const flavorFiles = validKids.filter((k) => k.relationshipType === "flavor");
                coreFiles.forEach((k) => addWithFamily(k));
                if (
                  flavorFiles.length > 0 &&
                  !flavorFiles.some((f) => hasInNewMods(f.name))
                ) {
                  addWithFamily(flavorFiles[0]);
                }
              } else {
                validKids.forEach((k) => addWithFamily(k));
              }
            } else {
              addWithFamily(targetMod);
            }
          } else {
            didAnyUnequip = true;
            const familyAnchor = targetMod.familyId || targetMod.dbId;
            const isMaster =
              targetMod.dbId && String(targetMod.dbId) === String(familyAnchor);
            const isArchetypeMember = localSets.some(
              (s: any) =>
                s.archetypes?.core === targetMod.hash ||
                s.archetypes?.twins?.includes(targetMod.hash)
            );

            if (
              targetMod.isVirtual ||
              (currentRules.family !== false &&
                (isMaster ||
                  targetMod.relationshipType === "core" ||
                  isArchetypeMember))
            ) {
              const famItems = new Set<any>([
                ...(familyAnchor ? byFamilyOrDbId.get(String(familyAnchor)) || [] : []),
                ...(targetMod.dbId ? bySetId.get(String(targetMod.dbId)) || [] : []),
                ...(Array.isArray(targetMod.flavors) ? targetMod.flavors : []),
              ]);
              famItems.forEach((m: any) => {
                if (m?.name && !m.isVirtual) deepDelete(m.name, true);
              });
            } else {
              deepDelete(targetMod.name || targetName, true);
            }
            if (forceRemove && targetList.length === 1) {
              setStatus(
                `${t("anarchy_intercept", "Conflict Intercept")}: ${formatDisplayName(targetMod.displayName || targetMod.name)} ${t("artifact_removed", "Will {Remove}")}.`
              );
            }
          }
        }

        // Single pass for forward dependencies after equipping
        if (didAnyEquip && currentRules.dependencies !== false && modsWithRequirements.length > 0) {
          let checkAgain = true;
          while (checkAgain) {
            checkAgain = false;
            const currentEquipped = Array.from(newMods)
              .map((n) => modMap.get(typeof n === "string" ? n : n?.name || ""))
              .filter(Boolean);
            for (const mData of modsWithRequirements) {
              if (!mData?.name || !hasInNewMods(mData.name)) continue;
              for (const req of mData.requirements) {
                const reqId = typeof req === "string" ? req : req.id || req.dbId;
                const reqName = typeof req === "string" ? req : req.name;
                const reqBaseName =
                  precomputedBaseNames.get(reqName) ||
                  reqName
                    ?.split(/[\\/]/)
                    .pop()
                    ?.replace(getExtensionRegex(activeGameSchema), "")
                    .toUpperCase()
                    .replace(/_SCRIPT(S)?$/i, "") ||
                  "";
                const isReqNumeric = !isNaN(Number(reqName));

                const alreadySatisfied = currentEquipped.some((equipped: any) => {
                  return (
                    equipped &&
                    (String(equipped.dbId) === String(reqId) ||
                      (reqId &&
                        equipped.interchangeableIds &&
                        equipped.interchangeableIds.includes(String(reqId))) ||
                      (!isReqNumeric &&
                        reqBaseName &&
                        equipped.displayName &&
                        equipped.displayName.toUpperCase().includes(reqBaseName)))
                  );
                });
                if (!alreadySatisfied) {
                  let provider = null;
                  if (reqId) {
                    provider =
                      byDbId.get(String(reqId)) ||
                      hashToMod.get(reqId) ||
                      byFamilyOrDbId.get(String(reqId))?.find((m: any) => !m.isVirtual);
                    if (!provider)
                      provider = modList.find((m: any) =>
                        m.interchangeableIds?.includes(String(reqId))
                      );
                  }
                  if (!provider && !isReqNumeric && reqBaseName) {
                    provider = namesAndDisplayNames.find((n) =>
                      n.displayNameUpper.includes(reqBaseName)
                    )?.orig;
                  }
                  if (
                    provider &&
                    !deletedInPass.has(
                      typeof provider === "string" ? provider : provider.name
                    )
                  ) {
                    const beforeSize = newMods.size;
                    addWithFamily(provider);
                    if (newMods.size > beforeSize) {
                      checkAgain = true;
                    }
                  }
                }
              }
            }
          }
        }

        // Single pass for reverse dependency cascade after unequipping
        if (didAnyUnequip && currentRules.dependencies !== false && modsWithRequirements.length > 0) {
          let checkDepsAgain = true;
          while (checkDepsAgain) {
            checkDepsAgain = false;
            const currentEquipped = Array.from(newMods)
              .map((n) => modMap.get(typeof n === "string" ? n : n?.name || ""))
              .filter(Boolean);
            for (const dep of modsWithRequirements) {
              if (!dep?.name || !hasInNewMods(dep.name)) continue;
              const isStillSatisfied = dep.requirements.every((r: any) => {
                const reqId = typeof r === "string" ? r : r.id || r.dbId;
                const reqName = typeof r === "string" ? r : r.name;
                const reqBaseName =
                  precomputedBaseNames.get(reqName) ||
                  reqName
                    ?.split(/[\\/]/)
                    .pop()
                    ?.replace(getExtensionRegex(activeGameSchema), "")
                    .toUpperCase()
                    .replace(/_SCRIPT(S)?$/i, "") ||
                  "";
                const isReqNumeric = !isNaN(Number(reqName));
                return currentEquipped.some((equipped: any) => {
                  return (
                    equipped &&
                    (String(equipped.dbId) === String(reqId) ||
                      (reqId &&
                        equipped.interchangeableIds &&
                        equipped.interchangeableIds.includes(String(reqId))) ||
                      (!isReqNumeric &&
                        reqBaseName &&
                        equipped.displayName &&
                        equipped.displayName.toUpperCase().includes(reqBaseName)))
                  );
                });
              });
              if (!isStillSatisfied) {
                deepDelete(dep.name, true);
                checkDepsAgain = true;
              }
            }
          }
        }

        const updatedSets = [...prevSets];

        const dedupedNewMods = deduplicateBlueprintArtifacts(
          Array.from(newMods),
          activeGameSchema
        );
        const nextModHashes: Record<string, string> = {};
        dedupedNewMods.forEach((mName: string) => {
          const mData =
            modMap.get(mName) ||
            modMap.get(stripPriorityTierPrefix(mName, activeGameSchema));
          if (mData && mData.hash) {
            nextModHashes[mName] = mData.hash;
          } else if (currentSet.modHashes && currentSet.modHashes[mName]) {
            nextModHashes[mName] = currentSet.modHashes[mName];
          }
        });

        updatedSets[activePlaySetIndex] = {
          ...currentSet,
          mods: dedupedNewMods,
          modHashes: nextModHashes,
          modMeta: currentSet.modMeta,
        };

        console.timeEnd("PlaySetLogic: toggleInActiveSet");
        return updatedSets;
      });
    },
    [
      setPlaySets,
      activePlaySetIndex,
      anarchyRules,
      activeGameSchema,
      modMap,
      hashToMod,
      baseToMod,
      byDbId,
      byFamilyOrDbId,
      byInterchangeableId,
      bySetId,
      byHighlanderSlot,
      byCommunityGroup,
      byParsedBaseName,
      normRelToMod,
      normBaseToMod,
      modsWithConflicts,
      modsWithRequirements,
      namesAndDisplayNames,
      precomputedBaseNames,
      modList,
    ]
  );

  const {
    deletePlaySet,
    renamePlaySet,
    importPlaySet,
    finalizeImport,
    equipPlaySet,
  } = usePlaySetLifecycleAndEquip({
    playSets,
    setPlaySets,
    setActivePlaySetIndex,
    activeSetName,
    setActiveSetName,
    modList,
    activeGameSchema,
    setStatus,
    t,
    setPendingImportSet,
    setMissingImportMods,
    modMap,
    hashToMod,
    baseToMod,
  });
  const {
    getMissingStrings,
    ignoreMissingString,
    purgeMissingString,
    applyConflictOverride,
    setModPriorityTier,
    addLoadOrderRule,
    removeLoadOrderRule,
    flipLoadOrderRule,
    moveModInLoadOrder,
    autoSortBlueprintLoadOrder,
  } = usePlaySetRulesAndMissing({
    playSets,
    setPlaySets,
    activeGameSchema,
    setStatus,
    setIgnoredGlobal,
    t,
    modMap,
    hashToMod,
    baseToMod,
  });

  return {
    toggleInActiveSet,
    applyConflictOverride,
    setModPriorityTier,
    addLoadOrderRule,
    removeLoadOrderRule,
    flipLoadOrderRule,
    moveModInLoadOrder,
    autoSortBlueprintLoadOrder,
    deletePlaySet,
    renamePlaySet,
    importPlaySet,
    finalizeImport,
    equipPlaySet,
    getMissingStrings,
    ignoreMissingString,
    purgeMissingString,
  };
}

