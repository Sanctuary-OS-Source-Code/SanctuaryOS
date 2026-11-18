import { useStore } from "../../store";
import { getExtensionRegex, formatDisplayName, deduplicateBlueprintArtifacts } from "../../shared";
import type { LoadOrderRule, CompiledLoadOrderItem, LoadOrderCompilationResult } from "./types";

export function compileLoadOrder(
  rawMods: any[] = [],
  loadRules: LoadOrderRule[] = [],
  modTiers: Record<string, string> = {},
  explicitOrder: string[] = [],
  schema: any = null,
  modList: any[] = [],
  skipDisplayFormat: boolean = false
): LoadOrderCompilationResult {
  const loadOrderCfg = schema?.load_order || {};
  const strategy = loadOrderCfg.strategy || "folder_priority";
  const direction = loadOrderCfg.direction || "higher_wins";
  const manifestFile =
    strategy === "numeric_prefix"
      ? "001_<file>"
      : strategy === "timestamp"
        ? "mtime"
        : loadOrderCfg.manifest_file || (strategy === "manifest_list" ? "loadorder.txt" : "");
  const prefixFormat = loadOrderCfg.prefix_format || "{index:03}_";
  const priorityTiers: { id: string; label: string; folder: string; priority: number }[] =
    Array.isArray(loadOrderCfg.priority_tiers) && loadOrderCfg.priority_tiers.length > 0
      ? [...loadOrderCfg.priority_tiers].sort((a, b) => (a.priority || 0) - (b.priority || 0))
      : [];

  const folderToTierIndex = new Map<string, number>();
  priorityTiers.forEach((tier, idx) => {
    folderToTierIndex.set((tier.folder || "").toLowerCase(), idx);
  });

  const hasRules = Array.isArray(loadRules) && loadRules.length > 0;
  const extRegex = hasRules ? getExtensionRegex(schema) : null;
  const modDisplayMap = new Map<string, string>();
  if (!skipDisplayFormat && modList.length > 0) {
    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      if (m?.displayName) {
        const rawN = m.name || "";
        const lastSlash = Math.max(rawN.lastIndexOf("/"), rawN.lastIndexOf("\\"));
        const clean = lastSlash >= 0 ? rawN.slice(lastSlash + 1) : rawN;
        if (clean) {
          modDisplayMap.set(clean.toLowerCase(), m.displayName);
        }
      }
    }
  }

  const entryMap = new Map<
    string,
    { rawMod: string; cleanName: string; key: string; baseTierIdx: number; explicitPos: number }
  >();

  const explicitOrderMap = new Map<string, number>();
  for (let i = 0; i < explicitOrder.length; i++) {
    const n = explicitOrder[i];
    if (!n) continue;
    const lastSlash = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
    const clean = (lastSlash >= 0 ? n.slice(lastSlash + 1) : n).toLowerCase();
    if (!explicitOrderMap.has(clean)) explicitOrderMap.set(clean, i);
  }

  const noExtMap = new Map<string, string>();

  for (let idx = 0; idx < rawMods.length; idx++) {
    const m = rawMods[idx];
    const rawStr = typeof m === "string" ? m : String(m?.name || m?.path || "");
    if (
      !rawStr ||
      rawStr.startsWith("FOLDER_") ||
      rawStr.startsWith("SET_") ||
      rawStr.startsWith("LOCAL_SET_")
    ) {
      continue;
    }
    const lastSlash = Math.max(rawStr.lastIndexOf("/"), rawStr.lastIndexOf("\\"));
    const cleanName = lastSlash >= 0 ? rawStr.slice(lastSlash + 1) || rawStr : rawStr;
    const key = cleanName.toLowerCase();
    if (!key) continue;

    let detectedFolder = "";
    if (modTiers[cleanName] !== undefined) {
      detectedFolder = modTiers[cleanName];
    } else if (modTiers[key] !== undefined) {
      detectedFolder = modTiers[key];
    } else if (lastSlash > 0) {
      const firstSlash = rawStr.indexOf("/");
      const firstBackslash = rawStr.indexOf("\\");
      const firstSep =
        firstSlash >= 0 && firstBackslash >= 0
          ? Math.min(firstSlash, firstBackslash)
          : Math.max(firstSlash, firstBackslash);
      if (firstSep > 0) {
        const firstSegLow = rawStr.slice(0, firstSep).toLowerCase();
        const tierIdx = folderToTierIndex.get(firstSegLow);
        if (tierIdx !== undefined) {
          detectedFolder = priorityTiers[tierIdx]?.folder || "";
        }
      }
    }

    const baseTierIdx = folderToTierIndex.get(detectedFolder.toLowerCase()) ?? 0;
    const expIdx = explicitOrderMap.get(key);
    const explicitPos = expIdx !== undefined ? expIdx : 10000 + idx;

    const existing = entryMap.get(key);
    if (!existing || baseTierIdx > existing.baseTierIdx) {
      entryMap.set(key, { rawMod: rawStr, cleanName, key, baseTierIdx, explicitPos });
      if (hasRules && extRegex) {
        noExtMap.set(key.replace(extRegex, ""), key);
      }
    }
  }

  const keys = Array.from(entryMap.keys());
  const effectiveTierIdx = new Map<string, number>();
  const autoPromotedSet = new Set<string>();
  keys.forEach((k) => effectiveTierIdx.set(k, entryMap.get(k)!.baseTierIdx));

  const cycles: { ruleIds: string[]; chain: string[] }[] = [];
  let sortedKeys: string[] = [];

  if (!hasRules) {
    sortedKeys = [...keys].sort((a, b) => {
      const eA = entryMap.get(a)!;
      const eB = entryMap.get(b)!;
      if (eA.baseTierIdx !== eB.baseTierIdx) return eA.baseTierIdx - eB.baseTierIdx;
      return eA.explicitPos - eB.explicitPos;
    });
  } else {
    const resolveModKey = (name: string): string | null => {
      if (!name) return null;
      const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
      const clean = (lastSlash >= 0 ? name.slice(lastSlash + 1) : name).toLowerCase();
      if (entryMap.has(clean)) return clean;
      if (!extRegex) return null;
      const noExt = clean.replace(extRegex, "");
      return noExtMap.get(noExt) || null;
    };

    // Build directed graph where edge U -> V means U loads BEFORE V (V loads AFTER U)
    const adj = new Map<string, { to: string; ruleId: string }[]>();
    keys.forEach((k) => adj.set(k, []));

    loadRules.forEach((r) => {
      const kA = resolveModKey(r.modA);
      const kB = resolveModKey(r.modB);
      if (!kA || !kB || kA === kB) return;
      if (r.type === "after") {
        // modA loads AFTER modB => kB -> kA
        adj.get(kB)?.push({ to: kA, ruleId: r.id });
      } else {
        // modA loads BEFORE modB => kA -> kB
        adj.get(kA)?.push({ to: kB, ruleId: r.id });
      }
    });

    // Detect cycles via DFS & identify back-edges to skip so topological sort always succeeds
    const visited = new Map<string, number>(); // 0=unvisited, 1=visiting, 2=done
    const parentNode = new Map<string, string>();
    const parentRule = new Map<string, string>();
    const skippedRuleIds = new Set<string>();

    const dfs = (u: string) => {
      visited.set(u, 1);
      const edges = adj.get(u) || [];
      for (const edge of edges) {
        const v = edge.to;
        const state = visited.get(v) || 0;
        if (state === 0) {
          parentNode.set(v, u);
          parentRule.set(v, edge.ruleId);
          dfs(v);
        } else if (state === 1) {
          skippedRuleIds.add(edge.ruleId);
          const chain: string[] = [entryMap.get(v)?.cleanName || v];
          const ruleIds: string[] = [edge.ruleId];
          let curr = u;
          let guard = 0;
          while (curr && curr !== v && guard < 50) {
            chain.push(entryMap.get(curr)?.cleanName || curr);
            const pRule = parentRule.get(curr);
            if (pRule) ruleIds.push(pRule);
            curr = parentNode.get(curr) || "";
            guard++;
          }
          chain.push(entryMap.get(v)?.cleanName || v);
          chain.reverse();
          cycles.push({ ruleIds, chain });
        }
      }
      visited.set(u, 2);
    };

    keys.forEach((k) => {
      if ((visited.get(k) || 0) === 0 && (adj.get(k)?.length || 0) > 0) dfs(k);
    });

    // Topological sort (Kahn's algorithm) weighted by baseTierIdx and explicitPos
    const inDegree = new Map<string, number>();
    const dagAdj = new Map<string, string[]>();
    keys.forEach((k) => {
      inDegree.set(k, 0);
      dagAdj.set(k, []);
    });

    keys.forEach((u) => {
      for (const edge of adj.get(u) || []) {
        if (skippedRuleIds.has(edge.ruleId)) continue;
        dagAdj.get(u)?.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      }
    });

    const compareKeys = (a: string, b: string) => {
      const eA = entryMap.get(a)!;
      const eB = entryMap.get(b)!;
      const tA = effectiveTierIdx.get(a) ?? eA.baseTierIdx;
      const tB = effectiveTierIdx.get(b) ?? eB.baseTierIdx;
      if (tA !== tB) return tA - tB;
      return eA.explicitPos - eB.explicitPos;
    };

    let ready: string[] = keys.filter((k) => (inDegree.get(k) || 0) === 0).sort(compareKeys);
    let headIdx = 0;

    while (headIdx < ready.length) {
      const u = ready[headIdx++];
      sortedKeys.push(u);
      const uTier = effectiveTierIdx.get(u) || 0;
      const neighbors = dagAdj.get(u) || [];
      let addedNew = false;
      for (const v of neighbors) {
        const curVTier = effectiveTierIdx.get(v) || 0;
        const maxTierIdx = priorityTiers.length - 1;
        if (strategy === "folder_priority" && curVTier <= uTier && maxTierIdx > 0) {
          const promoted = Math.min(uTier + 1, maxTierIdx);
          if (promoted > curVTier) {
            effectiveTierIdx.set(v, promoted);
            autoPromotedSet.add(v);
          }
        }
        const nextIn = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, nextIn);
        if (nextIn === 0) {
          ready.push(v);
          addedNew = true;
        }
      }
      if (addedNew) {
        ready = ready.slice(headIdx).sort(compareKeys);
        headIdx = 0;
      }
    }

    if (sortedKeys.length < keys.length) {
      const seen = new Set(sortedKeys);
      keys.forEach((k) => {
        if (!seen.has(k)) sortedKeys.push(k);
      });
    }
  }

  // Also ensure final sequence is grouped by effectiveTierIdx when folder_priority is active and no rule is violated
  const items: CompiledLoadOrderItem[] = sortedKeys.map((k, idx) => {
    const entry = entryMap.get(k)!;
    const tierIdx = effectiveTierIdx.get(k) ?? entry.baseTierIdx;
    const tier = priorityTiers[tierIdx] || priorityTiers[0];
    const tierFolder = tier?.folder || "";
    const displayNum = String(idx + 1).padStart(3, "0");

    let previewPath = entry.cleanName;
    if (strategy === "numeric_prefix") {
      const prefix = prefixFormat.replace("{index:03}", displayNum).replace("{index}", String(idx + 1));
      previewPath = `${prefix}${entry.cleanName}`;
    } else if (strategy === "manifest_list") {
      previewPath = `${manifestFile} #${displayNum} ➔ ${entry.cleanName}`;
    } else {
      previewPath = tierFolder ? `${tierFolder}/${entry.cleanName}` : entry.cleanName;
    }

    return {
      rawMod: entry.rawMod,
      cleanName: entry.cleanName,
      displayName: skipDisplayFormat
        ? entry.cleanName
        : modDisplayMap.get(k) || formatDisplayName(entry.cleanName, undefined, schema),
      index: idx,
      tierFolder,
      tierId: tier?.id || "default",
      tierLabel: tier?.label || "Base Tier",
      tierPriority: tier?.priority || 500,
      previewPath,
      autoPromoted: autoPromotedSet.has(k),
    };
  });

  return {
    items,
    cycles,
    strategy,
    manifestFile,
    direction,
    priorityTiers,
  };
}

export function packageBlueprintLoadOrder(
  targetSet: any,
  schema: any = null,
  _modList: any[] = []
) {
  const compiled = compileLoadOrder(
    targetSet?.mods || [],
    targetSet?.loadRules || [],
    targetSet?.modTiers || {},
    targetSet?.loadOrder || [],
    schema,
    [],
    true
  );

  const extRegex = getExtensionRegex(schema);
  const itemByCleanKey = new Map<string, CompiledLoadOrderItem>();
  const itemByNoExtKey = new Map<string, CompiledLoadOrderItem>();
  compiled.items.forEach((it) => {
    const low = it.cleanName.toLowerCase();
    itemByCleanKey.set(low, it);
    const noExt = low.replace(extRegex, "");
    if (noExt) itemByNoExtKey.set(noExt, it);
  });

  const resolveCanonicalItem = (rawModStr: string): CompiledLoadOrderItem | undefined => {
    const str = String(rawModStr || "");
    const lastSlash = Math.max(str.lastIndexOf("/"), str.lastIndexOf("\\"));
    const base = (lastSlash >= 0 ? str.slice(lastSlash + 1) || str : str).toLowerCase();
    if (!base) return undefined;
    return itemByCleanKey.get(base) || itemByNoExtKey.get(base.replace(extRegex, ""));
  };

  const rules: LoadOrderRule[] = Array.isArray(targetSet?.loadRules) ? targetSet.loadRules : [];
  const canonicalRules: LoadOrderRule[] = [];
  const rulesByModA = new Map<string, LoadOrderRule[]>();
  const rulesByModB = new Map<string, LoadOrderRule[]>();

  rules.forEach((r) => {
    if (!r?.modA || !r?.modB) return;
    const strA = String(r.modA);
    const strB = String(r.modB);
    const lastA = Math.max(strA.lastIndexOf("/"), strA.lastIndexOf("\\"));
    const lastB = Math.max(strB.lastIndexOf("/"), strB.lastIndexOf("\\"));
    const itemA = resolveCanonicalItem(strA);
    const itemB = resolveCanonicalItem(strB);
    const baseA = itemA?.cleanName || (lastA >= 0 ? strA.slice(lastA + 1) || strA : strA);
    const baseB = itemB?.cleanName || (lastB >= 0 ? strB.slice(lastB + 1) || strB : strB);
    const cleanA = baseA.toLowerCase();
    const cleanB = baseB.toLowerCase();
    const ruleObj: LoadOrderRule = {
      id: r.id || `rule_${cleanA}_${r.type}_${baseB}`,
      modA: baseA,
      modB: baseB,
      type: r.type === "before" ? "before" : "after",
    };
    canonicalRules.push(ruleObj);

    const listA = rulesByModA.get(cleanA) || [];
    listA.push(ruleObj);
    rulesByModA.set(cleanA, listA);
    const noExtA = cleanA.replace(extRegex, "");
    if (noExtA && noExtA !== cleanA) {
      rulesByModA.set(noExtA, listA);
    }

    const listB = rulesByModB.get(cleanB) || [];
    listB.push(ruleObj);
    rulesByModB.set(cleanB, listB);
    const noExtB = cleanB.replace(extRegex, "");
    if (noExtB && noExtB !== cleanB) {
      rulesByModB.set(noExtB, listB);
    }
  });

  // Collect resolved/ignored conflict pairs belonging to this Blueprint
  const ignoredPairsSet = new Set<string>();
  if (Array.isArray(targetSet?.ignoredConflicts)) {
    targetSet.ignoredConflicts.forEach((pair: any) => {
      if (typeof pair === "string" && pair.trim()) ignoredPairsSet.add(pair.trim());
    });
  }
  const globalIgnored: string[] = (() => {
    const fromStore = useStore.getState().ignoredGlobal;
    if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
    try {
      return JSON.parse(localStorage.getItem("sanctuary_ignored_conflicts") || "[]");
    } catch {
      return [];
    }
  })();
  globalIgnored.forEach((pair) => {
    if (typeof pair !== "string" || !pair.includes("::")) return;
    const [partA, partB] = pair.split("::");
    if (resolveCanonicalItem(partA) && resolveCanonicalItem(partB)) {
      ignoredPairsSet.add(pair.trim());
    }
  });
  const ignored_conflicts = Array.from(ignoredPairsSet);

  const enrichAndSortArtifacts = (rawModObjects: any[]) => {
    const dedupedModObjects = deduplicateBlueprintArtifacts(rawModObjects, schema);
    const presentKeys = new Set<string>();
    dedupedModObjects.forEach((m: any) => {
      const rawName = typeof m === "string" ? m : String(m?.name || m?.path || "");
      const lastSlash = Math.max(rawName.lastIndexOf("/"), rawName.lastIndexOf("\\"));
      const cleanName = (lastSlash >= 0 ? rawName.slice(lastSlash + 1) || rawName : rawName).toLowerCase();
      if (cleanName) {
        presentKeys.add(cleanName);
        presentKeys.add(cleanName.replace(extRegex, ""));
      }
    });

    const enriched = dedupedModObjects.map((m: any, idx: number) => {
      const rawName = typeof m === "string" ? m : String(m?.name || m?.path || "");
      const lastSlash = Math.max(rawName.lastIndexOf("/"), rawName.lastIndexOf("\\"));
      const cleanName = lastSlash >= 0 ? rawName.slice(lastSlash + 1) || rawName : rawName;
      const key = cleanName.toLowerCase();
      const noExtKey = key.replace(extRegex, "");
      const compiledItem = itemByCleanKey.get(key) || itemByNoExtKey.get(noExtKey);
      const tierFolder = compiledItem?.tierFolder || "";
      const directRules = rulesByModA.get(key) || rulesByModA.get(noExtKey) || [];
      // If a rule's modA was filtered out of rawModObjects (e.g. non-Tier-0 on Cloud upload), attach it on modB so it isn't lost
      const fallbackRules = (rulesByModB.get(key) || rulesByModB.get(noExtKey) || []).filter(
        (r) => !presentKeys.has(r.modA.toLowerCase()) && !presentKeys.has(r.modA.toLowerCase().replace(extRegex, ""))
      );
      const modRules = [...directRules, ...fallbackRules];
      const packagedName = tierFolder ? `${tierFolder}/${cleanName}` : cleanName;

      const out: any = {
        ...(typeof m === "object" && m !== null ? m : {}),
        name: packagedName,
        load_order_index: compiledItem ? compiledItem.index : 10000 + idx,
      };
      if (tierFolder) {
        out.priority_tier = tierFolder;
      }
      if (modRules.length > 0) {
        out.load_rules = modRules;
      }
      return out;
    });

    enriched.sort((a, b) => (a.load_order_index ?? 0) - (b.load_order_index ?? 0));
    for (let i = 0; i < enriched.length; i++) {
      enriched[i].load_order_index = i;
    }
    if (enriched.length > 0 && ignored_conflicts.length > 0) {
      enriched[0].ignored_conflicts = ignored_conflicts;
    }
    return enriched;
  };

  const modTiersOut: Record<string, string> = {};
  compiled.items.forEach((it) => {
    if (it.tierFolder) {
      modTiersOut[it.cleanName] = it.tierFolder;
    }
  });

  return {
    compiled,
    load_order_strategy: compiled.strategy,
    load_rules: canonicalRules,
    mod_tiers: modTiersOut,
    load_order: compiled.items.map((it) => it.cleanName),
    ignored_conflicts,
    enrichAndSortArtifacts,
  };
}

export function unpackBlueprintLoadOrder(
  rawPayload: any,
  nameRemap?: Map<string, string>,
  schema: any = null
) {
  const extRegex = getExtensionRegex(schema);
  const schemaTiers = Array.isArray(schema?.load_order?.priority_tiers)
    ? schema.load_order.priority_tiers
    : [];
  const knownTierMap = new Map<string, string>();
  schemaTiers.forEach((pt: any) => {
    if (pt?.folder) {
      knownTierMap.set(String(pt.folder).toLowerCase(), String(pt.folder));
    }
  });

  const normalizeTierFolder = (rawTier: any): string => {
    if (typeof rawTier !== "string" || !rawTier.trim()) return "";
    const low = rawTier.trim().toLowerCase();
    return knownTierMap.get(low) || "";
  };

  const noExtRemap = new Map<string, string>();
  if (nameRemap) {
    nameRemap.forEach((val, key) => {
      const stripped = key.replace(extRegex, "");
      if (stripped && !noExtRemap.has(stripped)) {
        noExtRemap.set(stripped, val);
      }
    });
  }

  const remapCleanName = (rawName: string): string => {
    const clean = String(rawName || "").split(/[\\/]/).pop() || String(rawName || "");
    if (!clean) return "";
    const low = clean.toLowerCase();
    return nameRemap?.get(low) || noExtRemap.get(low.replace(extRegex, "")) || clean;
  };

  const modTiers: Record<string, string> = {};
  const topTiers = rawPayload?.mod_tiers || rawPayload?.modTiers;
  if (topTiers && typeof topTiers === "object") {
    Object.entries(topTiers).forEach(([k, v]) => {
      const normalized = normalizeTierFolder(v);
      if (normalized) {
        const remappedKey = remapCleanName(k);
        if (remappedKey) modTiers[remappedKey] = normalized;
      }
    });
  }

  const rawList: any[] = Array.isArray(rawPayload?.mods)
    ? rawPayload.mods
    : Array.isArray(rawPayload?.artifacts)
      ? rawPayload.artifacts
      : [];

  const ruleMap = new Map<string, LoadOrderRule>();
  const addRule = (r: any) => {
    if (!r?.modA || !r?.modB) return;
    const modA = remapCleanName(r.modA);
    const modB = remapCleanName(r.modB);
    if (!modA || !modB || modA.toLowerCase() === modB.toLowerCase()) return;
    const type: "after" | "before" = r.type === "before" ? "before" : "after";
    const dedupKey = `${modA.toLowerCase()}::${type}::${modB.toLowerCase()}`;
    if (!ruleMap.has(dedupKey)) {
      ruleMap.set(dedupKey, {
        id: r.id || `rule_${modA}_${type}_${modB}_${ruleMap.size}`,
        modA,
        modB,
        type,
      });
    }
  };

  const topRules = rawPayload?.load_rules || rawPayload?.loadRules;
  if (Array.isArray(topRules)) {
    topRules.forEach(addRule);
  }

  const ignoredSet = new Set<string>();
  const addIgnoredList = (list: any) => {
    if (!Array.isArray(list)) return;
    list.forEach((pair: any) => {
      if (typeof pair === "string" && pair.trim()) {
        ignoredSet.add(pair.trim());
      }
    });
  };
  addIgnoredList(rawPayload?.ignored_conflicts || rawPayload?.ignoredConflicts);

  const indexedItems: { cleanName: string; index: number }[] = [];
  rawList.forEach((item: any, idx: number) => {
    const rawStr = typeof item === "string" ? item : String(item?.name || item?.path || "");
    if (!rawStr) return;
    const parts = rawStr.replace(/\\/g, "/").split("/");
    const remappedClean = remapCleanName(rawStr);

    let detectedTier = "";
    if (typeof item === "object" && item !== null) {
      const explicitTier = item.priority_tier || item.priorityTier || item.tierFolder;
      detectedTier = normalizeTierFolder(explicitTier);
      const itemRules = item.load_rules || item.loadRules;
      if (Array.isArray(itemRules)) {
        itemRules.forEach(addRule);
      }
      addIgnoredList(item.ignored_conflicts || item.ignoredConflicts);
    }
    if (!detectedTier && parts.length > 1) {
      const firstSegLower = parts[0].toLowerCase();
      if (knownTierMap.has(firstSegLower)) {
        detectedTier = knownTierMap.get(firstSegLower)!;
      }
    }
    if (detectedTier && remappedClean) {
      modTiers[remappedClean] = detectedTier;
    }

    const orderIdx =
      typeof item === "object" && item !== null && typeof item.load_order_index === "number"
        ? item.load_order_index
        : idx;
    if (remappedClean) {
      indexedItems.push({ cleanName: remappedClean, index: orderIdx });
    }
  });

  let loadOrder: string[] = [];
  const topOrder = rawPayload?.load_order || rawPayload?.loadOrder;
  if (Array.isArray(topOrder) && topOrder.length > 0) {
    const seen = new Set<string>();
    topOrder.forEach((n: string) => {
      const clean = remapCleanName(n);
      const low = clean.toLowerCase();
      if (clean && !seen.has(low)) {
        seen.add(low);
        loadOrder.push(clean);
      }
    });
  } else if (indexedItems.length > 0) {
    indexedItems.sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    indexedItems.forEach((it) => {
      const low = it.cleanName.toLowerCase();
      if (!seen.has(low)) {
        seen.add(low);
        loadOrder.push(it.cleanName);
      }
    });
  }

  const tierByLower = new Map<string, string>();
  Object.entries(modTiers).forEach(([k, v]) => {
    if (v) tierByLower.set(k.toLowerCase(), v);
  });

  const formatModWithTier = (localModName: string): string => {
    const clean = String(localModName || "").split(/[\\/]/).pop() || String(localModName || "");
    const tier = tierByLower.get(clean.toLowerCase());
    if (tier) {
      return `${tier}/${clean}`;
    }
    return localModName;
  };

  return {
    loadRules: Array.from(ruleMap.values()),
    modTiers,
    loadOrder,
    ignoredConflicts: Array.from(ignoredSet),
    formatModWithTier,
  };
}

