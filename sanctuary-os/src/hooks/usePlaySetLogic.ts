import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useMemo, useCallback } from "react";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getExtensionRegex, formatDisplayName } from "../shared";

export interface LoadOrderRule {
  id: string;
  modA: string;
  modB: string;
  type: "after" | "before";
}

export interface CompiledLoadOrderItem {
  rawMod: string;
  cleanName: string;
  displayName: string;
  index: number;
  tierFolder: string;
  tierId: string;
  tierLabel: string;
  tierPriority: number;
  previewPath: string;
  autoPromoted?: boolean;
}

export interface LoadOrderCompilationResult {
  items: CompiledLoadOrderItem[];
  cycles: { ruleIds: string[]; chain: string[] }[];
  strategy: string;
  manifestFile: string;
  direction: string;
  priorityTiers: { id: string; label: string; folder: string; priority: number }[];
}

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
      : loadOrderCfg.manifest_file || (strategy === "manifest_list" ? "loadorder.txt" : "Resource.cfg");
  const prefixFormat = loadOrderCfg.prefix_format || "{index:03}_";
  const priorityTiers: { id: string; label: string; folder: string; priority: number }[] =
    Array.isArray(loadOrderCfg.priority_tiers) && loadOrderCfg.priority_tiers.length > 0
      ? [...loadOrderCfg.priority_tiers].sort((a, b) => (a.priority || 0) - (b.priority || 0))
      : [
          { id: "default", label: "Base Tier", folder: "", priority: 500 },
          { id: "tier_1", label: "Priority Tier 1", folder: "Sanctuary", priority: 1000 },
          { id: "tier_2", label: "Priority Tier 2", folder: "Sanctuary2", priority: 2000 },
          { id: "tier_3", label: "Priority Tier 3", folder: "Sanctuary3", priority: 3000 },
        ];

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
    if (!rawStr) continue;
    const lastSlash = Math.max(rawStr.lastIndexOf("/"), rawStr.lastIndexOf("\\"));
    const cleanName = lastSlash >= 0 ? rawStr.slice(lastSlash + 1) || rawStr : rawStr;
    const key = cleanName.toLowerCase();

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

  const itemByCleanKey = new Map<string, CompiledLoadOrderItem>();
  compiled.items.forEach((it) => {
    itemByCleanKey.set(it.cleanName.toLowerCase(), it);
  });

  const rules: LoadOrderRule[] = Array.isArray(targetSet?.loadRules) ? targetSet.loadRules : [];
  const rulesByModA = new Map<string, LoadOrderRule[]>();
  rules.forEach((r) => {
    if (!r?.modA || !r?.modB) return;
    const strA = String(r.modA);
    const strB = String(r.modB);
    const lastA = Math.max(strA.lastIndexOf("/"), strA.lastIndexOf("\\"));
    const lastB = Math.max(strB.lastIndexOf("/"), strB.lastIndexOf("\\"));
    const baseA = lastA >= 0 ? strA.slice(lastA + 1) || strA : strA;
    const baseB = lastB >= 0 ? strB.slice(lastB + 1) || strB : strB;
    const cleanA = baseA.toLowerCase();
    const list = rulesByModA.get(cleanA) || [];
    list.push({
      id: r.id || `rule_${cleanA}_${r.type}_${r.modB}`,
      modA: baseA,
      modB: baseB,
      type: r.type === "before" ? "before" : "after",
    });
    rulesByModA.set(cleanA, list);
  });

  const enrichAndSortArtifacts = (rawModObjects: any[]) => {
    const enriched = rawModObjects.map((m: any, idx: number) => {
      const rawName = typeof m === "string" ? m : String(m?.name || m?.path || "");
      const lastSlash = Math.max(rawName.lastIndexOf("/"), rawName.lastIndexOf("\\"));
      const cleanName = lastSlash >= 0 ? rawName.slice(lastSlash + 1) || rawName : rawName;
      const key = cleanName.toLowerCase();
      const compiledItem = itemByCleanKey.get(key);
      const tierFolder = compiledItem?.tierFolder || "";
      const modRules = rulesByModA.get(key);
      const packagedName = tierFolder ? `${tierFolder}/${cleanName}` : cleanName;

      const out: any = {
        ...(typeof m === "object" && m !== null ? m : {}),
        name: packagedName,
        load_order_index: compiledItem ? compiledItem.index : 10000 + idx,
      };
      if (tierFolder) {
        out.priority_tier = tierFolder;
      }
      if (modRules && modRules.length > 0) {
        out.load_rules = modRules;
      }
      return out;
    });

    enriched.sort((a, b) => (a.load_order_index ?? 0) - (b.load_order_index ?? 0));
    for (let i = 0; i < enriched.length; i++) {
      enriched[i].load_order_index = i;
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
    load_rules: rules,
    mod_tiers: modTiersOut,
    load_order: compiled.items.map((it) => it.cleanName),
    enrichAndSortArtifacts,
  };
}

export function unpackBlueprintLoadOrder(
  rawPayload: any,
  nameRemap?: Map<string, string>,
  schema: any = null
) {
  const schemaTiers = Array.isArray(schema?.load_order?.priority_tiers)
    ? schema.load_order.priority_tiers
    : [];
  const knownTierMap = new Map<string, string>([
    ["sanctuary", "Sanctuary"],
    ["sanctuary2", "Sanctuary2"],
    ["sanctuary3", "Sanctuary3"],
  ]);
  schemaTiers.forEach((pt: any) => {
    if (pt?.folder) {
      knownTierMap.set(String(pt.folder).toLowerCase(), String(pt.folder));
    }
  });

  const remapCleanName = (rawName: string): string => {
    const clean = String(rawName || "").split(/[\\/]/).pop() || String(rawName || "");
    if (!clean) return "";
    return nameRemap?.get(clean.toLowerCase()) || clean;
  };

  const modTiers: Record<string, string> = {};
  const topTiers = rawPayload?.mod_tiers || rawPayload?.modTiers;
  if (topTiers && typeof topTiers === "object") {
    Object.entries(topTiers).forEach(([k, v]) => {
      if (typeof v === "string" && v.trim()) {
        const remappedKey = remapCleanName(k);
        if (remappedKey) modTiers[remappedKey] = v.trim();
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

  const indexedItems: { cleanName: string; index: number }[] = [];
  rawList.forEach((item: any, idx: number) => {
    const rawStr = typeof item === "string" ? item : String(item?.name || item?.path || "");
    if (!rawStr) return;
    const parts = rawStr.replace(/\\/g, "/").split("/");
    const remappedClean = remapCleanName(rawStr);

    let detectedTier = "";
    if (typeof item === "object" && item !== null) {
      const explicitTier = item.priority_tier || item.priorityTier || item.tierFolder;
      if (typeof explicitTier === "string" && explicitTier.trim()) {
        detectedTier = explicitTier.trim();
      }
      const itemRules = item.load_rules || item.loadRules;
      if (Array.isArray(itemRules)) {
        itemRules.forEach(addRule);
      }
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
    formatModWithTier,
  };
}

export async function precomputeBlueprintConflicts(
  scopeName: string,
  targetMods?: any[],
  vaultPathOverride?: string
): Promise<{
  fatal: any[];
  tuning: any[];
  clone: any[];
  soft: any[];
  packages: number;
  totalClashes: number;
  timestamp: number;
} | null> {
  if (!scopeName) return null;
  try {
    let vaultPath = vaultPathOverride;
    if (!vaultPath) {
      const config: any = await invoke("get_saved_coordinates");
      vaultPath = config?.vault_path;
    }
    if (!vaultPath) return null;

    const state = useStore.getState();
    const sets = state.playSets || [];
    const set = sets.find((s: any) => s.name === scopeName);
    const rawMods = targetMods || set?.mods || [];
    const targetFiles = rawMods
      .map((m: any) => (typeof m === "string" ? m : m?.name || m?.path || ""))
      .filter(Boolean);

    const targetPath = `${vaultPath}/Mods`;
    const report = await invoke<any>("run_conflict_radar", {
      modsPath: targetPath,
      targetFiles,
    });

    const isClone = (modA: string, modB: string) => {
      if (!modA || !modB) return false;
      const clean = (s: string) => {
        const file = s.split(/[\\/]/).pop() || s;
        const extMatch = file.match(getExtensionRegex(state.activeGameSchema));
        const ext = extMatch ? extMatch[1].toLowerCase() : "";
        const cleaned = file
          .toLowerCase()
          .replace(/(_hq|_nonhq|_v\d+|_alt|_remake|remake|\.[a-zA-Z0-9]+)/g, "")
          .replace(/[^a-z0-9]/g, "");
        return cleaned + "_" + ext;
      };
      return clean(modA) === clean(modB);
    };

    const fatal: any[] = [];
    const tuning: any[] = [];
    const clone: any[] = [];
    const soft: any[] = [];
    let actionableClashes = 0;

    (report?.conflicts || []).forEach((c: any) => {
      const parts = String(c.mod_pair || "").split(/\s+(?:⚔️|ΓÜö∩╕Å|vs|VS|Vs|vS)\s+/);
      const modA = parts[0];
      const modB = parts.length > 1 ? parts[1] : "Unknown Overlap";
      const enrichedConflict = { ...c, modA, modB };

      if (isClone(modA, modB)) {
        clone.push(enrichedConflict);
        actionableClashes++;
      } else if (c.severity_rank == 4) {
        fatal.push(enrichedConflict);
        actionableClashes++;
      } else if (c.severity_rank == 3) {
        tuning.push(enrichedConflict);
        actionableClashes++;
      } else {
        soft.push(enrichedConflict);
      }
    });

    if (report?.installed_mods && navigator.onLine && localStorage.getItem("sanctuary_local_only") !== "true") {
      try {
        const { supabase } = await import("../supabase");
        const { data: hitList, error: dbError } = await supabase.from("logical_conflicts").select(`
          *,
          mod_a_rel:mods!logical_conflicts_mod_a_id_fkey(name),
          mod_b_rel:mods!logical_conflicts_mod_b_id_fkey(name)
        `);
        if (hitList && !dbError) {
          hitList.forEach((hit: any) => {
            const modAName = hit.mod_a_rel?.name || hit.mod_a;
            const modBName = hit.mod_b_rel?.name || hit.mod_b;
            if (!modAName || !modBName) return;
            const actualA = report.installed_mods.find(
              (m: string) => m && m.toLowerCase().includes(modAName.toLowerCase())
            );
            const actualB = report.installed_mods.find(
              (m: string) => m && m.toLowerCase().includes(modBName.toLowerCase())
            );
            if (actualA && actualB) {
              const ghostPair = `${actualA} 👻 ${actualB}`;
              actionableClashes++;
              const ghostConflict = {
                mod_pair: ghostPair,
                modA: actualA,
                modB: actualB,
                is_ghost: true,
                resolution_note: hit.resolution_note,
                severity_rank: hit.severity_rank,
              };
              if (Number(hit.severity_rank) === 4) fatal.push(ghostConflict);
              else if (Number(hit.severity_rank) === 3) tuning.push(ghostConflict);
            }
          });
        }
      } catch {}
    }

    const payload = {
      fatal,
      tuning,
      clone,
      soft,
      packages: report?.total_packages || 0,
      totalClashes: actionableClashes,
      timestamp: Date.now(),
    };

    try {
      const ignored: string[] = JSON.parse(localStorage.getItem("sanctuary_ignored_conflicts") || "[]");
      localStorage.setItem(`sanctuary_radar_cache_${scopeName}`, JSON.stringify(payload));
      localStorage.setItem(
        `radar_stats_${scopeName}`,
        JSON.stringify({
          fatal: fatal.filter((c) => !ignored.includes(c.mod_pair)).length,
          tuning: tuning.filter((c) => !ignored.includes(c.mod_pair)).length,
          clone: clone.filter((c) => !ignored.includes(c.mod_pair)).length,
          soft: soft.filter((c) => !ignored.includes(c.mod_pair)).length,
        })
      );
      window.dispatchEvent(
        new CustomEvent("sanctuary-radar-cache-updated", { detail: { scope: scopeName, payload } })
      );
    } catch {}

    return payload;
  } catch (e) {
    console.warn("Failed to precompute blueprint conflicts:", e);
    return null;
  }
}

export function usePlaySetLogic() {
  const { playSets, setPlaySets, activePlaySetIndex, setActivePlaySetIndex, activeSetName, setActiveSetName, anarchyRules, modList, activeGameSchema, setStatus, ownedDLC, maskedDLC, setIgnoredGlobal } = useStore();
  const { t } = useLexicon();
  const { setPendingImportSet, setMissingImportMods } = useModalStore();

  const { modMap, hashToMod, baseToMod, byDbId, byFamilyOrDbId, byParsedBaseName, namesAndDisplayNames, precomputedBaseNames } = useMemo(() => {
    const extRegex = getExtensionRegex(activeGameSchema);
    const m1 = new Map<string, any>();
    const m2 = new Map<string, any>();
    const m3 = new Map<string, any>();
    const byDbId = new Map<string, any>();
    const byFamilyOrDbId = new Map<string, any[]>();
    const byParsedBaseName = new Map<string, any[]>();
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
        m1.set(m.name, m);
        if (m.hash) m2.set(m.hash, m);
        const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '');
        if (mBase && !m3.has(mBase)) m3.set(mBase, m);
        if (m.familyId != null) pushToMap(byFamilyOrDbId, String(m.familyId), m);
        if (m.dbId != null && String(m.dbId) !== String(m.familyId)) {
            pushToMap(byFamilyOrDbId, String(m.dbId), m);
        }
        if (!m.isVirtual) {
            if (m.dbId) byDbId.set(String(m.dbId), m);
            const dn = m.displayName || "";
            namesAndDisplayNames.push({
               name: m.name || "",
               displayNameUpper: dn.toUpperCase(),
               displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
               orig: m
            });
        }
        const parsedBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '').toUpperCase().replace(/_SCRIPT(S)?$/i, "") || "";
        precomputedBaseNames.set(m.name, parsedBase);
        if (parsedBase) pushToMap(byParsedBaseName, parsedBase, m);
    });
    
    return { modMap: m1, hashToMod: m2, baseToMod: m3, byDbId, byFamilyOrDbId, byParsedBaseName, namesAndDisplayNames, precomputedBaseNames };
  }, [modList, activeGameSchema]);

  const toggleInActiveSet = useCallback((targetName: string, excludeBroken: boolean = true, forceRemove: boolean = false, forceActive: boolean = false) => {
    console.time("PlaySetLogic: toggleInActiveSet");
    setPlaySets((prevSets) => {
      const currentSet = prevSets[activePlaySetIndex];
      if (!currentSet) return prevSets;
      const currentRules = anarchyRules || {
        highlander: true,
        family: true,
        dependencies: true,
        intercept: true,
      };
      let rawNewMods = new Set<any>(currentSet.mods);
      const healedMods = new Set<any>();
      const localSets = JSON.parse(localStorage.getItem(`sanctuary_${useStore.getState().activeWorkspaceId}_playsets`) || "[]");
      const tierFolders: string[] = ["sanctuary", "!sanctuary", "sanctuary2", "!sanctuary2", "sanctuary3", "!sanctuary3"];
      if (Array.isArray(activeGameSchema?.load_order?.priority_tiers)) {
        for (const tObj of activeGameSchema.load_order.priority_tiers) {
          const f = String(tObj?.folder || "").trim().toLowerCase();
          if (f && !tierFolders.includes(f)) tierFolders.push(f);
        }
      }
      const hasTierPrefix = (pathStr: string) => {
        const lower = pathStr.toLowerCase();
        return tierFolders.some((tf) => lower.startsWith(`${tf}/`) || lower.startsWith(`${tf}\\`));
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
         const m = typeof mObj === 'string' ? mObj : (mObj.name || mObj.path || '');
         if (hasTierPrefix(m)) {
             const cleanM = m.split(/[\\/]/).pop()?.toLowerCase();
             if (cleanM) sanctuaryMods.set(cleanM, mObj);
         }
      });

      rawNewMods.forEach((mObj: any) => {
         const m = typeof mObj === 'string' ? mObj : (mObj.name || mObj.path || '');
         if (hasTierPrefix(m)) {
             healedMods.add(mObj);
         } else {
             const cleanM = m.split(/[\\/]/).pop()?.toLowerCase();
             const foundSanc = cleanM ? sanctuaryMods.get(cleanM) : null;
             if (foundSanc) healedMods.add(foundSanc);
             else healedMods.add(mObj);
         }
      });
      let newMods = healedMods;


      const areArchetypes = (hash1: string, hash2: string) => {
         if (!hash1 || !hash2) return false;
         return localSets.some((s: any) => (
            (s.archetypes?.core === hash1 && (s.archetypes?.twins?.includes(hash2) || s.archetypes?.addons?.includes(hash2))) ||
            (s.archetypes?.core === hash2 && (s.archetypes?.twins?.includes(hash1) || s.archetypes?.addons?.includes(hash1))) ||
            ((s.archetypes?.twins?.includes(hash1) || s.archetypes?.addons?.includes(hash1)) && (s.archetypes?.twins?.includes(hash2) || s.archetypes?.addons?.includes(hash2)))
         ));
      };
      const checkGhosted = (mObj: any) => {
        if (mObj.isGhosted) return true;
        let rDLC = mObj.requiredDLC || [];
        if (typeof rDLC === 'string') rDLC = rDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (rDLC.some((dlc: string) => {
           const baseCode = dlc.split(' ')[0].toUpperCase();
           return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        })) return true;
        if (mObj.requirements) {
           const hasMissing = mObj.requirements.some((req: any) => {
               const reqId = typeof req === 'string' ? req : req.id || req.dbId;
               const reqName = typeof req === 'string' ? req : req.name;
               const reqBaseName = precomputedBaseNames.get(reqName) || reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase().replace(/_SCRIPT(S)?$/i, "") || "";
               const isReqNumeric = !isNaN(Number(reqName));
               let match = null;
                   if (reqId) {
                       match = byDbId.get(String(reqId)) || hashToMod.get(reqId);
                       if (!match) match = modList.find(m => m.interchangeableIds?.includes(String(reqId)));
                   }
               if (!match && !isReqNumeric && reqBaseName) {
                   match = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName) || n.displayNameSpaced.includes(reqBaseName.replace(/_/g, " ")))?.orig;
               }
               return !match;
           });
           if (hasMissing) return true;
        }
        if (mObj.conflicts) {
           const hasFatal = mObj.conflicts.some((c: any) => {
              if (c.severity_rank == 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = modMap.get(n);
                    let isMatch = false;
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) isMatch = true;
                     if (!isMatch && c.enemy_name) {
                        const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase().replace(/_SCRIPT(S)?$/i, "");
                        const cleanN = precomputedBaseNames.get(n) || "";
                        if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) isMatch = true;
                    }
                    
                    if (isMatch && mData && mObj.hash && mData.hash) {
                       if (areArchetypes(mObj.hash, mData.hash)) return false;
                    }
                    
                    return isMatch;
                 });
                 return !!matchStr;
              }
              return false;
           });
           if (hasFatal) return true;
        }
        return false;
      };

      const targetMod = modMap.get(targetName) || modList.find((m: any) => m.name === targetName);
      if (!targetMod) {
         if (forceRemove) {
            const toDelete = Array.from(newMods).find((m: any) => {
                const strM = typeof m === 'string' ? m : (m.name || m.path || '');
                return strM === targetName || stripTierPrefix(strM) === stripTierPrefix(targetName);
            });
            if (toDelete) {
               newMods.delete(toDelete);
               setStatus(`${t("anarchy_intercept", "Conflict Intercept (Severity 4 Collision)")}: ${formatDisplayName(targetName)} ${t("artifact_removed", "Will {Remove}")}.`);
            }
            const updatedSets = [...prevSets];
            updatedSets[activePlaySetIndex] = { ...currentSet, mods: Array.from(newMods) };

            window.dispatchEvent(new Event("storage"));
            console.timeEnd("PlaySetLogic: toggleInActiveSet");
            return updatedSets;
         }
         console.timeEnd("PlaySetLogic: toggleInActiveSet");
         return prevSets;
      }
      const kids = targetMod.isVirtual
        ? modList.filter(
            (m) =>
              (String(m.familyId) === String(targetMod.dbId) ||
                String(m.setId) === String(targetMod.dbId)) &&
              !m.isVirtual
          )
        : [];
      const isActuallyFlavorFolder =
        targetMod.isVirtual && kids.some((k) => k.flavorGroupId != null);
      const cleanSanctuaryPrefix = (n: string) => stripTierPrefix(n);
      const newModsCleaned = new Set(Array.from(newMods).map((mObj: any) => 
          cleanSanctuaryPrefix(typeof mObj === 'string' ? mObj : (mObj.name || mObj.path || ''))
      ));
      const deletedInPass = new Set<string>();

      let isEquipping = targetMod.isVirtual
        ? !kids.some((k) => newModsCleaned.has(cleanSanctuaryPrefix(k.name)))
        : !newModsCleaned.has(cleanSanctuaryPrefix(targetName));
      if (forceRemove) isEquipping = false;
      if (forceActive) isEquipping = true;
      const deepDelete = (nameToDelete: string, shallow: boolean = false) => {
        const toDelete = Array.from(newMods).find((mObj: any) => {
           const strM = typeof mObj === 'string' ? mObj : (mObj.name || mObj.path || '');
           return strM === nameToDelete || stripTierPrefix(strM) === stripTierPrefix(nameToDelete);
        });
        if (!toDelete) return;
        newMods.delete(toDelete);
        deletedInPass.add(nameToDelete);

        const targetClean = precomputedBaseNames.get(nameToDelete) || "";
        if (targetClean) {
           Array.from(newMods).forEach((depObj: any) => {
              const depName = typeof depObj === 'string' ? depObj : (depObj.name || depObj.path || '');
              const depClean = precomputedBaseNames.get(depName) || "";
              if (depClean === targetClean && depName !== nameToDelete) {
                  newMods.delete(depObj);
              }
           });
        }

        const mDataDelete = modMap.get(nameToDelete);
        if (mDataDelete) {
            const matchingSet = localSets.find((s: any) => s.archetypes?.core === mDataDelete.hash);
            if (matchingSet) {
                const isAnyTwinEquipped = matchingSet.archetypes?.twins?.some((tHash: string) => {
                   const tMod = hashToMod.get(tHash);
                   return tMod && newMods.has(tMod.name);
                });
                
                if (!isAnyTwinEquipped) {
                   const children = [...(matchingSet.archetypes?.twins || []), ...(matchingSet.archetypes?.addons || [])];
                   children.forEach((childHash: string) => {
                       const childMod = hashToMod.get(childHash);
                       if (childMod && childMod.name && newMods.has(childMod.name)) {
                           deepDelete(childMod.name, true);
                       }
                   });
                }
            }
        }

        if (!shallow && currentRules.dependencies !== false) {
          const mData = modMap.get(nameToDelete);
          if (mData) {
            const currentEquipped = Array.from(newMods as Set<string>).map(n => modMap.get(n)).filter(Boolean);
            Array.from(newMods as Set<string>).forEach((depName: string) => {
               const dep = modMap.get(depName);
               if (!dep || !dep.requirements) return;
               const dependsOnDeleted = dep.requirements.some((r: any) => {
                  const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                  const reqName = typeof r === 'string' ? r : r.name;
                  const reqBaseName = precomputedBaseNames.get(reqName) || reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase().replace(/_SCRIPT(S)?$/i, "") || "";
                  const isReqNumeric = !isNaN(Number(reqName));
                  return (reqId && String(mData.dbId) === String(reqId)) ||
                         (reqId && mData.hash === reqId) ||
                         (!isReqNumeric && reqBaseName && mData.displayName && (mData.displayName.toUpperCase().includes(reqBaseName) || mData.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
               });
               if (dependsOnDeleted) {
                  const isStillSatisfied = dep.requirements.every((r: any) => {
                      const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                      const reqName = typeof r === 'string' ? r : r.name;
                      const reqBaseName = precomputedBaseNames.get(reqName) || reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase().replace(/_SCRIPT(S)?$/i, "") || "";
                      const isReqNumeric = !isNaN(Number(reqName));
                      
                      return currentEquipped.some((equipped: any) => {
                         return equipped && (
                           String(equipped.dbId) === String(reqId) ||
                           (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                           (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                         );
                      });
                  });
                  if (!isStillSatisfied) deepDelete(depName);
               }
            });
          }
        }
      };
      


      const applyConflicts = (modObj: any) => {
        if (currentRules.highlander !== false) {
          Array.from(newMods as Set<string>).forEach((mName: string) => {
             const m = modMap.get(mName);
             if (m && m.name !== modObj.name) {
                 const isFlavorRival = m.flavorGroupId && String(m.flavorGroupId) === String(modObj.flavorGroupId) && m.relationshipType !== "twin" && modObj.relationshipType !== "twin";
                 const isCommunityRival = m.communityGroupId && String(m.communityGroupId) === String(modObj.communityGroupId);
                 const isBetaRival = ((modObj.relationshipType !== 'beta' && m.relationshipType === 'beta') || (modObj.relationshipType === 'beta' && m.relationshipType !== 'beta')) && (String(m.familyId) === String(modObj.familyId) || String(m.dbId) === String(modObj.familyId || modObj.dbId));
                 
                 if (isFlavorRival || isCommunityRival || isBetaRival) {
                     deepDelete(m.name, true);
                     setStatus(`${t("radar_intercept", "RADAR")}: ${formatDisplayName(modObj.displayName || modObj.name)} ${t("flavor_replaced", "Will Replace")} ${formatDisplayName(m.displayName || m.name)}.`);
                 }
             }
          });
        }
        if (modObj.conflicts && currentRules.intercept !== false) {
           modObj.conflicts.forEach((c: any) => {
              if (c.severity_rank == 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = modMap.get(n);
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                     if (c.enemy_name) {
                        const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase().replace(/_SCRIPT(S)?$/i, "");
                        const cleanN = precomputedBaseNames.get(n) || "";
                        if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                    }
                    return false;
                 });
                 if (matchStr) {
                    const deletedMod = modMap.get(matchStr);
                    deepDelete(matchStr);
                    setStatus(`${t("anarchy_intercept", "Conflict Intercept (Severity 4 Collision)")}: ${formatDisplayName(deletedMod?.displayName || deletedMod?.name || matchStr)} ${t("artifact_removed", "Will {Remove}")} due to collision with ${formatDisplayName(modObj.displayName || modObj.name)}.`);
                 }
              }
           });
        }
      };
      
      const addWithFamily = (modObj: any) => {
        if (!modObj || !modObj.name) return;
        if (excludeBroken && (modObj.status === t("status_corrupted", "Corrupted") || modObj.status?.includes("BROKEN") || checkGhosted(modObj))) {
          setStatus(t("critical_action", "CRITICAL ACTION REQUIRED: Fatal conflicts require resolution before deployment"));
          return;
        }
        newMods.add(modObj.name);
        applyConflicts(modObj);
        
        Array.from(newMods as Set<string>).forEach((activeName: string) => {
            if (activeName === modObj.name) return;
            const activeM = modMap.get(activeName);
            if (activeM && activeM.conflicts && currentRules.intercept !== false) {
                activeM.conflicts.forEach((c: any) => {
                    if (c.severity_rank == 4) {
                        let isReverseMatch = false;
                        if (c.enemy_id && String(modObj.dbId) === String(c.enemy_id)) isReverseMatch = true;
                        if (c.enemy_name) {
                            const targetClean = c.enemy_name.replace(/\.[^/.]+$/i, "").toUpperCase().replace(/_SCRIPT(S)?$/i, "");
                            const cleanN = precomputedBaseNames.get(modObj.name) || "";
                            if (cleanN === targetClean || modObj.displayName?.toUpperCase() === targetClean) isReverseMatch = true;
                        }
                        if (isReverseMatch) {
                            deepDelete(activeName);
                            setStatus(`${t("anarchy_intercept", "Conflict Intercept (Severity 4 Collision)")}: ${formatDisplayName(activeM.displayName || activeM.name)} ${t("artifact_removed", "Will {Remove}")} due to collision with ${formatDisplayName(modObj.displayName || modObj.name)}.`);
                        }
                    }
                });
            }
        });
        

        
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
          
          if ((anchor && currentRules.family !== false && (String(m.familyId) === String(anchor) || String(m.dbId) === String(anchor))) || isTwinMatch) {
            if (m.name && !m.isVirtual) {
              const objV = modObj.version;
              const mV = m.version;
              const sharesVersion = !objV || !mV || objV === "v.Local" || mV === "v.Local" || objV === mV;
              if (!sharesVersion && !isTwinMatch) return;

              const isRival =
                (m.flavorGroupId &&
                String(m.flavorGroupId) === String(modObj.flavorGroupId) &&
                m.name !== modObj.name) ||
                (m.communityGroupId &&
                String(m.communityGroupId) === String(modObj.communityGroupId) &&
                m.name !== modObj.name);
                
              const isAddonOfTarget = m.hash && modObj.hash ? localSets.some((s: any) => 
                (s.archetypes?.core === modObj.hash || s.archetypes?.twins?.includes(modObj.hash)) && 
                s.archetypes?.addons?.includes(m.hash)
              ) : false;
                
              if (
                !isRival && !isAddonOfTarget &&
                (m.relationshipType === "twin" ||
                  m.relationshipType === "beta" ||
                  m.relationshipType === "core" ||
                  !m.relationshipType || isTwinMatch)
              ) {
                if (!(excludeBroken && (m.status === t("status_corrupted", "Corrupted") || m.status?.includes("BROKEN") || checkGhosted(m)))) {
                  if (!deletedInPass.has(m.name)) {
                     applyConflicts(m);
                     newMods.add(m.name);
                  }
                }
              }
            }
          }
        });
      };
      if (isEquipping) {
        if (targetMod.isVirtual) {
          let validKids = kids;
          if (excludeBroken) {
            validKids = kids.filter((k) => {
              if (k.status === t("status_corrupted", "Corrupted") || k.status?.includes("BROKEN") || checkGhosted(k)) {
                return false;
              }
              return true;
            });
          }
          if (isActuallyFlavorFolder) {
            const coreFiles = validKids.filter((k) => k.flavorGroupId == null);
            const flavorFiles = validKids.filter((k) => k.flavorGroupId != null);
            coreFiles.forEach((k) => addWithFamily(k));
            const groups = new Map<string, any[]>();
            flavorFiles.forEach((f) => {
              const gid = String(f.flavorGroupId);
              if (!groups.has(gid)) groups.set(gid, []);
              groups.get(gid)!.push(f);
            });
            groups.forEach((groupKids) => {
              if (
                !groupKids.some((f) => newMods.has(f.name)) &&
                groupKids.length > 0
              ) {
                const sortedKids = [...groupKids].sort((a: any, b: any) => {
                  const getRank = (m: any) => {
                    if (m.relationshipType === 'core') return 1;
                    if (m.relationshipType === 'twin') return 2;
                    if (m.relationshipType === 'beta') return 3;
                    if (!m.relationshipType) return 4;
                    return 5;
                  };
                  return getRank(a) - getRank(b);
                });
                addWithFamily(sortedKids[0]);
              }
            });
          } else {
            validKids.forEach((k) => addWithFamily(k));
          }
        } else {
          addWithFamily(targetMod);
        }
        if (currentRules.dependencies !== false) {
          let checkAgain = true;
          while (checkAgain) {
            checkAgain = false;
            const snapshot = Array.from(newMods);
            const currentEquipped = snapshot.map(n => modMap.get(n)).filter(Boolean);
            for (const name of snapshot) {
              if (!newMods.has(name)) continue;
              const mData = modMap.get(name as string);
              if (mData?.requirements) {
                for (const req of mData.requirements) {
                  const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                  const reqName = typeof req === 'string' ? req : req.name;
                  const reqBaseName = precomputedBaseNames.get(reqName) || reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase().replace(/_SCRIPT(S)?$/i, "") || "";
                  const isReqNumeric = !isNaN(Number(reqName));
                  
                  const alreadySatisfied = currentEquipped.some((equipped: any) => {
                    return equipped && (
                      String(equipped.dbId) === String(reqId) ||
                      (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                      (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                    );
                  });
                  if (!alreadySatisfied) {
                    let provider = null;
                    if (reqId) {
                        provider = byDbId.get(String(reqId)) || hashToMod.get(reqId);
                        if (!provider) provider = modList.find((m: any) => m.interchangeableIds?.includes(String(reqId)));
                    }
                    if (!provider && !isReqNumeric && reqBaseName) {
                        provider = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName))?.orig;
                    }
                    if (provider && !deletedInPass.has(typeof provider === 'string' ? provider : provider.name)) {
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
        }
      } else {
        const familyAnchor = targetMod.familyId || targetMod.dbId;
        const isMaster =
          targetMod.dbId && String(targetMod.dbId) === String(familyAnchor);
        const isArchetypeMember = localSets.some((s: any) => 
           s.archetypes?.core === targetMod.hash || s.archetypes?.twins?.includes(targetMod.hash)
        );

        if (
          targetMod.isVirtual ||
          (currentRules.family !== false &&
            (isMaster ||
              targetMod.relationshipType === "core" || isArchetypeMember))
        ) {
          modList
            .filter(
              (m) =>
                (String(m.familyId) === String(familyAnchor) ||
                  String(m.dbId) === String(familyAnchor) ||
                  String(m.setId) === String(targetMod.dbId)) &&
                m.name &&
                !m.isVirtual,
            )
            .forEach((m) => deepDelete(m.name));
        } else {
          deepDelete(targetName);
        }
        if (forceRemove) {
           setStatus(`${t("anarchy_intercept", "Conflict Intercept (Severity 4 Collision)")}: ${formatDisplayName(targetMod.displayName || targetMod.name)} ${t("artifact_removed", "Will {Remove}")}.`);
        }
      }
      const updatedSets = [...prevSets];
      
      const nextModHashes: Record<string, string> = {};
      Array.from(newMods as Set<string>).forEach((mName: string) => {
         const mData = modMap.get(mName);
         if (mData && mData.hash) {
             nextModHashes[mName] = mData.hash;
         } else if (currentSet.modHashes && currentSet.modHashes[mName]) {
             nextModHashes[mName] = currentSet.modHashes[mName];
         }
      });

      updatedSets[activePlaySetIndex] = {
        ...currentSet,
        mods: Array.from(newMods),
        modHashes: nextModHashes,
        modMeta: currentSet.modMeta
      };


      console.timeEnd("PlaySetLogic: toggleInActiveSet");
      return updatedSets;
    });
  }, [setPlaySets, activePlaySetIndex, anarchyRules, activeGameSchema, modMap, hashToMod, baseToMod, byDbId, byFamilyOrDbId, byParsedBaseName, namesAndDisplayNames, precomputedBaseNames, modList]);

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
      let localOverridesDirty = false;
      try {
        localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch {}

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
              const extractedMeta: Record<string, any> = {};
              const metaKeys = [
                'displayName', 'url', 'manifest_url', 'author', 'version',
                'description', 'image_url', 'category_override', 'sub_type',
                'file_extension', 'requiredDLC', 'compatible_versions',
                'compliance_tier', 'allow_write', 'is_paid', 'is_early_access',
                'created_at', 'updated_at', 'requirements', 'twins', 'conflicts', 'isLocalOverride'
              ];
              metaKeys.forEach((k) => {
                if (importedMod[k] !== undefined && importedMod[k] !== "") {
                  extractedMeta[k] = importedMod[k];
                }
              });
              const metaKey = found ? found.name : rawNameToCheck;
              if (metaKey && Object.keys(extractedMeta).length > 0) {
                nextModMeta[metaKey] = extractedMeta;
              }
              if (targetHash && (importedMod.isLocalOverride || importedMod.displayName || importedMod.manifest_url || importedMod.description)) {
                const existingOvr = localOverrides[targetHash];
                if (!existingOvr?.is_user_dossier) {
                  localOverrides[targetHash] = {
                    ...(existingOvr || {}),
                    ...extractedMeta,
                    displayName: existingOvr?.displayName || extractedMeta.displayName,
                    author: existingOvr?.author || extractedMeta.author,
                    version: existingOvr?.version || extractedMeta.version,
                    url: existingOvr?.url || extractedMeta.url,
                    manifest_url: existingOvr?.manifest_url || extractedMeta.manifest_url,
                  };
                  localOverridesDirty = true;
                }
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
        } catch {}
      }

      const { loadRules, modTiers, loadOrder, formatModWithTier } = unpackBlueprintLoadOrder(
        parsed,
        nameRemap,
        activeGameSchema
      );
      const availableMods = rawAvailableMods.map((mName) => formatModWithTier(mName));

      let baseName = `${parsed.name} (Imported)`;
      let newName = baseName;
      let counter = 1;
      while(
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

  async function equipPlaySet(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    setStatus(
      `${t("status_deploying_prefix", "DEPLOYING: {Blueprint} [")}${setName}${t("status_deploying_suffix", "]...")}`,
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
                 try { parsedStructure = JSON.parse(parsedStructure); } catch (e) {}
            }
            if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
                 buildPathMap(parsedStructure, "");
            }
        });

        targetSet.mods.forEach((rawMod: any) => {
            const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
            if (!modName) return;

            let modObj = modMap.get(modName);
            if (!modObj) {
                const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
                if (targetBase) modObj = modBaseMap.get(targetBase);
            }
            
            const flatFileName = modName.split(/[\\/]/).pop() || modName;
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
            
            deployPayload.push({ path: modName, allow_write: modObj?.allow_write || false, target_path: targetPath });
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
      const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });
      setActiveSetName(setName);
      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`, setName);
      
      const newIndex = playSets.findIndex((s) => s.name === setName);
      if (newIndex !== -1 && setActivePlaySetIndex) {
        setActivePlaySetIndex(newIndex);
      }
      setStatus(`${t("icon_check_circle", "check_circle")} ${t("btn_deployed", "DEPLOYED")} ${msg as string} ${t("backend_deployed_suffix", "{mods}.")} `);
      precomputeBlueprintConflicts(setName, targetSet.mods, config.vault_path).catch(() => {});
    } catch (err) {
      setStatus(`${t("status_deploy_failed", "Deployment Failed:")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
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

      if (modMap.has(modName)) {
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

  const applyConflictOverride = (
    winnerName: string,
    modPair: string,
    currentScopeName: string,
    targetTierFolder?: string,
    loserName?: string
  ) => {
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

          if (index !== -1) {
            const strM = typeof newMods[index] === "string" ? newMods[index] : newMods[index].name || newMods[index].path || "";
            const segs = strM.replace(/\\/g, "/").split("/");
            if (segs.length > 1 && knownFoldersLower.has(segs[0].toLowerCase())) {
              segs.shift();
            }
            const baseRel = segs.join("/");
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
          if (cleanWinnerFile) {
            nextModTiers[cleanWinnerFile] = firstOverrideTier;
          }

          let nextLoadRules: LoadOrderRule[] = Array.isArray(currentSet.loadRules) ? [...currentSet.loadRules] : [];
          const resolvedLoser =
            loserName ||
            (modPair && modPair.includes("::")
              ? modPair
                  .split("::")
                  .find((part) => !cleanWinner.includes(part.toLowerCase()) && !part.toLowerCase().includes(cleanWinner))
              : undefined);
          if (cleanWinnerFile && resolvedLoser) {
            const cleanLoserFile = resolvedLoser.split(/[\\/]/).pop() || resolvedLoser;
            const wLow = cleanWinnerFile.toLowerCase();
            const lLow = cleanLoserFile.toLowerCase();
            nextLoadRules = nextLoadRules.filter(
              (r) =>
                !(
                  (r.modA.toLowerCase() === wLow && r.modB.toLowerCase() === lLow) ||
                  (r.modA.toLowerCase() === lLow && r.modB.toLowerCase() === wLow)
                )
            );
            nextLoadRules.push({
              id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              modA: cleanWinnerFile,
              modB: cleanLoserFile,
              type: "after",
            });
          }

          currentSet.mods = newMods;
          currentSet.modTiers = nextModTiers;
          currentSet.loadRules = nextLoadRules;
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
  };

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

        currentSet.mods = nextMods;
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
