import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { useCallback } from "react";
import { getExtensionRegex, deduplicateBlueprintArtifacts } from "../../shared";
import type { LoadOrderRule } from "./types";

export function executeConflictOverride(
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
      "";
    const knownFoldersLower = new Set(
      schemaTiers.map((pt: any) => (pt.folder || "").toLowerCase()).filter(Boolean)
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
