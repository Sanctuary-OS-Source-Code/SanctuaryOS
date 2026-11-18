import { useStore } from "../store";

export interface ResolveComplianceHashTiersOptions {
  forceRefresh?: boolean;
  workspaceId?: string;
}

const STORAGE_KEY_PREFIX = "sanctuary_restricted_hash_tiers_";
const workspaceCacheMap = new Map<string, Map<string, number>>();
const resolvedHashesByWs = new Map<string, Set<string>>();

let eventsBound = false;

function getEffectiveWorkspaceId(workspaceId?: string): string {
  if (workspaceId && String(workspaceId).trim()) return String(workspaceId).trim();
  try {
    return String(useStore.getState().activeWorkspaceId || "default_workspace").trim() || "default_workspace";
  } catch {
    return "default_workspace";
  }
}

export function normalizeComplianceHash(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const clean = raw.trim().toLowerCase();
  if (
    !clean ||
    clean.startsWith("virtual_") ||
    clean.startsWith("set_") ||
    clean.startsWith("local_set_") ||
    clean.startsWith("folder_")
  ) {
    return "";
  }
  return clean;
}

function getOrLoadWorkspaceCache(wsId: string): Map<string, number> {
  const existing = workspaceCacheMap.get(wsId);
  if (existing) return existing;

  const map = new Map<string, number>();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          const hash = normalizeComplianceHash(k);
          const tier = Number(v);
          if (hash && Number.isFinite(tier) && tier >= 1 && tier <= 6) {
            map.set(hash, tier);
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  workspaceCacheMap.set(wsId, map);
  return map;
}

function persistWorkspaceCache(wsId: string, cache: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {};
    cache.forEach((tier, hash) => {
      if (tier >= 1 && tier <= 6) obj[hash] = tier;
    });
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${wsId}`, JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

function ensureEventsBound(): void {
  if (eventsBound || typeof window === "undefined") return;
  eventsBound = true;
  const clearChecked = () => {
    resolvedHashesByWs.clear();
  };
  window.addEventListener("sanctuary-compliance-updated", clearChecked);
  window.addEventListener("sanctuary-content-flagged", clearChecked);
}

/**
 * Returns a snapshot Map of lowercased SHA-256 hashes known to carry Compliance Tier 1-5.
 */
export function getCachedComplianceHashTiers(workspaceId?: string): Map<string, number> {
  ensureEventsBound();
  const wsId = getEffectiveWorkspaceId(workspaceId);
  return new Map(getOrLoadWorkspaceCache(wsId));
}

/**
 * Resolves exact Compliance Tier numbers (1-5) for caller-possessed SHA-256 hashes
 * via the privacy-preserving `get_compliance_hash_tiers` RPC without exposing restricted metadata.
 */
export async function resolveComplianceHashTiers(
  supabaseClient: any,
  rawHashes: Iterable<string | null | undefined>,
  options: ResolveComplianceHashTiersOptions = {}
): Promise<Map<string, number>> {
  ensureEventsBound();
  const wsId = getEffectiveWorkspaceId(options.workspaceId);
  const cache = getOrLoadWorkspaceCache(wsId);
  let checkedSet = resolvedHashesByWs.get(wsId);
  if (!checkedSet) {
    checkedSet = new Set<string>();
    resolvedHashesByWs.set(wsId, checkedSet);
  }

  const normalizedSet = new Set<string>();
  for (const raw of rawHashes) {
    const clean = normalizeComplianceHash(raw);
    if (clean) normalizedSet.add(clean);
  }

  if (normalizedSet.size === 0 || !supabaseClient || typeof supabaseClient.rpc !== "function") {
    return new Map(cache);
  }

  const hashesToQuery: string[] = [];
  normalizedSet.forEach((hash) => {
    if (options.forceRefresh || !checkedSet!.has(hash)) {
      hashesToQuery.push(hash);
    }
  });

  if (hashesToQuery.length === 0) {
    return new Map(cache);
  }

  const CHUNK_SIZE = 250;
  const chunks: string[][] = [];
  for (let i = 0; i < hashesToQuery.length; i += CHUNK_SIZE) {
    chunks.push(hashesToQuery.slice(i, i + CHUNK_SIZE));
  }

  let cacheMutated = false;
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const { data, error } = await supabaseClient.rpc("get_compliance_hash_tiers", {
          p_hashes: chunk,
        });
        if (error) {
          console.warn("Compliance hash tier lookup failed:", error);
          return;
        }
        for (const h of chunk) {
          if (cache.delete(h)) cacheMutated = true;
          checkedSet!.add(h);
        }
        if (Array.isArray(data)) {
          for (const row of data) {
            const hash = normalizeComplianceHash(row?.dna_hash);
            const tier = Number(row?.compliance_tier ?? 0);
            if (hash && Number.isFinite(tier) && tier >= 1 && tier <= 6) {
              cache.set(hash, tier);
              cacheMutated = true;
            }
          }
        }
      } catch (err) {
        console.warn("Compliance hash tier lookup exception:", err);
      }
    })
  );

  if (cacheMutated) {
    persistWorkspaceCache(wsId, cache);
  }

  return new Map(cache);
}

/**
 * Resolves the effective compliance tier (0-5, or -1 if unknown) for a local/blueprint artifact
 * by merging explicit metadata, flavor members, and cached/RPC hash-tier lookups.
 */
export function resolveEffectiveModComplianceTier(
  mod: any,
  hashTierMap?: Map<string, number>,
  fallbackHash?: string
): number {
  const effectiveMap = hashTierMap || getCachedComplianceHashTiers();
  if (mod?.isVirtual && Array.isArray(mod.flavors) && mod.flavors.length > 0) {
    let maxTier = -1;
    for (const fl of mod.flavors) {
      const flTier = resolveEffectiveModComplianceTier(fl, effectiveMap);
      if (flTier > maxTier) maxTier = flTier;
    }
    return maxTier;
  }

  const hash = normalizeComplianceHash(mod?.hash || mod?.dna_hash || fallbackHash);
  const rpcTier = hash ? effectiveMap.get(hash) : undefined;
  if (typeof rpcTier === "number" && rpcTier >= 1 && rpcTier <= 6) {
    return rpcTier;
  }

  const explicitTier =
    typeof mod?.compliance_tier === "number"
      ? mod.compliance_tier
      : typeof mod?.tier === "number"
        ? mod.tier
        : -1;
  return Number.isFinite(explicitTier) ? explicitTier : -1;
}

/**
 * Collects all normalized SHA-256 hashes from a Vault modList and/or Blueprint metadata maps.
 */
export function collectComplianceLookupHashes(sources: {
  modList?: any[];
  playSet?: any;
  extraMods?: any[];
}): string[] {
  const hashes = new Set<string>();
  const addHash = (raw: unknown) => {
    const clean = normalizeComplianceHash(raw);
    if (clean) hashes.add(clean);
  };

  if (Array.isArray(sources.modList)) {
    for (const m of sources.modList) {
      if (!m) continue;
      addHash(m.hash || m.dna_hash);
      if (Array.isArray(m.flavors)) {
        for (const fl of m.flavors) {
          addHash(fl?.hash || fl?.dna_hash);
        }
      }
    }
  }

  const ps = sources.playSet;
  if (ps) {
    if (ps.modHashes && typeof ps.modHashes === "object") {
      for (const h of Object.values(ps.modHashes)) addHash(h);
    }
    if (Array.isArray(ps.mods)) {
      for (const rm of ps.mods) {
        if (rm && typeof rm === "object") addHash(rm.hash || rm.dna_hash);
      }
    }
  }

  if (Array.isArray(sources.extraMods)) {
    for (const em of sources.extraMods) {
      if (!em) continue;
      addHash(em.hash || em.dna_hash);
      if (Array.isArray(em._groupedMods)) {
        for (const gm of em._groupedMods) addHash(gm?.hash || gm?.dna_hash);
      }
    }
  }

  return Array.from(hashes);
}

