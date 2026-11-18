import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useMemo, useCallback, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getExtensionRegex, formatDisplayName, deduplicateBlueprintArtifacts, stripPriorityTierPrefix, resolveModHighlanderSlot } from "../shared";
import { mergeImportedModWithClientPriority } from "../utils/blueprintOverrideUtils";
import { checkAndPromptSymlinkCloudSyncConsent } from "../utils/cloudSyncGuard";

export * from "./playset/types";
export * from "./playset/loadOrderCompiler";
export * from "./playset/conflictPrecomputer";
import type { LoadOrderRule, CompiledLoadOrderItem } from "./playset/types";
import { compileLoadOrder, unpackBlueprintLoadOrder } from "./playset/loadOrderCompiler";
import { precomputeBlueprintConflicts } from "./playset/conflictPrecomputer";

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

function executeConflictOverride(
  activeGameSchema: any,
  setPlaySets: any,
  setIgnoredGlobal: any,
  winnerName: string,
  modPair: string,
  currentScopeName: string,
  targetTierFolder?: string,
  loserName?: string
): boolean {
  try {
    const schemaTiers = activeGameSchema?.load_order?.priority_tiers || [];
    const firstOverrideTier =
      targetTierFolder ||
      schemaTiers.find((pt: any) => pt.folder && pt.folder.length > 0)?.folder ||
      "Sanctuary";
    const knownFoldersLower = new Set(
      ["sanctuary", "sanctuary2", "sanctuary3", ...schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase())].filter(Boolean)
    );

    setPlaySets((prevSets: any[]) => {
      const playSetIndex = prevSets.findIndex((p: any) => p.name.toLowerCase() === currentScopeName.toLowerCase());
      if (playSetIndex !== -1) {
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[playSetIndex] };
        const newMods = [...currentSet.mods];
        const rawWinnerStr = typeof winnerName === "string" ? winnerName : (winnerName as any)?.name || "";
        const cleanWinnerFile = rawWinnerStr.split(/[\\/]/).pop() || rawWinnerStr;
        const cleanWinner = cleanWinnerFile.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();

        const index = newMods.findIndex((m: any) => {
          const strM = typeof m === "string" ? m : m.name || m.path || "";
          const cleanM = (strM.split(/[\\/]/).pop() || strM)
            .replace(getExtensionRegex(activeGameSchema), "")
            .toLowerCase();
          return cleanM === cleanWinner;
        });

        let canonicalWinnerFile = cleanWinnerFile;
        if (index !== -1) {
          const strM = typeof newMods[index] === "string" ? newMods[index] : newMods[index].name || newMods[index].path || "";
          const segs = strM.replace(/\\/g, "/").split("/");
          if (segs.length > 1 && knownFoldersLower.has(segs[0].toLowerCase())) {
            segs.shift();
          }
          const baseRel = segs.join("/");
          canonicalWinnerFile = baseRel.split("/").pop() || cleanWinnerFile;
          const nextPath = firstOverrideTier ? `${firstOverrideTier}/${baseRel}` : baseRel;
          if (typeof newMods[index] === "string") {
            newMods[index] = nextPath;
          } else {
            newMods[index] = { ...newMods[index], name: nextPath, path: nextPath };
          }
        } else if (cleanWinnerFile) {
          newMods.push(firstOverrideTier ? `${firstOverrideTier}/${cleanWinnerFile}` : cleanWinnerFile);
        }

        const nextModTiers = { ...(currentSet.modTiers || {}) };
        if (canonicalWinnerFile) {
          nextModTiers[canonicalWinnerFile] = firstOverrideTier;
        }

        let nextLoadRules: LoadOrderRule[] = Array.isArray(currentSet.loadRules) ? [...currentSet.loadRules] : [];
        const resolvedLoser =
          loserName ||
          (modPair && modPair.includes("::")
            ? modPair
              .split("::")
              .find((part) => !cleanWinner.includes(part.toLowerCase()) && !part.toLowerCase().includes(cleanWinner))
            : undefined);
        if (canonicalWinnerFile && resolvedLoser) {
          const rawLoserFile = resolvedLoser.split(/[\\/]/).pop() || resolvedLoser;
          const cleanLoserNoExt = rawLoserFile.replace(getExtensionRegex(activeGameSchema), "").toLowerCase();
          let canonicalLoserFile = rawLoserFile;
          const loserIdx = newMods.findIndex((m: any) => {
            const strM = typeof m === "string" ? m : m.name || m.path || "";
            const cleanM = (strM.split(/[\\/]/).pop() || strM)
              .replace(getExtensionRegex(activeGameSchema), "")
              .toLowerCase();
            return cleanM === cleanLoserNoExt;
          });
          if (loserIdx !== -1) {
            const strL = typeof newMods[loserIdx] === "string" ? newMods[loserIdx] : newMods[loserIdx].name || newMods[loserIdx].path || "";
            canonicalLoserFile = strL.split(/[\\/]/).pop() || rawLoserFile;
          }
          const wLow = canonicalWinnerFile.toLowerCase();
          const lLow = canonicalLoserFile.toLowerCase();
          const wNoExt = wLow.replace(getExtensionRegex(activeGameSchema), "");
          const lNoExt = lLow.replace(getExtensionRegex(activeGameSchema), "");
          nextLoadRules = nextLoadRules.filter((r) => {
            const rA = (r.modA || "").toLowerCase();
            const rB = (r.modB || "").toLowerCase();
            const rANoExt = rA.replace(getExtensionRegex(activeGameSchema), "");
            const rBNoExt = rB.replace(getExtensionRegex(activeGameSchema), "");
            return !(
              ((rA === wLow || rANoExt === wNoExt) && (rB === lLow || rBNoExt === lNoExt)) ||
              ((rA === lLow || rANoExt === lNoExt) && (rB === wLow || rBNoExt === wNoExt))
            );
          });
          nextLoadRules.push({
            id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            modA: canonicalWinnerFile,
            modB: canonicalLoserFile,
            type: "after",
          });
        }

        const prevIgnoredSet: string[] = Array.isArray(currentSet.ignoredConflicts)
          ? currentSet.ignoredConflicts
          : [];
        const nextIgnoredSet =
          modPair && !prevIgnoredSet.includes(modPair)
            ? [...prevIgnoredSet, modPair]
            : prevIgnoredSet;

        currentSet.mods = deduplicateBlueprintArtifacts(newMods, activeGameSchema);
        currentSet.modTiers = nextModTiers;
        currentSet.loadRules = nextLoadRules;
        currentSet.ignoredConflicts = nextIgnoredSet;
        updatedSets[playSetIndex] = currentSet;
        return updatedSets;
      }
      return prevSets;
    });

    setIgnoredGlobal((prevIgnored: string[]) => {
      if (!prevIgnored.includes(modPair)) {
        const updatedIgnored = [...prevIgnored, modPair];
        localStorage.setItem("sanctuary_ignored_conflicts", JSON.stringify(updatedIgnored));
        window.dispatchEvent(new Event("storage"));
        return updatedIgnored;
      }
      return prevIgnored;
    });

    return true;
  } catch (err) {
    console.error(`Error applying override: ${err}`);
    return false;
  }
}

export function useConflictOverride() {
  const { activeGameSchema, setPlaySets, setIgnoredGlobal } = useStore(
    useShallow((s) => ({
      activeGameSchema: s.activeGameSchema,
      setPlaySets: s.setPlaySets,
      setIgnoredGlobal: s.setIgnoredGlobal,
    }))
  );

  return useCallback(
    (
      winnerName: string,
      modPair: string,
      currentScopeName: string,
      targetTierFolder?: string,
      loserName?: string
    ) =>
      executeConflictOverride(
        activeGameSchema,
        setPlaySets,
        setIgnoredGlobal,
        winnerName,
        modPair,
        currentScopeName,
        targetTierFolder,
        loserName
      ),
    [activeGameSchema, setPlaySets, setIgnoredGlobal]
  );
}

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
      modList.length === 0 ||
      !Array.isArray(playSets) ||
      playSets.length === 0
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

    let anySetChanged = false;
    const cleanedPlaySets = playSets.map((set: any) => {
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

    if (anySetChanged) {
      setPlaySets(cleanedPlaySets);
    }
  }, [
    isGlobalConfigLoaded,
    isScanning,
    isSilentScanning,
    modList,
    playSets,
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
        const tierFolders: string[] = [
          "sanctuary",
          "!sanctuary",
          "sanctuary2",
          "!sanctuary2",
          "sanctuary3",
          "!sanctuary3",
        ];
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

  function deletePlaySet(setName: string) {
    const updatedSets = playSets.filter((s) => s.name !== setName);
    setPlaySets(updatedSets);

    if (activeSetName === setName) {
      setActiveSetName(null);
      localStorage.removeItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`);
    }
    setStatus(
      `${t("status_removed_manifest_prefix", "Removed: '")}${setName}${t("status_removed_manifest_suffix", "' {blueprint} was deleted.")}`,
    );
  }

  const renamePlaySet = (oldName: string, newName: string) => {
    let finalName = newName;
    let copyIndex = 1;
    while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase() && s.name !== oldName)) {
      finalName = `${newName} (${copyIndex})`;
      copyIndex++;
    }

    setPlaySets((prev: any[]) => {
      const copy = [...prev];
      const target = copy.find(s => s.name === oldName);
      if (target) {
        target.name = finalName;
      }

      return copy;
    });
    if (activeSetName === oldName) {
      setActiveSetName(finalName);
      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`, finalName);
    }
  };

  async function importPlaySet() {
    try {
      const selected = await open({
        filters: [{ name: "Sanctuary Profile", extensions: ["json"] }],
      });
      if (!selected) return;
      const content = await invoke<string>("read_blueprint", {
        path: selected as string,
      });
      const parsed = JSON.parse(content);
      if (!parsed.sanctuary_profile) {
        alert(t("status_invalid_profile", "Invalid Profile format."));
        return;
      }
      const missing: any[] = [];
      const rawAvailableMods: string[] = [];
      const nextModHashes: Record<string, string> = {};
      const nextModMeta: Record<string, any> = {};
      const nameRemap = new Map<string, string>();
      const extRegex = getExtensionRegex(activeGameSchema);
      let localOverrides: Record<string, any> = {};
      let edgeLogic: Record<string, any> = {};
      let localOverridesDirty = false;
      try {
        localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch { }
      try {
        edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch { }

      (parsed.mods || []).forEach((importedMod: any) => {
        let found = null;
        const rawNameToCheck = typeof importedMod === 'string' ? importedMod : (importedMod.name || importedMod.path || '');
        const cleanImportedFile = rawNameToCheck.split(/[\\/]/).pop() || rawNameToCheck;

        if (importedMod && typeof importedMod !== 'string' && importedMod.hash) {
          found = hashToMod.get(importedMod.hash);
        }
        if (!found) {
          found = modMap.get(rawNameToCheck) || modMap.get(cleanImportedFile);
          if (!found) {
            const targetBase = cleanImportedFile.replace(extRegex, '');
            if (targetBase) found = baseToMod.get(targetBase);
          }
        }

        if (importedMod && typeof importedMod !== 'string') {
          const targetHash = importedMod.hash || found?.hash;
          const metaKey = found ? found.name : rawNameToCheck;
          const merged = mergeImportedModWithClientPriority({
            importedMod,
            targetHash,
            localOverrides,
            edgeLogic,
            existingPlaysetMeta: metaKey ? nextModMeta[metaKey] : undefined,
          });
          if (metaKey && Object.keys(merged.resolvedModMeta).length > 0) {
            nextModMeta[metaKey] = merged.resolvedModMeta;
          }
          if (targetHash && merged.shouldWriteLocalOverride && merged.nextOverrideEntry) {
            localOverrides[targetHash] = merged.nextOverrideEntry;
            localOverridesDirty = true;
          }
        }

        if (found) {
          const resolvedClean = found.name.split(/[\\/]/).pop() || found.name;
          if (cleanImportedFile) {
            nameRemap.set(cleanImportedFile.toLowerCase(), resolvedClean);
          }
          rawAvailableMods.push(found.name);
          if (found.hash) nextModHashes[found.name] = found.hash;
          else if (typeof importedMod !== 'string' && importedMod.hash) nextModHashes[found.name] = importedMod.hash;
        }
        else {
          missing.push(importedMod);
          if (typeof importedMod !== 'string') {
            if (importedMod.hash) nextModHashes[rawNameToCheck] = importedMod.hash;
          }
        }
      });

      if (localOverridesDirty) {
        try {
          localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOverrides));
        } catch { }
      }

      const { loadRules, modTiers, loadOrder, ignoredConflicts, formatModWithTier } = unpackBlueprintLoadOrder(
        parsed,
        nameRemap,
        activeGameSchema
      );
      const availableMods = deduplicateBlueprintArtifacts(
        rawAvailableMods.map((mName) => formatModWithTier(mName)),
        activeGameSchema
      );

      let baseName = `${parsed.name} (Imported)`;
      let newName = baseName;
      let counter = 1;
      while (
        playSets.some((s) => s.name.toLowerCase() === newName.toLowerCase())
      ) {
        newName = `${baseName} (${counter})`;
        counter++;
      }
      const readySet = {
        name: newName,
        mods: availableMods,
        modHashes: nextModHashes,
        modMeta: nextModMeta,
        loadRules,
        modTiers,
        loadOrder,
        ignoredConflicts,
        ignoredGhosts: [],
      };
      if (missing.length > 0) {
        setPendingImportSet(readySet);
        setMissingImportMods(missing);
        return "missing";
      } else {
        finalizeImport(readySet);
        return "success";
      }
    } catch (err) {
      setStatus(`${t("icon_block", "block")} ${t("alert_import_failed", "Import Failed:")}${err}`);
      return "error";
    }
  }
  function finalizeImport(setToAdd: any) {
    if (!setToAdd) return;

    let finalName = setToAdd.name;
    let copyIndex = 1;
    while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase())) {
      finalName = `${setToAdd.name} (${copyIndex})`;
      copyIndex++;
    }
    setToAdd.name = finalName;

    const updatedSets = [...playSets, setToAdd];
    setPlaySets(updatedSets);

    setStatus(
      `${t("icon_check_circle", "check_circle")} ${t("status_profile_imported", "Profile Imported")}${setToAdd.name}`,
    );
    setMissingImportMods(null);
    setPendingImportSet(null);
  }

  async function equipPlaySet(
    setName: string | number,
    overrideSet?: any,
    skipCloudCheck = false,
    onAfterAuthorizedDeploy?: () => void
  ): Promise<boolean> {
    const latestPlaySets = useStore.getState().playSets || playSets;
    const targetSet =
      overrideSet ||
      (typeof setName === "number"
        ? latestPlaySets[setName]
        : latestPlaySets.find((s: any) => s.name === setName) ||
        playSets.find((s) => s.name === setName));
    if (!targetSet) return false;
    const resolvedSetName = targetSet.name || String(setName);
    setStatus(
      `${t("status_deploying_prefix", "DEPLOYING: {Blueprint} [")}${resolvedSetName}${t("status_deploying_suffix", "]...")}`,
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      useStore.setState({ activeConflictCount: { total: 0, tier4: 0, tier3: 0 }, activeBrokenCounts: { broken: 0, unstable: 0 } });
      console.time("equipPlaySet_JS_overhead");
      const config: any = await invoke("get_saved_coordinates");
      let deployPayload: any[] = [];
      const fileNameToPathMap = new Map<string, string>();
      const normalize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

      const customExtRegexStr = `\\.(${(activeGameSchema?.extensions?.supported || []).map((e: any) => e.replace('.', '')).join('|') || '[a-z0-9]+'}|cfg|ini|dat|tmbin|json|xml|log|txt)$`;
      const customExtRegex = new RegExp(customExtRegexStr, 'i');
      const extRegex = getExtensionRegex(activeGameSchema);

      const modMap = new Map<string, any>();
      const modBaseMap = new Map<string, any>();
      modList.forEach((m: any) => {
        modMap.set(m.name, m);
        const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '');
        if (mBase) modBaseMap.set(mBase, m);
      });

      const buildPathMap = (nodes: any[], currentPath: string) => {
        for (const node of nodes) {
          if (node.node_type === "folder" || node.type === "folder") {
            const nextPath = currentPath ? `${currentPath}/${node.name}` : node.name;
            if (node.children) buildPathMap(node.children, nextPath);
          } else if (node.node_type === "file" || node.type === "file") {
            fileNameToPathMap.set(node.name.toLowerCase(), currentPath);
            const noExt = node.name.replace(customExtRegex, "");
            fileNameToPathMap.set(noExt.toLowerCase(), currentPath);
            if (node.assignedModName) {
              fileNameToPathMap.set(normalize(node.assignedModName), currentPath);
            }
          }
        }
      };

      targetSet.mods.forEach((rawMod: any) => {
        const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
        if (!modName) return;

        let modObj = modMap.get(modName);
        if (!modObj) {
          const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
          if (targetBase) modObj = modBaseMap.get(targetBase);
        }

        let parsedStructure = modObj?.folder_structure;
        if (typeof parsedStructure === 'string') {
          try { parsedStructure = JSON.parse(parsedStructure); } catch (e) { }
        }
        if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
          buildPathMap(parsedStructure, "");
        }
      });

      targetSet.mods.forEach((rawMod: any) => {
        const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
        if (!modName) return;

        const strippedModName = stripPriorityTierPrefix(modName, activeGameSchema);
        let modObj = modMap.get(modName) || modMap.get(strippedModName);
        if (!modObj) {
          const targetBase = strippedModName.split(/[\\/]/).pop()?.replace(extRegex, '');
          if (targetBase) modObj = modBaseMap.get(targetBase);
        }
        if (!modObj && modList.length > 0) return;

        const vaultSourcePath = modObj?.name || strippedModName;
        const flatFileName = vaultSourcePath.split(/[\\/]/).pop() || vaultSourcePath;
        let targetPath = flatFileName;

        const flatLower = flatFileName.toLowerCase();
        const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
        const norm = normalize(noExt);

        const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
        if (folderPath !== undefined && folderPath !== null) {
          targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
        }

        if (modName.toLowerCase().startsWith("sanctuary/") || modName.toLowerCase().startsWith("sanctuary\\")) {
          targetPath = `Sanctuary/${targetPath}`;
        }

        deployPayload.push({ path: vaultSourcePath, allow_write: modObj?.allow_write || false, target_path: targetPath });
      });

      const explicitlyDeployedFlatNames = new Set(
        deployPayload.map(dp => {
          const flat = dp.path.split(/[\\/]/).pop() || dp.path;
          return flat.toLowerCase();
        })
      );

      const deployPayloadPaths = new Set(deployPayload.map(dp => dp.path));

      modList.forEach((m: any) => {
        if (deployPayloadPaths.has(m.name)) return;

        const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
        const flatLower = flatFileName.toLowerCase();
        const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
        const norm = normalize(noExt);

        if (!explicitlyDeployedFlatNames.has(flatLower)) {
          const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
          if (folderPath !== undefined && folderPath !== null) {
            let targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
            if (m.name.toLowerCase().startsWith("sanctuary/") || m.name.toLowerCase().startsWith("sanctuary\\")) {
              targetPath = `Sanctuary/${targetPath}`;
            }
            deployPayload.push({ path: m.name, allow_write: true, target_path: targetPath });
            explicitlyDeployedFlatNames.add(flatLower);
            deployPayloadPaths.add(m.name);
          }
        }
      });

      const potentialPrefixMap = new Map<string, any>();
      deployPayload.forEach(dp => {
        if ((dp.target_path || dp.folder_structure) && !dp.target_path?.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
          const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
          const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
          if (!potentialPrefixMap.has(prefix)) {
            potentialPrefixMap.set(prefix, dp);
          }
        }
      });

      modList.forEach(m => {
        if (m.name.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          if (!deployPayloadPaths.has(m.name)) {
            const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
            const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
            const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();

            const matchingMod = potentialPrefixMap.get(prefix);

            if (matchingMod) {
              let folderName = "";
              if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
                folderName = matchingMod.target_path.split('/')[0];
              } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
                folderName = matchingMod.folder_structure[0].name;
              }

              if (folderName) {
                deployPayload.push({ path: m.name, allow_write: true, target_path: `${folderName}/${flatFileName}` });
              } else {
                deployPayload.push({ path: m.name, allow_write: true, target_path: flatFileName });
              }
              deployPayloadPaths.add(m.name);
            }
          }
        }
      });

      deployPayload.forEach(dp => {
        if (dp.target_path && dp.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
          const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
          const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();

          const matchingMod = potentialPrefixMap.get(prefix);

          if (matchingMod && matchingMod !== dp) {
            let folderName = "";
            if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
              folderName = matchingMod.target_path.split('/')[0];
            } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
              folderName = matchingMod.folder_structure[0].name;
            }

            if (folderName) {
              dp.target_path = `${folderName}/${flatFileName}`;
            }
          }
        }
      });

      const compiledOrder = compileLoadOrder(
        targetSet.mods || [],
        targetSet.loadRules || [],
        targetSet.modTiers || {},
        targetSet.loadOrder || [],
        activeGameSchema,
        modList
      );
      const compiledByClean = new Map<string, CompiledLoadOrderItem>();
      compiledOrder.items.forEach((item) => {
        compiledByClean.set(item.cleanName.toLowerCase(), item);
      });
      const knownTierFoldersLower = new Set(
        compiledOrder.priorityTiers.map((pt) => (pt.folder || "").toLowerCase()).filter(Boolean)
      );

      deployPayload.forEach((dp) => {
        const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
        const compiled = compiledByClean.get(flatFileName.toLowerCase());
        if (compiled) {
          dp.load_order_index = compiled.index;
          if (compiled.tierFolder) {
            dp.priority_tier = compiled.tierFolder;
            const currentTarget = (dp.target_path || flatFileName).replace(/\\/g, "/");
            const segs = currentTarget.split("/");
            if (segs.length > 1 && knownTierFoldersLower.has(segs[0].toLowerCase())) {
              segs[0] = compiled.tierFolder;
              dp.target_path = segs.join("/");
            } else {
              dp.target_path = `${compiled.tierFolder}/${currentTarget}`;
            }
          }
        }
      });

      deployPayload.sort((a, b) => (a.load_order_index ?? 999999) - (b.load_order_index ?? 999999));

      console.timeEnd("equipPlaySet_JS_overhead");
      if (!skipCloudCheck) {
        const allowed = await checkAndPromptSymlinkCloudSyncConsent({
          modsPath: config.mods_path,
          vaultPath: config.vault_path,
          docsPath: config.docs_path,
          livePath: config.live_path,
          actionLabel: `${t("btn_equip", "Deploy {Blueprint}")}: ${resolvedSetName || targetSet.name}`,
          onAuthorizedProceed: () => {
            void equipPlaySet(setName, overrideSet, true).then((ok) => {
              if (ok && onAfterAuthorizedDeploy) onAfterAuthorizedDeploy();
            });
          },
        });
        if (!allowed) {
          setStatus(
            t(
              "cloud_guard_pending_action_canceled",
              "Cloud-sync folder consent required before projecting symlinks."
            )
          );
          return false;
        }
      }
      const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });
      setActiveSetName(resolvedSetName);
      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`, resolvedSetName);

      const currentSets = useStore.getState().playSets || playSets;
      const newIndex = currentSets.findIndex((s: any) => s.name === resolvedSetName);
      if (newIndex !== -1 && setActivePlaySetIndex) {
        setActivePlaySetIndex(newIndex);
      }
      setStatus(`${t("icon_check_circle", "check_circle")} ${t("btn_deployed", "DEPLOYED")} ${msg as string} ${t("backend_deployed_suffix", "{mods}.")} `);
      precomputeBlueprintConflicts(resolvedSetName, targetSet.mods, config.vault_path).catch(() => { });
      return true;
    } catch (err) {
      const errStr = typeof err === "string" ? err : (err as any)?.message || String(err);
      setStatus(`${t("status_deploy_failed", "Deployment Failed:")} ${t(errStr, errStr)}`);
      return false;
    }
  }

  const getMissingStrings = (setName: string) => {
    const targetSet = playSets.find((s: any) => s.name === setName);
    if (!targetSet || !targetSet.mods) return [];

    let changed = false;
    const nextMods: string[] = [];
    const nextHashes = { ...(targetSet.modHashes || {}) };
    const missing: string[] = [];

    const extRegex = getExtensionRegex(activeGameSchema);

    for (const rawMod of targetSet.mods) {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      if (!modName) continue;

      const strippedModName = stripPriorityTierPrefix(modName, activeGameSchema);
      if (modMap.has(modName) || modMap.has(strippedModName)) {
        nextMods.push(modName);
      } else {
        let healed = false;
        const oldHash = nextHashes[modName];
        if (oldHash) {
          const dnaMatch = hashToMod.get(oldHash);
          if (dnaMatch) {
            nextMods.push(dnaMatch.name);
            nextHashes[dnaMatch.name] = dnaMatch.hash;
            delete nextHashes[modName];
            healed = true;
            changed = true;
          }
        }

        if (!healed) {
          const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
          const baseMatch = targetBase ? baseToMod.get(targetBase) : null;

          if (baseMatch) {
            nextMods.push(baseMatch.name);
            if (baseMatch.hash) nextHashes[baseMatch.name] = baseMatch.hash;
            delete nextHashes[modName];
            healed = true;
            changed = true;
          }
        }

        if (!healed) {
          nextMods.push(modName);
          missing.push(modName);
        }
      }
    }

    if (changed) {
      setTimeout(() => {
        setPlaySets((prev: any[]) => {
          const copy = JSON.parse(JSON.stringify(prev));
          const target = copy.find((s: any) => s.name === setName);
          if (target) {
            target.mods = nextMods;
            target.modHashes = nextHashes;
          }

          return copy;
        });
      }, 0);
    }

    const ignored = targetSet.ignoredGhosts || [];
    return missing.filter(m => !ignored.includes(m));
  };

  const ignoreMissingString = (setName: string, modName: string) => {
    setPlaySets((prev: any[]) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const target = copy.find((s: any) => s.name === setName);
      if (target) {
        if (!target.ignoredGhosts) target.ignoredGhosts = [];
        if (!target.ignoredGhosts.includes(modName)) {
          target.ignoredGhosts.push(modName);
        }
      }

      return copy;
    });
  };

  const purgeMissingString = (setName: string, modName: string) => {
    setPlaySets((prev: any[]) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const target = copy.find((s: any) => s.name === setName);
      if (target && target.mods) {
        target.mods = target.mods.filter((m: string) => m !== modName);
      }

      return copy;
    });
  };

  const applyConflictOverride = useCallback(
    (
      winnerName: string,
      modPair: string,
      currentScopeName: string,
      targetTierFolder?: string,
      loserName?: string
    ) =>
      executeConflictOverride(
        activeGameSchema,
        setPlaySets,
        setIgnoredGlobal,
        winnerName,
        modPair,
        currentScopeName,
        targetTierFolder,
        loserName
      ),
    [activeGameSchema, setPlaySets, setIgnoredGlobal]
  );

  const setModPriorityTier = useCallback(
    (setName: string, modName: string | string[], tierFolder: string) => {
      const rawModName = Array.isArray(modName) ? String(modName[0] || "") : String(modName || "");
      if (!rawModName) return;
      const schemaTiers = activeGameSchema?.load_order?.priority_tiers || [];
      const knownFoldersLower = new Set(
        ["sanctuary", "sanctuary2", "sanctuary3", ...schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase())].filter(Boolean)
      );
      const cleanTarget = (rawModName.split(/[\\/]/).pop() || rawModName).toLowerCase();

      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        const nextMods = [...(currentSet.mods || [])];
        const nextModTiers = { ...(currentSet.modTiers || {}) };

        let canonicalFile = rawModName.split(/[\\/]/).pop() || rawModName;

        for (let i = 0; i < nextMods.length; i++) {
          const strM = typeof nextMods[i] === "string" ? nextMods[i] : nextMods[i]?.name || nextMods[i]?.path || "";
          const fileM = strM.split(/[\\/]/).pop() || strM;
          if (fileM.toLowerCase() === cleanTarget) {
            canonicalFile = fileM;
            const segs = strM.replace(/\\/g, "/").split("/");
            if (segs.length > 1 && knownFoldersLower.has(segs[0].toLowerCase())) {
              segs.shift();
            }
            const baseRel = segs.join("/");
            const nextPath = tierFolder ? `${tierFolder}/${baseRel}` : baseRel;
            if (typeof nextMods[i] === "string") {
              nextMods[i] = nextPath;
            } else {
              nextMods[i] = { ...nextMods[i], name: nextPath, path: nextPath };
            }
          }
        }

        if (tierFolder) {
          nextModTiers[canonicalFile] = tierFolder;
        } else {
          delete nextModTiers[canonicalFile];
          delete nextModTiers[canonicalFile.toLowerCase()];
        }

        currentSet.mods = deduplicateBlueprintArtifacts(nextMods, activeGameSchema);
        currentSet.modTiers = nextModTiers;
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
    },
    [activeGameSchema, setPlaySets]
  );

  const addLoadOrderRule = useCallback(
    (setName: string, modA: string | string[], modB: string | string[], type: "after" | "before" = "after") => {
      const rawA = Array.isArray(modA) ? String(modA[0] || "") : String(modA || "");
      const rawB = Array.isArray(modB) ? String(modB[0] || "") : String(modB || "");
      const cleanA = rawA.split(/[\\/]/).pop() || rawA;
      const cleanB = rawB.split(/[\\/]/).pop() || rawB;
      if (!cleanA || !cleanB || cleanA.toLowerCase() === cleanB.toLowerCase()) return;

      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        const aLow = cleanA.toLowerCase();
        const bLow = cleanB.toLowerCase();

        const filtered = (currentSet.loadRules || []).filter(
          (r: LoadOrderRule) =>
            !(
              (r.modA.toLowerCase() === aLow && r.modB.toLowerCase() === bLow) ||
              (r.modA.toLowerCase() === bLow && r.modB.toLowerCase() === aLow)
            )
        );

        filtered.push({
          id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          modA: cleanA,
          modB: cleanB,
          type,
        });

        currentSet.loadRules = filtered;
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
    },
    [setPlaySets]
  );

  const removeLoadOrderRule = useCallback(
    (setName: string, ruleId: string) => {
      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        currentSet.loadRules = (currentSet.loadRules || []).filter((r: LoadOrderRule) => r.id !== ruleId);
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
    },
    [setPlaySets]
  );

  const flipLoadOrderRule = useCallback(
    (setName: string, ruleId: string) => {
      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        currentSet.loadRules = (currentSet.loadRules || []).map((r: LoadOrderRule) =>
          r.id === ruleId ? { ...r, type: r.type === "after" ? "before" : "after" } : r
        );
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
    },
    [setPlaySets]
  );

  const moveModInLoadOrder = useCallback(
    (setName: string, modCleanName: string, direction: "up" | "down" | "top" | "bottom") => {
      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        const compiled = compileLoadOrder(
          currentSet.mods || [],
          currentSet.loadRules || [],
          currentSet.modTiers || {},
          currentSet.loadOrder || [],
          activeGameSchema,
          []
        );
        const order = compiled.items.map((it) => it.cleanName);
        const pos = order.findIndex((n) => n.toLowerCase() === modCleanName.toLowerCase());
        if (pos === -1) return prevSets;

        const [item] = order.splice(pos, 1);
        if (direction === "up") {
          order.splice(Math.max(0, pos - 1), 0, item);
        } else if (direction === "down") {
          order.splice(Math.min(order.length, pos + 1), 0, item);
        } else if (direction === "top") {
          order.unshift(item);
        } else if (direction === "bottom") {
          order.push(item);
        }

        currentSet.loadOrder = order;
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
    },
    [activeGameSchema, setPlaySets]
  );

  const autoSortBlueprintLoadOrder = useCallback(
    (setName: string) => {
      setPlaySets((prevSets: any[]) => {
        const idx = prevSets.findIndex((p: any) => p.name.toLowerCase() === setName.toLowerCase());
        if (idx === -1) return prevSets;
        const updatedSets = [...prevSets];
        const currentSet = { ...updatedSets[idx] };
        const compiled = compileLoadOrder(
          currentSet.mods || [],
          currentSet.loadRules || [],
          currentSet.modTiers || {},
          currentSet.loadOrder || [],
          activeGameSchema,
          []
        );
        currentSet.loadOrder = compiled.items.map((it) => it.cleanName);
        updatedSets[idx] = currentSet;
        return updatedSets;
      });
      setStatus(`${t("icon_check_circle", "check_circle")} ${t("lo_status_sorted", "Load order topologically sorted by active rules.")}`);
    },
    [activeGameSchema, setPlaySets, setStatus, t]
  );

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

