import { auditBlueprintsTier0Compliance } from "../side-panels/NexusSidePanels";

export const NEXUS_CACHE_SCHEMA_REV = 5;

export const NEXUS_ELIGIBLE_MOD_STATUSES = [
  "stable",
  "verified",
  "unstable",
  "broken",
  "corrupted",
] as const;

export interface NexusCatalogSummary {
  artifacts: number;
  blueprints: number;
  lexicons: number;
  chameleons: number;
  templates: number;
  total: number;
}

const RELATION_TYPES = ["twin", "addon", "flavor", "set_item", "beta"];

export function isNexusTier0EligibleMod(rawMod: any): boolean {
  if (!rawMod) return false;
  if (Number(rawMod.compliance_tier ?? -1) !== 0) return false;
  if (rawMod.has_pending_flag === true) return false;
  if (String(rawMod.name || "").toLowerCase().includes("manual flag")) return false;
  const st = String(rawMod.status || "").toLowerCase().trim();
  return (NEXUS_ELIGIBLE_MOD_STATUSES as readonly string[]).includes(st);
}

/**
 * Counts unique Nexus Tier 0 Artifacts after applying parent/twin/flavor family grouping,
 * active Tier 0 Collections grouping, and normalized-name deduplication.
 */
export function countGroupedNexusTier0Artifacts(
  modsData: any[],
  relationships: any[] = [],
  collections: any[] = [],
  collectionMembers: any[] = []
): number {
  const modsById = new Map<string, any>();
  for (const rawMod of modsData || []) {
    if (!isNexusTier0EligibleMod(rawMod)) continue;
    const strId = String(rawMod.id || "").trim();
    if (strId) modsById.set(strId, rawMod);
  }

  const allItems: any[] = [];
  const familyMap = new Map<string, Set<string>>();
  const processedMods = new Set<string>();

  if (Array.isArray(relationships) && relationships.length > 0) {
    const parentRelsByChild = new Map<string, any[]>();
    for (const rel of relationships) {
      const parentId = String(rel?.parent_id || "");
      const childId = String(rel?.child_id || "");
      if (!modsById.has(parentId) || !modsById.has(childId)) continue;
      if (!parentRelsByChild.has(childId)) parentRelsByChild.set(childId, []);
      parentRelsByChild.get(childId)!.push(rel);
    }

    const resolveRootParentId = (startId: string): string => {
      let cur = startId;
      let hops = 0;
      while (hops < 5) {
        const rels = parentRelsByChild.get(cur) || [];
        const nextRel =
          rels.find((r: any) => r.relationship_type === "addon") ||
          rels.find((r: any) => r.relationship_type === "set_item") ||
          rels.find((r: any) => r.relationship_type === "twin") ||
          rels.find((r: any) => r.relationship_type === "beta") ||
          rels[0];
        if (nextRel && String(nextRel.parent_id) !== cur && modsById.has(String(nextRel.parent_id))) {
          cur = String(nextRel.parent_id);
          hops++;
        } else {
          break;
        }
      }
      return cur;
    };

    for (const rel of relationships) {
      const rawParentId = String(rel?.parent_id || "");
      const childId = String(rel?.child_id || "");
      if (modsById.has(rawParentId) && modsById.has(childId)) {
        const rootParentId = resolveRootParentId(rawParentId);
        if (!familyMap.has(rootParentId)) {
          familyMap.set(rootParentId, new Set([rootParentId]));
        }
        familyMap.get(rootParentId)!.add(rawParentId);
        familyMap.get(rootParentId)!.add(childId);
      }
    }

    familyMap.forEach((memberIds, parentId) => {
      if (memberIds.size <= 1) return;
      const rawMembers = Array.from(memberIds)
        .map((id) => modsById.get(id))
        .filter(Boolean);
      const seenMemberKeys = new Set<string>();
      const members = rawMembers.filter((m: any) => {
        const normName = String(m?.name || "").trim().toLowerCase();
        if (!normName) return false;
        const ext = String(m?.file_extension || "").trim().toLowerCase();
        const memberKey = `${normName}::${ext || m?.id}`;
        if (seenMemberKeys.has(memberKey)) return false;
        seenMemberKeys.add(memberKey);
        return true;
      });
      const parentMod = modsById.get(parentId);
      const isValidName =
        parentMod?.name &&
        !String(parentMod.name).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      if (members.length > 1 && parentMod && isValidName) {
        allItems.push({
          ...parentMod,
          isVirtual: true,
          isParent: true,
        });
        memberIds.forEach((id) => processedMods.add(id));
      }
    });
  }

  if (Array.isArray(collections) && collections.length > 0) {
    const membersBySet = new Map<string, any[]>();
    for (const sm of collectionMembers || []) {
      const sid = String(sm?.set_id || "");
      if (!sid) continue;
      if (!membersBySet.has(sid)) membersBySet.set(sid, []);
      membersBySet.get(sid)!.push(sm);
    }

    for (const set of collections) {
      if (!set || Number(set.compliance_tier ?? 0) !== 0 || set.has_pending_flag === true) {
        continue;
      }
      const sid = String(set.id || "");
      const setMembers = membersBySet.get(sid) || [];
      const members = setMembers
        .map((sm: any) => modsById.get(String(sm.mod_id)))
        .filter(Boolean);
      if (members.length > 0) {
        for (const m of members) {
          processedMods.add(String(m.id));
        }
        allItems.push({
          id: `collection_${set.id}`,
          name: set.name,
          isVirtual: true,
          isParent: true,
        });
      }
    }
  }

  modsById.forEach((mod, id) => {
    if (!processedMods.has(id)) {
      allItems.push(mod);
    }
  });

  const nameMap = new Map<string, any>();
  for (const item of allItems) {
    const key = String(item?.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!key) continue;
    const existing = nameMap.get(key);
    if (!existing) {
      nameMap.set(key, item);
    } else {
      const existingParent = Boolean(existing.isVirtual || existing.isParent);
      const itemParent = Boolean(item.isVirtual || item.isParent);
      if (existingParent && itemParent) continue;
      if (itemParent && !existingParent) {
        nameMap.set(key, item);
      }
    }
  }

  return nameMap.size;
}

let inFlightSummaryPromise: Promise<NexusCatalogSummary> | null = null;

/**
 * Fetches accurate Tier 0 grouped Nexus catalog counts shared 1:1 between CommandCenter and Nexus.
 */
export async function fetchNexusTier0CatalogSummary(
  supabaseClient: any,
  options: { forceRefresh?: boolean } = {}
): Promise<NexusCatalogSummary> {
  const nexusCache = typeof window !== "undefined" ? (window as any).__sanctuaryCache?.nexus : null;
  if (
    !options.forceRefresh &&
    nexusCache &&
    nexusCache.schemaRev === NEXUS_CACHE_SCHEMA_REV &&
    nexusCache.homeStats &&
    Array.isArray(nexusCache.nexusItems) &&
    Array.isArray(nexusCache.assetResultsMap?.BLUEPRINTS)
  ) {
    const artifacts = nexusCache.nexusItems.length;
    const blueprints = nexusCache.assetResultsMap.BLUEPRINTS.length;
    const lexicons = (nexusCache.assetResultsMap.LEXICONS || []).length;
    const chameleons = (nexusCache.assetResultsMap.CHAMELEONS || []).length;
    const templates = (nexusCache.assetResultsMap.TEMPLATES || []).length;
    const total = artifacts + blueprints + lexicons + chameleons + templates;
    return { artifacts, blueprints, lexicons, chameleons, templates, total };
  }

  if (inFlightSummaryPromise && !options.forceRefresh) {
    return inFlightSummaryPromise;
  }

  inFlightSummaryPromise = (async (): Promise<NexusCatalogSummary> => {
    const BATCH_SIZE = 1000;
    const selectCols = "id, name, file_extension, compliance_tier, has_pending_flag, status";

    const [
      firstModsRes,
      relationshipsRes,
      collectionsRes,
      setMembersRes,
      blueprintsRes,
      assetsRes,
    ] = await Promise.all([
      supabaseClient
        .from("mods")
        .select(selectCols, { count: "exact" })
        .eq("compliance_tier", 0)
        .eq("has_pending_flag", false)
        .in("status", [...NEXUS_ELIGIBLE_MOD_STATUSES])
        .range(0, BATCH_SIZE - 1),
      supabaseClient
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", RELATION_TYPES),
      supabaseClient
        .from("collections")
        .select("id, name, compliance_tier, has_pending_flag"),
      supabaseClient
        .from("collection_members")
        .select("set_id, mod_id"),
      supabaseClient
        .from("blueprints")
        .select("*")
        .eq("is_public", true)
        .eq("is_market_listed", true)
        .eq("compliance_tier", 0)
        .eq("has_pending_flag", false)
        .limit(1000),
      supabaseClient
        .from("nexus_assets")
        .select("id, asset_type, is_public, has_pending_flag")
        .eq("has_pending_flag", false)
        .or("is_public.eq.true,is_public.is.null")
        .limit(1000),
    ]);

    if (firstModsRes.error) throw firstModsRes.error;

    let allMods: any[] = firstModsRes.data || [];
    const totalModsCount = firstModsRes.count || allMods.length;
    const pages = Math.ceil(totalModsCount / BATCH_SIZE);
    if (pages > 1) {
      const pagePromises = [];
      for (let i = 1; i < pages; i++) {
        pagePromises.push(
          supabaseClient
            .from("mods")
            .select(selectCols)
            .eq("compliance_tier", 0)
            .eq("has_pending_flag", false)
            .in("status", [...NEXUS_ELIGIBLE_MOD_STATUSES])
            .range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
        );
      }
      const pageResponses = await Promise.all(pagePromises);
      for (const res of pageResponses) {
        if (res.error) throw res.error;
        if (Array.isArray(res.data)) allMods = allMods.concat(res.data);
      }
    }

    const cachedItems =
      nexusCache?.schemaRev === NEXUS_CACHE_SCHEMA_REV && Array.isArray(nexusCache?.nexusItems)
        ? nexusCache.nexusItems
        : null;

    const artifacts = cachedItems
      ? cachedItems.length
      : countGroupedNexusTier0Artifacts(
          allMods,
          relationshipsRes.data || [],
          collectionsRes.data || [],
          setMembersRes.data || []
        );

    const eligibleBps = (blueprintsRes.data || []).filter(
      (b: any) =>
        b &&
        b.has_pending_flag !== true &&
        Number(b.compliance_tier ?? -1) === 0 &&
        b.is_public !== false &&
        b.is_market_listed === true
    );

    let blueprints = eligibleBps.length;
    if (eligibleBps.length > 0) {
      try {
        const auditMap = await auditBlueprintsTier0Compliance(supabaseClient, eligibleBps, {
          autoFlagInDb: false,
        });
        blueprints = eligibleBps.filter((b: any) => {
          const audit = auditMap.get(b.id);
          return !audit || audit.isCompliant;
        }).length;
      } catch {
        blueprints = eligibleBps.length;
      }
    }

    const publicAssets = (assetsRes.data || []).filter(
      (a: any) => a && a.has_pending_flag !== true && a.is_public !== false
    );
    const lexicons = publicAssets.filter((a: any) => a.asset_type === "lexicon").length;
    const chameleons = publicAssets.filter((a: any) => a.asset_type === "chameleon").length;
    const templates = publicAssets.filter((a: any) => a.asset_type === "workbench_template").length;

    const summary: NexusCatalogSummary = {
      artifacts,
      blueprints,
      lexicons,
      chameleons,
      templates,
      total: artifacts + blueprints + lexicons + chameleons + templates,
    };

    if (typeof window !== "undefined") {
      if (!(window as any).__sanctuaryCache) (window as any).__sanctuaryCache = {};
      if (!(window as any).__sanctuaryCache.nexus) (window as any).__sanctuaryCache.nexus = {};
      (window as any).__sanctuaryCache.nexus.schemaRev = NEXUS_CACHE_SCHEMA_REV;
      (window as any).__sanctuaryCache.nexus.homeStats = {
        artifacts: summary.artifacts,
        blueprints: summary.blueprints,
        lexicons: summary.lexicons,
        chameleons: summary.chameleons,
        templates: summary.templates,
      };
    }

    return summary;
  })();

  try {
    return await inFlightSummaryPromise;
  } finally {
    inFlightSummaryPromise = null;
  }
}

