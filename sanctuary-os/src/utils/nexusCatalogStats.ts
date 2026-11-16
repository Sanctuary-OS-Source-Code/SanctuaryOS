import { toHighlanderSlotSlug, formatHighlanderSlotLabel } from "../shared";
import { auditBlueprintsTier0Compliance } from "../side-panels/NexusSidePanels";

export const NEXUS_CACHE_SCHEMA_REV = 6;
export const NEXUS_CACHE_TTL_MS = 1000 * 60 * 15;

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

export interface BuildGroupedNexusArtifactsParams {
  modsData: any[];
  relationships?: any[];
  collections?: any[];
  collectionMembers?: any[];
  flavorGroups?: any[];
  flavorGroupMembers?: any[];
  verifiedMap?: Record<string, boolean>;
}

const RELATION_TYPES = ["twin", "addon", "flavor", "set_item", "beta"];
const UUID_NAME_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_AUTHOR_VALUES = new Set([
  "",
  "unknown",
  "unknown creator",
  "unidentified",
  "local",
  "local node",
]);
const UNKNOWN_OR_UNVERIFIED_STATUSES = new Set([
  "unknown",
  "unverified",
  "local",
]);

export function isStrictTier0Value(val: unknown): boolean {
  if (typeof val === "number") return Number.isFinite(val) && val === 0;
  if (typeof val === "string") return val.trim() === "0";
  return false;
}

export function isUnknownOrUnverifiedModStatus(status: unknown): boolean {
  if (!status) return true;
  return UNKNOWN_OR_UNVERIFIED_STATUSES.has(
    String(status).toLowerCase().trim()
  );
}

export function isNexusTier0EligibleMod(rawMod: any): boolean {
  if (!rawMod || typeof rawMod !== "object") return false;
  if (!isStrictTier0Value(rawMod.compliance_tier)) return false;
  if (rawMod.has_pending_flag === true) return false;

  const rawName = String(rawMod.name || "").trim();
  if (!rawName || UUID_NAME_REGEX.test(rawName)) return false;
  const lowerName = rawName.toLowerCase();
  if (
    lowerName.includes("manual flag") ||
    lowerName.includes("unindexed flagged")
  ) {
    return false;
  }

  if (String(rawMod.hash || "").startsWith("dev_sandbox_")) return false;

  if (!rawMod.mason_id) {
    const authorNorm = String(rawMod.master_author || "")
      .trim()
      .toLowerCase();
    if (UNKNOWN_AUTHOR_VALUES.has(authorNorm)) return false;
  }

  const st = String(rawMod.status || "").toLowerCase().trim();
  return (NEXUS_ELIGIBLE_MOD_STATUSES as readonly string[]).includes(st);
}

/**
 * Removes child mods whose family parent is missing/ineligible (e.g., Tier 1-5, unknown, or flagged),
 * then prunes standalone mods whose hydrated mod_versions array contains zero non-empty dna_hashes.
 */
export function pruneModsWithIneligibleAncestors(
  modsById: Map<string, any>,
  relationships: any[] = []
): void {
  if (modsById.size === 0) return;

  const validRels = (relationships || []).filter((rel: any) =>
    RELATION_TYPES.includes(String(rel?.relationship_type || ""))
  );

  for (let pass = 0; pass < 8; pass++) {
    let removedAny = false;
    for (const rel of validRels) {
      const parentId = String(rel?.parent_id || "");
      const childId = String(rel?.child_id || "");
      if (!childId || !parentId || parentId === childId) continue;
      if (modsById.has(childId) && !modsById.has(parentId)) {
        modsById.delete(childId);
        removedAny = true;
      }
    }
    if (!removedAny) break;
  }

  const parentIdsWithRemainingChildren = new Set<string>();
  for (const rel of validRels) {
    const parentId = String(rel?.parent_id || "");
    const childId = String(rel?.child_id || "");
    if (
      parentId &&
      childId &&
      parentId !== childId &&
      modsById.has(parentId) &&
      modsById.has(childId)
    ) {
      parentIdsWithRemainingChildren.add(parentId);
    }
  }

  for (const [id, mod] of Array.from(modsById.entries())) {
    if (parentIdsWithRemainingChildren.has(id)) continue;
    if (Array.isArray(mod?.mod_versions)) {
      const hasValidHash = mod.mod_versions.some((v: any) =>
        Boolean(String(v?.dna_hash || "").trim())
      );
      if (!hasValidHash) {
        modsById.delete(id);
      }
    }
  }
}

/**
 * Builds deduplicated, family/collection-grouped Tier 0 Nexus Artifacts shared 1:1
 * between CommandCenter summary counters and the Nexus catalog browser.
 */
export function buildGroupedNexusTier0Artifacts({
  modsData,
  relationships = [],
  collections = [],
  collectionMembers = [],
  flavorGroups = [],
  flavorGroupMembers = [],
  verifiedMap,
}: BuildGroupedNexusArtifactsParams): any[] {
  const highlanderGroupMap = new Map<string, any>();
  if (Array.isArray(flavorGroups)) {
    for (const fg of flavorGroups) {
      if (fg?.id) highlanderGroupMap.set(String(fg.id), fg);
    }
  }

  const legacyHashToGroupId = new Map<string, string>();
  if (Array.isArray(flavorGroupMembers)) {
    for (const fm of flavorGroupMembers) {
      if (
        fm?.mod_hash &&
        fm?.group_id &&
        !legacyHashToGroupId.has(String(fm.mod_hash))
      ) {
        legacyHashToGroupId.set(String(fm.mod_hash), String(fm.group_id));
      }
    }
  }

  const modsById = new Map<string, any>();
  for (const rawMod of modsData || []) {
    if (!isNexusTier0EligibleMod(rawMod)) continue;
    const strId = String(rawMod.id || "").trim();
    if (!strId) continue;

    let mod = rawMod;
    if (verifiedMap && rawMod.master_author) {
      mod = {
        ...rawMod,
        is_verified: Boolean(
          rawMod.is_verified || verifiedMap[rawMod.master_author]
        ),
      };
    }

    if (highlanderGroupMap.size > 0 || legacyHashToGroupId.size > 0) {
      let resolvedGroupId = mod.highlander_group_id
        ? String(mod.highlander_group_id)
        : "";
      if (!resolvedGroupId && Array.isArray(mod.mod_versions)) {
        for (const v of mod.mod_versions) {
          const hit = v?.dna_hash
            ? legacyHashToGroupId.get(String(v.dna_hash))
            : undefined;
          if (hit) {
            resolvedGroupId = hit;
            break;
          }
        }
      }
      const groupObj = resolvedGroupId
        ? highlanderGroupMap.get(resolvedGroupId)
        : null;
      const slotKey = groupObj
        ? toHighlanderSlotSlug(groupObj.slug || groupObj.name)
        : "";
      if (groupObj) {
        mod = {
          ...mod,
          highlanderGroupId: resolvedGroupId,
          highlanderSlotKey: slotKey,
          highlanderSlotName:
            groupObj.name || formatHighlanderSlotLabel(slotKey),
        };
      }
    }

    modsById.set(strId, mod);
  }

  pruneModsWithIneligibleAncestors(modsById, relationships);

  const allItems: any[] = [];
  const processedMods = new Set<string>();

  // 1. Process active Tier 0 Collections first so their members are reserved before family grouping
  if (Array.isArray(collections) && collections.length > 0) {
    const membersBySet = new Map<string, any[]>();
    for (const sm of collectionMembers || []) {
      const sid = String(sm?.set_id || "");
      if (!sid) continue;
      if (!membersBySet.has(sid)) membersBySet.set(sid, []);
      membersBySet.get(sid)!.push(sm);
    }

    for (const set of collections) {
      if (
        !set ||
        !isStrictTier0Value(set.compliance_tier) ||
        set.has_pending_flag === true
      ) {
        continue;
      }
      const sid = String(set.id || "");
      const setMembers = membersBySet.get(sid) || [];
      const seenMemberIds = new Set<string>();
      const members: any[] = [];
      for (const sm of setMembers) {
        const m = modsById.get(String(sm?.mod_id || ""));
        if (m && !seenMemberIds.has(String(m.id))) {
          seenMemberIds.add(String(m.id));
          members.push(m);
        }
      }

      if (members.length > 0) {
        for (const m of members) {
          processedMods.add(String(m.id));
        }

        const hasBroken = members.some((m) => {
          const st = String(m?.status || "").toLowerCase().trim();
          return st === "broken" || st === "corrupted";
        });
        const hasUnstable = members.some(
          (m) => String(m?.status || "").toLowerCase().trim() === "unstable"
        );
        const derivedStatus = hasBroken
          ? "broken"
          : hasUnstable
            ? "unstable"
            : "stable";

        const setMasonName = Array.isArray(set.masons)
          ? set.masons[0]?.name
          : set.masons?.name;
        const resolvedSetAuthor =
          setMasonName ||
          set.creator_name ||
          members.find(
            (m: any) => m?.master_author && m.master_author !== "Unknown"
          )?.master_author ||
          "Unknown Creator";

        allItems.push({
          id: `collection_${set.id}`,
          name: set.name,
          category_override: "Collection",
          status: derivedStatus,
          compliance_tier: 0,
          image_url: set.image_url || null,
          master_author: resolvedSetAuthor,
          is_verified: Boolean(
            resolvedSetAuthor && verifiedMap?.[resolvedSetAuthor]
          ),
          description: null,
          created_at: set.created_at,
          url: set.url || null,
          isCollection: true,
          collectionId: set.id,
          flavors: members,
          familyCount: members.length,
          isVirtual: true,
          isParent: true,
        });
      }
    }
  }

  // 2. Process parent/twin/flavor mod families
  if (Array.isArray(relationships) && relationships.length > 0) {
    const parentRelsByChild = new Map<string, any[]>();
    for (const rel of relationships) {
      if (!RELATION_TYPES.includes(String(rel?.relationship_type || ""))) {
        continue;
      }
      const parentId = String(rel?.parent_id || "");
      const childId = String(rel?.child_id || "");
      if (
        !modsById.has(parentId) ||
        !modsById.has(childId) ||
        processedMods.has(parentId) ||
        processedMods.has(childId)
      ) {
        continue;
      }
      if (!parentRelsByChild.has(childId)) parentRelsByChild.set(childId, []);
      parentRelsByChild.get(childId)!.push(rel);
    }

    const resolveRootParentId = (startId: string): string => {
      let cur = startId;
      let hops = 0;
      const visited = new Set<string>([cur]);
      while (hops < 5) {
        const rels = parentRelsByChild.get(cur) || [];
        const nextRel =
          rels.find((r: any) => r.relationship_type === "addon") ||
          rels.find((r: any) => r.relationship_type === "set_item") ||
          rels.find((r: any) => r.relationship_type === "twin") ||
          rels.find((r: any) => r.relationship_type === "beta") ||
          rels[0];
        const nextParentId = nextRel ? String(nextRel.parent_id || "") : "";
        if (
          nextParentId &&
          nextParentId !== cur &&
          !visited.has(nextParentId) &&
          modsById.has(nextParentId) &&
          !processedMods.has(nextParentId)
        ) {
          visited.add(nextParentId);
          cur = nextParentId;
          hops++;
        } else {
          break;
        }
      }
      return cur;
    };

    const familyMap = new Map<string, Set<string>>();
    for (const rel of relationships) {
      if (!RELATION_TYPES.includes(String(rel?.relationship_type || ""))) {
        continue;
      }
      const rawParentId = String(rel?.parent_id || "");
      const childId = String(rel?.child_id || "");
      if (
        modsById.has(rawParentId) &&
        modsById.has(childId) &&
        !processedMods.has(rawParentId) &&
        !processedMods.has(childId)
      ) {
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
        parentMod?.name && !UUID_NAME_REGEX.test(String(parentMod.name).trim());
      if (members.length > 1 && parentMod && isValidName) {
        allItems.push({
          ...parentMod,
          compliance_tier: 0,
          isVirtual: true,
          isParent: true,
          familyId: parentId,
          flavors: members,
          familyCount: members.length,
        });
        memberIds.forEach((id) => processedMods.add(id));
      }
    });
  }

  // 3. Remaining standalone eligible Tier 0 mods
  modsById.forEach((mod, id) => {
    if (!processedMods.has(id)) {
      allItems.push(mod);
    }
  });

  // 4. Normalized-name deduplication
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
      } else if (!existingParent && !itemParent) {
        const existingVersions = Array.isArray(existing.compatible_versions)
          ? existing.compatible_versions
          : [];
        const itemVersions = Array.isArray(item.compatible_versions)
          ? item.compatible_versions
          : [];
        nameMap.set(key, {
          ...existing,
          compatible_versions: Array.from(
            new Set([...existingVersions, ...itemVersions])
          ),
        });
      }
    }
  }

  return Array.from(nameMap.values()).sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
  );
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
  return buildGroupedNexusTier0Artifacts({
    modsData,
    relationships,
    collections,
    collectionMembers,
  }).length;
}

let inFlightSummaryPromise: Promise<NexusCatalogSummary> | null = null;
let isDispatchingComplianceInvalidation = false;

/**
 * Clears all cached Nexus summary and catalog slices (even while Nexus is unmounted)
 * and optionally notifies active views via `sanctuary-compliance-updated`.
 */
export function invalidateNexusCatalogCache(
  options: { dispatchEvent?: boolean } = {}
): void {
  if (typeof window !== "undefined") {
    const cache = (window as any).__sanctuaryCache;
    if (cache?.nexus) {
      cache.nexus.homeStats = null;
      cache.nexus.nexusItems = null;
      cache.nexus.recentFeed = [];
      cache.nexus.assetResultsMap = {};
      cache.nexus.lastHomeFetch = 0;
      cache.nexus.lastNexusFetch = 0;
      cache.nexus.lastAssetFetch = 0;
      cache.nexus.schemaRev = NEXUS_CACHE_SCHEMA_REV;
    }
  }
  inFlightSummaryPromise = null;
  if (
    options.dispatchEvent &&
    typeof window !== "undefined" &&
    !isDispatchingComplianceInvalidation
  ) {
    isDispatchingComplianceInvalidation = true;
    try {
      window.dispatchEvent(new CustomEvent("sanctuary-compliance-updated"));
    } finally {
      isDispatchingComplianceInvalidation = false;
    }
  }
}

if (typeof window !== "undefined") {
  const win = window as any;
  if (!win.__sanctuaryNexusCacheInvalidatorAttached) {
    win.__sanctuaryNexusCacheInvalidatorAttached = true;
    const onInvalidate = () => {
      invalidateNexusCatalogCache({ dispatchEvent: false });
    };
    window.addEventListener("sanctuary-compliance-updated", onInvalidate);
    window.addEventListener("sanctuary-content-flagged", onInvalidate);
  }
}

async function fetchAllOrderedRows(
  buildQuery: (selectOpts?: { count?: "exact" }) => any,
  orderCol = "id",
  batchSize = 1000
): Promise<any[]> {
  const firstRes = await buildQuery({ count: "exact" })
    .order(orderCol, { ascending: true })
    .range(0, batchSize - 1);
  if (firstRes?.error) throw firstRes.error;
  let rows: any[] = Array.isArray(firstRes?.data) ? [...firstRes.data] : [];
  const totalCount =
    typeof firstRes?.count === "number" ? firstRes.count : rows.length;
  const pages = Math.ceil(totalCount / batchSize);
  if (pages > 1) {
    const pagePromises: Promise<any>[] = [];
    for (let i = 1; i < pages; i++) {
      pagePromises.push(
        buildQuery()
          .order(orderCol, { ascending: true })
          .range(i * batchSize, (i + 1) * batchSize - 1)
      );
    }
    const pageResponses = await Promise.all(pagePromises);
    for (const res of pageResponses) {
      if (res?.error) throw res.error;
      if (Array.isArray(res?.data)) rows = rows.concat(res.data);
    }
  } else if (
    rows.length === batchSize &&
    typeof firstRes?.count !== "number"
  ) {
    let from = batchSize;
    while (true) {
      const nextRes = await buildQuery()
        .order(orderCol, { ascending: true })
        .range(from, from + batchSize - 1);
      if (nextRes?.error) throw nextRes.error;
      const batch = Array.isArray(nextRes?.data) ? nextRes.data : [];
      if (batch.length === 0) break;
      rows = rows.concat(batch);
      if (batch.length < batchSize) break;
      from += batchSize;
    }
  }
  return rows;
}

/**
 * Fetches accurate Tier 0 grouped Nexus catalog counts shared 1:1 between CommandCenter and Nexus.
 */
export async function fetchNexusTier0CatalogSummary(
  supabaseClient: any,
  options: { forceRefresh?: boolean } = {}
): Promise<NexusCatalogSummary> {
  const nexusCache =
    typeof window !== "undefined"
      ? (window as any).__sanctuaryCache?.nexus
      : null;
  if (
    !options.forceRefresh &&
    nexusCache &&
    nexusCache.schemaRev === NEXUS_CACHE_SCHEMA_REV &&
    nexusCache.homeStats &&
    Array.isArray(nexusCache.nexusItems) &&
    Array.isArray(nexusCache.assetResultsMap?.BLUEPRINTS) &&
    nexusCache.lastNexusFetch > 0 &&
    performance.now() - nexusCache.lastNexusFetch < NEXUS_CACHE_TTL_MS
  ) {
    const artifacts = nexusCache.nexusItems.length;
    const blueprints = nexusCache.assetResultsMap.BLUEPRINTS.length;
    const lexicons = (nexusCache.assetResultsMap.LEXICONS || []).length;
    const chameleons = (nexusCache.assetResultsMap.CHAMELEONS || []).length;
    const templates = (nexusCache.assetResultsMap.TEMPLATES || []).length;
    const total = artifacts + blueprints + lexicons + chameleons + templates;
    return { artifacts, blueprints, lexicons, chameleons, templates, total };
  }

  if (options.forceRefresh) {
    inFlightSummaryPromise = null;
  } else if (inFlightSummaryPromise) {
    return inFlightSummaryPromise;
  }

  inFlightSummaryPromise = (async (): Promise<NexusCatalogSummary> => {
    const selectCols =
      "id, name, master_author, mason_id, file_extension, created_at, compliance_tier, has_pending_flag, status, mod_versions(dna_hash)";

    const [
      allMods,
      relationshipsData,
      collectionsData,
      setMembersData,
      blueprintsData,
      assetsData,
    ] = await Promise.all([
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("mods")
            .select(selectCols, opts)
            .eq("compliance_tier", 0)
            .eq("has_pending_flag", false)
            .in("status", [...NEXUS_ELIGIBLE_MOD_STATUSES]),
        "id"
      ),
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("mod_relationships")
            .select("id, parent_id, child_id, relationship_type", opts)
            .in("relationship_type", RELATION_TYPES),
        "id"
      ),
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("collections")
            .select("id, name, created_at, compliance_tier, has_pending_flag", opts),
        "id"
      ),
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("collection_members")
            .select("id, set_id, mod_id", opts),
        "id"
      ),
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("blueprints")
            .select("*", opts)
            .eq("is_public", true)
            .eq("is_market_listed", true)
            .eq("compliance_tier", 0)
            .eq("has_pending_flag", false),
        "id"
      ),
      fetchAllOrderedRows(
        (opts) =>
          supabaseClient
            .from("nexus_assets")
            .select("id, asset_type, is_public, has_pending_flag", opts)
            .eq("has_pending_flag", false)
            .or("is_public.eq.true,is_public.is.null"),
        "id"
      ),
    ]);

    const currentCache =
      typeof window !== "undefined"
        ? (window as any).__sanctuaryCache?.nexus
        : null;
    const hasFreshCachedItems =
      !options.forceRefresh &&
      currentCache?.schemaRev === NEXUS_CACHE_SCHEMA_REV &&
      Array.isArray(currentCache?.nexusItems) &&
      currentCache.lastNexusFetch > 0 &&
      performance.now() - currentCache.lastNexusFetch < NEXUS_CACHE_TTL_MS;

    const artifacts = hasFreshCachedItems
      ? currentCache.nexusItems.length
      : countGroupedNexusTier0Artifacts(
          allMods,
          relationshipsData,
          collectionsData,
          setMembersData
        );

    const eligibleBps = (blueprintsData || []).filter(
      (b: any) =>
        b &&
        b.has_pending_flag !== true &&
        isStrictTier0Value(b.compliance_tier) &&
        b.is_public !== false &&
        b.is_market_listed === true
    );

    let blueprints = eligibleBps.length;
    if (eligibleBps.length > 0) {
      try {
        const auditMap = await auditBlueprintsTier0Compliance(
          supabaseClient,
          eligibleBps,
          { autoFlagInDb: false }
        );
        blueprints = eligibleBps.filter((b: any) => {
          const audit = auditMap.get(b.id);
          return !audit || audit.isCompliant;
        }).length;
      } catch {
        blueprints = eligibleBps.length;
      }
    }

    const publicAssets = (assetsData || []).filter(
      (a: any) => a && a.has_pending_flag !== true && a.is_public !== false
    );
    const lexicons = publicAssets.filter(
      (a: any) => a.asset_type === "lexicon"
    ).length;
    const chameleons = publicAssets.filter(
      (a: any) => a.asset_type === "chameleon"
    ).length;
    const templates = publicAssets.filter(
      (a: any) => a.asset_type === "workbench_template"
    ).length;

    const summary: NexusCatalogSummary = {
      artifacts,
      blueprints,
      lexicons,
      chameleons,
      templates,
      total: artifacts + blueprints + lexicons + chameleons + templates,
    };

    if (typeof window !== "undefined") {
      if (!(window as any).__sanctuaryCache)
        (window as any).__sanctuaryCache = {};
      if (!(window as any).__sanctuaryCache.nexus)
        (window as any).__sanctuaryCache.nexus = {};
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
