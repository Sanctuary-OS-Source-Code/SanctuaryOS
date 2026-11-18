import { useCallback } from "react";
import {
  getExtensionRegex,
  deduplicateBlueprintArtifacts,
  stripPriorityTierPrefix,
} from "../../shared";
import type { LoadOrderRule } from "./types";
import { compileLoadOrder } from "./loadOrderCompiler";
import { executeConflictOverride } from "./conflictOverrideEngine";

export function usePlaySetRulesAndMissing({
  playSets,
  setPlaySets,
  activeGameSchema,
  setStatus,
  setIgnoredGlobal,
  t,
  modMap,
  hashToMod,
  baseToMod,
}: any) {
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
        schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase()).filter(Boolean)
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
  };
}
