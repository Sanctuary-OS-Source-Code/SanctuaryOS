import { sanitizeComplianceTierForLocal } from "../utils/blueprintOverrideUtils";
import { supabase } from "../supabase";
import { toHighlanderSlotSlug, formatHighlanderSlotLabel } from "../shared";
import { normalizeModGroupTitle, formatCleanModTitle } from "../side-panels/CommandIncompatiblePanel";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getComplianceTierDisplay(
  item: any,
  isNexus: boolean,
  t: (key: string, fallback?: string) => string
) {
  const rawTier = item?.compliance_tier;
  const hasTier = rawTier !== null && rawTier !== undefined && rawTier !== "";
  const tier = hasTier ? Number(rawTier) : -1;
  if (tier === 5) {
    return {
      value: t("tier_5_label", "Malware / Security Threat (T5)"),
      color: "text-[var(--danger)]",
    };
  }
  if (tier === 4) {
    return {
      value: t("tier_4_label", "Taboo / Sensitive (T4)"),
      color: "text-[var(--danger)]",
    };
  }
  if (tier === 3) {
    return {
      value: t("tier_3_label", "Extreme / Violence (T3)"),
      color: "text-[var(--danger)]",
    };
  }
  if (tier === 2) {
    return {
      value: t("tier_2_label", "Illicit / Substance (T2)"),
      color: "text-[var(--warning)]",
    };
  }
  if (tier === 1) {
    return {
      value: t("tier_1_label", "Adult / NSFW (T1)"),
      color: "text-[var(--warning)]",
    };
  }
  const isVerifiedTier0 =
    (tier === 0 || (!hasTier && isNexus)) &&
    String(item?.status || "").toLowerCase() !== "unverified" &&
    (isNexus || Boolean(item?.dbId || item?.isSynced || item?.id));
  if (isVerifiedTier0) {
    return {
      value: t("tier_0_label", "Clean / Safe (T0)"),
      color: "text-[var(--success)]",
    };
  }
  return {
    value: t("status_unknown_unverified", "Unknown / Unverified"),
    color: "text-[var(--warning)]",
  };
}

export function extractCleanUuid(...vals: any[]): string {
  for (const v of vals) {
    if (!v) continue;
    const cleaned = String(v)
      .trim()
      .replace(/^(FOLDER_|SET_|LOCAL_SET_|COLLECTION_|FLAVOR_|virtual_)/i, "")
      .split("@")[0]
      .trim();
    if (UUID_REGEX.test(cleaned)) return cleaned;
  }
  return "";
}

export function collectAllCandidateUuids(target: any): string[] {
  if (!target) return [];
  const seen = new Set<string>();
  const add = (v: any) => {
    const u = extractCleanUuid(v);
    if (u) seen.add(u.toLowerCase());
  };
  const directUuid = extractCleanUuid(target.dbId, target.id);
  add(target.dbId);
  add(target.id);
  if (target.isVirtual || target.isParent || target.isCollection || !directUuid) {
    add(target.baseFamilyId);
    add(target.familyId);
    add(target.collectionId);
  }
  add(target.name);
  if (Array.isArray(target._groupedIds)) {
    target._groupedIds.forEach(add);
  }
  if (Array.isArray(target._groupedMods)) {
    target._groupedMods.forEach((gm: any) => {
      add(gm?.dbId);
      add(gm?.id);
    });
  }
  if (Array.isArray(target.flavors)) {
    target.flavors.forEach((fl: any) => {
      add(fl?.dbId);
      add(fl?.id);
    });
  }
  return Array.from(seen);
}

export function isPlaceholderAuthorStr(val?: any, t?: any): boolean {
  if (!val || typeof val !== "string") return true;
  const low = val.trim().toLowerCase();
  if (
    low === "" ||
    low === "unknown" ||
    low === "unknown creator" ||
    low === "unknown mason" ||
    low === "unknown architect" ||
    low === "local" ||
    low === "local node" ||
    low === "local folder" ||
    low === "local vault" ||
    low === "local override" ||
    low === "unlinked" ||
    low === "v.local" ||
    low === "vlocal" ||
    low === "null" ||
    low === "undefined"
  ) {
    return true;
  }
  if (t) {
    const tLocal = String(t("source_local", "Local") || "").trim().toLowerCase();
    const tNode = String(t("local_node", "Local Node") || "").trim().toLowerCase();
    const tUnk = String(t("unknown", "Unknown") || "").trim().toLowerCase();
    if (low === tLocal || low === tNode || low === tUnk) return true;
  }
  return false;
}

export function isPlaceholderVersionStr(val: any, t?: any): boolean {
  if (!val || typeof val !== "string") return true;
  const low = val.trim().toLowerCase();
  if (
    low === "" ||
    low === "unknown" ||
    low === "v.unknown" ||
    low === "vunknown" ||
    low === "local" ||
    low === "local node" ||
    low === "v.local" ||
    low === "vlocal" ||
    low === "vv.local" ||
    low === "null" ||
    low === "undefined"
  ) {
    return true;
  }
  if (t) {
    const tLocal = String(t("source_local", "Local") || "").trim().toLowerCase();
    const tNode = String(t("local_node", "Local Node") || "").trim().toLowerCase();
    const tUnk = String(t("unknown", "Unknown") || "").trim().toLowerCase();
    if (low === tLocal || low === tNode || low === tUnk) return true;
  }
  return false;
}

export function pickFirstValidAuthor(t: any, ...candidates: any[]): string {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") {
      if (!isPlaceholderAuthorStr(c, t)) return c.trim();
      continue;
    }
    const direct =
      (Array.isArray(c.masons) ? c.masons[0]?.name : c.masons?.name) ||
      c.author ||
      c.master_author ||
      c.creator_name ||
      c.suggested_author;
    if (direct && !isPlaceholderAuthorStr(direct, t)) {
      return String(direct).trim();
    }
  }
  return "";
}

export const MOD_SELECT =
  "id, name, created_at, category_override, master_author, mason_id, masons(name), compliance_tier, image_url, description, url, compatible_versions, requiredDLC, status, status_reason, is_paid, is_early_access, highlander_group_id, mod_versions(dna_hash, version_label, created_at)";
export const MOD_SELECT_LEGACY =
  "id, name, created_at, category_override, master_author, mason_id, masons(name), compliance_tier, image_url, description, url, compatible_versions, requiredDLC, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label, created_at)";

export const spokeMetadataCache = new Map<string, any>();
export const cleanTitleCache = new Map<string, { cleanTitle: string; groupTitle: string }>();
export const normTitleMatchCache = new Map<string, string>();

export function getDossierTargetCacheKey(targetMod: any): string {
  if (!targetMod) return "";
  const idPart = extractCleanUuid(
    targetMod.dbId,
    targetMod.id,
    targetMod.baseFamilyId,
    targetMod.familyId,
    targetMod.name
  );
  const hashPart = String(targetMod.hash || "").trim();
  const namePart = String(targetMod.name || targetMod.displayName || "").trim();
  return `${idPart}::${hashPart}::${namePart}`.toLowerCase();
}

export function getCachedGroupTitles(rawStr: string): { cleanTitle: string; groupTitle: string } {
  const cached = cleanTitleCache.get(rawStr);
  if (cached) return cached;
  const cleanTitle = formatCleanModTitle(rawStr) || rawStr;
  const groupTitle = normalizeModGroupTitle(cleanTitle) || cleanTitle;
  const res = { cleanTitle, groupTitle };
  if (cleanTitleCache.size > 6000) cleanTitleCache.clear();
  cleanTitleCache.set(rawStr, res);
  return res;
}

export function DossierFilterSection({ title, options, value, onChange, t }: any) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-col mb-4 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 mb-2 px-1 flex items-center gap-2">
        {title}
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt: any) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${active ? "is-selected font-bold" : "font-semibold"
                }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {opt.label}
              </span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t ? t("icon_check", "check") : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export async function fetchSpokeModMetadata(targetMod: any, t?: any): Promise<any | null> {
  if (!targetMod) return null;
  const cacheKey = getDossierTargetCacheKey(targetMod);
  if (cacheKey && spokeMetadataCache.has(cacheKey)) {
    return spokeMetadataCache.get(cacheKey);
  }
  const candidateIds = collectAllCandidateUuids(targetMod);
  const rawHash = String(targetMod.hash || "").trim();
  const candidateHash =
    rawHash && !/^(virtual_|set_|local_)/i.test(rawHash)
      ? rawHash
      : String(
        targetMod._groupedMods?.find(
          (gm: any) => gm?.hash && !/^(virtual_|set_|local_)/i.test(String(gm.hash))
        )?.hash ||
        targetMod.flavors?.find(
          (fl: any) => fl?.hash && !/^(virtual_|set_|local_)/i.test(String(fl.hash))
        )?.hash ||
        ""
      ).trim();

  const rawNameStr = String(
    (targetMod.displayName && !/^(FOLDER_|SET_|LOCAL_SET_)/i.test(String(targetMod.displayName))
      ? targetMod.displayName
      : targetMod.name) || ""
  )
    .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.[^/.]+$/, "")
    .trim() || "";
  const candidateName = UUID_REGEX.test(rawNameStr.split("@")[0]) ? "" : rawNameStr;

  let matchedMods: any[] = [];

  if (candidateIds.length > 0) {
    let { data, error } = await supabase
      .from("mods")
      .select(MOD_SELECT)
      .in("id", candidateIds.slice(0, 20));
    if (error) {
      const fb = await supabase
        .from("mods")
        .select(MOD_SELECT_LEGACY)
        .in("id", candidateIds.slice(0, 20));
      data = fb.data as any;
    }
    if (Array.isArray(data) && data.length > 0) {
      matchedMods = data;
    }
  }

  if (matchedMods.length === 0 && candidateHash) {
    let { data: vRow, error: vErr } = await supabase
      .from("mod_versions")
      .select(`mod_id, dna_hash, mods(${MOD_SELECT})`)
      .eq("dna_hash", candidateHash)
      .limit(1)
      .maybeSingle();
    if (vErr) {
      const fbV = await supabase
        .from("mod_versions")
        .select(`mod_id, dna_hash, mods(${MOD_SELECT_LEGACY})`)
        .eq("dna_hash", candidateHash)
        .limit(1)
        .maybeSingle();
      vRow = fbV.data as any;
    }
    if (vRow?.mods) {
      const mObj = Array.isArray(vRow.mods) ? vRow.mods[0] : vRow.mods;
      if (mObj) matchedMods = [mObj];
    }
  }

  if (matchedMods.length === 0 && candidateName) {
    let { data, error } = await supabase
      .from("mods")
      .select(MOD_SELECT)
      .ilike("name", candidateName)
      .limit(3);
    if (error) {
      const fb = await supabase
        .from("mods")
        .select(MOD_SELECT_LEGACY)
        .ilike("name", candidateName)
        .limit(3);
      data = fb.data as any;
    }
    if (Array.isArray(data) && data.length > 0) {
      matchedMods = data;
    }
  }

  const allKnownIds = Array.from(
    new Set([
      ...candidateIds,
      ...matchedMods.map((m: any) => String(m?.id || "")).filter(Boolean),
    ])
  );

  let relatedMods: any[] = [];
  let hydratedRequirements: any[] = [];
  let hydratedTwins: any[] = [];
  let hydratedCollectionChildren: any[] = [];

  if (allKnownIds.length > 0) {
    const [
      { data: relParentRows },
      { data: relChildRows },
      { data: depRows },
      { data: colMemberRows },
    ] = await Promise.all([
      supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["addon", "flavor", "set_item", "beta", "twin"])
        .in("child_id", allKnownIds.slice(0, 25))
        .limit(60),
      supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["addon", "flavor", "set_item", "beta", "twin"])
        .in("parent_id", allKnownIds.slice(0, 25))
        .limit(500),
      supabase
        .from("mod_dependencies")
        .select("parent_id, child_id")
        .in("child_id", allKnownIds.slice(0, 25))
        .limit(60),
      supabase
        .from("collection_members")
        .select("set_id, mod_id")
        .in("set_id", allKnownIds.slice(0, 25))
        .limit(500),
    ]);

    const extraParentIds = Array.from(
      new Set([
        ...(relParentRows || []).map((r: any) => String(r.parent_id)),
        ...(relChildRows || []).map((r: any) => String(r.child_id)),
        ...(depRows || []).map((d: any) => String(d.parent_id)),
        ...(colMemberRows || []).map((c: any) => String(c.mod_id)),
      ])
    ).filter((pid) => pid && !allKnownIds.includes(pid));

    if (extraParentIds.length > 0) {
      const chunks: string[][] = [];
      const cappedIds = extraParentIds.slice(0, 450);
      for (let i = 0; i < cappedIds.length; i += 150) {
        chunks.push(cappedIds.slice(i, i + 150));
      }
      const chunkResults = await Promise.all(
        chunks.map(async (chunk) => {
          const r = await supabase.from("mods").select(MOD_SELECT).in("id", chunk);
          if (r.error) {
            return supabase.from("mods").select(MOD_SELECT_LEGACY).in("id", chunk);
          }
          return r;
        })
      );
      for (const res of chunkResults) {
        if (Array.isArray(res.data)) {
          relatedMods.push(...res.data);
        }
      }
    }

    const byId = new Map<string, any>();
    [...matchedMods, ...relatedMods].forEach((m: any) => {
      if (m?.id) byId.set(String(m.id), m);
    });

    const reqIds = Array.from(
      new Set([
        ...(depRows || []).map((d: any) => String(d.parent_id)),
        ...(relParentRows || [])
          .filter((r: any) => r.relationship_type === "addon")
          .map((r: any) => String(r.parent_id)),
      ])
    ).filter((id) => id && !allKnownIds.includes(id));

    hydratedRequirements = reqIds.map((rid) => {
      const m = byId.get(rid);
      return {
        id: rid,
        dbId: rid,
        name: m?.name || rid,
        displayName: m?.name || rid,
        url: m?.url || null,
        author: pickFirstValidAuthor(t, m) || undefined,
      };
    });

    const twinIds = Array.from(
      new Set([
        ...(relParentRows || [])
          .filter((r: any) => r.relationship_type === "twin")
          .map((r: any) => String(r.parent_id)),
        ...(relChildRows || [])
          .filter((r: any) => r.relationship_type === "twin")
          .map((r: any) => String(r.child_id)),
      ])
    ).filter((id) => id && !allKnownIds.includes(id));

    hydratedTwins = twinIds.map((tid) => {
      const m = byId.get(tid);
      return {
        id: tid,
        dbId: tid,
        name: m?.name || tid,
        displayName: m?.name || tid,
        url: m?.url || null,
        author: pickFirstValidAuthor(t, m) || undefined,
      };
    });

    const rawCollectionChildIds = Array.from(
      new Set([
        ...(relChildRows || [])
          .filter((r: any) => r.relationship_type !== "twin")
          .map((r: any) => String(r.child_id)),
        ...(colMemberRows || []).map((c: any) => String(c.mod_id)),
      ])
    ).filter(Boolean);

    if (rawCollectionChildIds.length > 0) {
      const allSuiteIds = Array.from(
        new Set([...allKnownIds, ...twinIds, ...rawCollectionChildIds])
      ).filter(Boolean);
      hydratedCollectionChildren = allSuiteIds
        .map((cid) => {
          const m = byId.get(cid);
          if (!m) return null;
          const latestV =
            Array.isArray(m.mod_versions) && m.mod_versions.length > 0
              ? m.mod_versions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
              m.mod_versions[0]
              : null;
          return {
            id: cid,
            dbId: cid,
            hash: latestV?.dna_hash || undefined,
            name: m.name || cid,
            displayName: m.name || cid,
            url: m.url || null,
            author: pickFirstValidAuthor(t, m) || undefined,
            mason_id: m.mason_id || undefined,
            category_override: m.category_override || undefined,
            description: m.description || undefined,
            image_url: m.image_url || undefined,
            compatible_versions: m.compatible_versions || undefined,
            created_at: m.created_at || latestV?.created_at || undefined,
            updated_at: latestV?.created_at || m.created_at || undefined,
            version: !isPlaceholderVersionStr(latestV?.version_label, t)
              ? latestV?.version_label
              : undefined,
            status: m.status || "stable",
            mod_versions: m.mod_versions || undefined,
          };
        })
        .filter(Boolean);
    }
  }

  if (matchedMods.length === 0 && relatedMods.length === 0) return null;

  const primaryMod = matchedMods[0] || relatedMods[0];
  const allCandidates = [...matchedMods, ...relatedMods];

  const allVersions = matchedMods
    .flatMap((m: any) => (Array.isArray(m?.mod_versions) ? m.mod_versions : []))
    .concat(
      relatedMods.flatMap((m: any) => (Array.isArray(m?.mod_versions) ? m.mod_versions : []))
    );
  const latestVer =
    allVersions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
    (allVersions.length > 0 ? allVersions[0] : null);

  const resolvedAuthor = pickFirstValidAuthor(t, ...allCandidates) || undefined;
  const resolvedMasonId =
    allCandidates.find((m: any) => m?.mason_id)?.mason_id || undefined;
  const resolvedDesc =
    allCandidates.find((m: any) => m?.description && String(m.description).trim() !== "")
      ?.description || undefined;
  const resolvedCategory =
    allCandidates.find((m: any) => m?.category_override)?.category_override || undefined;
  const resolvedUrl =
    allCandidates.find((m: any) => m?.url)?.url || undefined;
  const resolvedImg =
    allCandidates.find((m: any) => m?.image_url)?.image_url || undefined;
  const resolvedCompat =
    allCandidates.find(
      (m: any) => Array.isArray(m?.compatible_versions) && m.compatible_versions.length > 0
    )?.compatible_versions || undefined;
  const resolvedCreatedAt =
    matchedMods.find((m: any) => m?.created_at)?.created_at ||
    latestVer?.created_at ||
    relatedMods.find((m: any) => m?.created_at)?.created_at ||
    undefined;
  const resolvedUpdatedAt =
    latestVer?.created_at ||
    matchedMods.find((m: any) => m?.created_at)?.created_at ||
    relatedMods.find((m: any) => m?.created_at)?.created_at ||
    undefined;

  const resolvedHighlanderGroupId =
    matchedMods.find((m: any) => m?.highlander_group_id)?.highlander_group_id ||
    relatedMods.find((m: any) => m?.highlander_group_id)?.highlander_group_id ||
    undefined;
  let resolvedHighlanderSlotKey: string | undefined;
  let resolvedHighlanderSlotName: string | undefined;
  if (resolvedHighlanderGroupId) {
    let { data: fgRow, error: fgErr } = await supabase
      .from("flavor_groups")
      .select("id, name, slug")
      .eq("id", resolvedHighlanderGroupId)
      .maybeSingle();
    if (fgErr) {
      const fbFg = await supabase
        .from("flavor_groups")
        .select("id, name")
        .eq("id", resolvedHighlanderGroupId)
        .maybeSingle();
      fgRow = fbFg.data as any;
    }
    if (fgRow) {
      resolvedHighlanderSlotKey = toHighlanderSlotSlug(
        (fgRow as any).slug || (fgRow as any).name || String(resolvedHighlanderGroupId)
      );
      resolvedHighlanderSlotName =
        (fgRow as any).name || formatHighlanderSlotLabel(resolvedHighlanderSlotKey);
    }
  }

  const hydratedByIdMap: Record<string, any> = {};
  for (const row of allCandidates) {
    if (!row?.id) continue;
    const rowLatestVer =
      Array.isArray(row.mod_versions) && row.mod_versions.length > 0
        ? row.mod_versions.find((mv: any) => !isPlaceholderVersionStr(mv?.version_label, t)) ||
        row.mod_versions[0]
        : null;
    const rowAuthor = pickFirstValidAuthor(t, row) || undefined;
    hydratedByIdMap[String(row.id).toLowerCase()] = {
      dbId: row.id,
      name: row.name,
      hash: rowLatestVer?.dna_hash || undefined,
      author: rowAuthor,
      master_author: rowAuthor,
      mason_id: row.mason_id || undefined,
      category_override: row.category_override || undefined,
      description: row.description || undefined,
      url: row.url || undefined,
      image_url: row.image_url || undefined,
      compatible_versions: row.compatible_versions || undefined,
      created_at: row.created_at || rowLatestVer?.created_at || undefined,
      updated_at: rowLatestVer?.created_at || row.created_at || undefined,
      version: rowLatestVer?.version_label || undefined,
      status: row.status || "stable",
      status_reason: row.status_reason || undefined,
      compliance_tier: row.compliance_tier ?? undefined,
      is_paid: Boolean(row.is_paid),
      is_early_access: Boolean(row.is_early_access),
      mod_versions: row.mod_versions || undefined,
    };
  }

  const resultPayload = {
    dbId: primaryMod?.id || candidateIds[0] || undefined,
    hash: latestVer?.dna_hash || undefined,
    author: resolvedAuthor,
    master_author: resolvedAuthor,
    mason_id: resolvedMasonId,
    category_override: resolvedCategory,
    description: resolvedDesc,
    url: resolvedUrl,
    image_url: resolvedImg,
    compatible_versions: resolvedCompat,
    created_at: resolvedCreatedAt,
    updated_at: resolvedUpdatedAt,
    version: !isPlaceholderVersionStr(latestVer?.version_label, t)
      ? latestVer?.version_label
      : undefined,
    status: primaryMod?.status || "stable",
    status_reason:
      matchedMods.find((m: any) => m?.status_reason)?.status_reason ||
      primaryMod?.status_reason ||
      undefined,
    compliance_tier: primaryMod?.compliance_tier ?? undefined,
    is_paid: matchedMods.some((m: any) => Boolean(m?.is_paid)),
    is_early_access: matchedMods.some((m: any) => Boolean(m?.is_early_access)),
    highlanderGroupId: resolvedHighlanderGroupId ? String(resolvedHighlanderGroupId) : undefined,
    highlanderSlotKey: resolvedHighlanderSlotKey,
    highlanderSlotName: resolvedHighlanderSlotName,
    mod_versions: allVersions.length > 0 ? allVersions : undefined,
    requirements: hydratedRequirements.length > 0 ? hydratedRequirements : undefined,
    twins: hydratedTwins.length > 0 ? hydratedTwins : undefined,
    hydratedCollectionChildren:
      hydratedCollectionChildren.length > 0 ? hydratedCollectionChildren : undefined,
    hydratedByIdMap,
  };
  if (cacheKey) {
    if (spokeMetadataCache.size > 300) spokeMetadataCache.clear();
    spokeMetadataCache.set(cacheKey, resultPayload);
  }
  return resultPayload;
}

export function normTitleForMatch(raw: any): string {
  if (!raw) return "";
  const rawStr = String(raw);
  const cached = normTitleMatchCache.get(rawStr);
  if (cached !== undefined) return cached;
  const s =
    rawStr
      .replace(/^(FOLDER_|SET_|LOCAL_SET_|virtual_)/i, "")
      .split(/[/\\]/)
      .pop() || "";
  if (!s || UUID_REGEX.test(s.split("@")[0])) {
    normTitleMatchCache.set(rawStr, "");
    return "";
  }
  const stripped = s
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "")
    .trim();
  if (!stripped) {
    normTitleMatchCache.set(rawStr, "");
    return "";
  }
  const { groupTitle } = getCachedGroupTitles(stripped);
  const res = groupTitle.toLowerCase().trim();
  if (normTitleMatchCache.size > 6000) normTitleMatchCache.clear();
  normTitleMatchCache.set(rawStr, res);
  return res;
}

export interface VaultModIndex {
  allMods: any[];
  physicalMods: any[];
  virtualMods: any[];
  byUuid: Map<string, any[]>;
  physicalByUuid: Map<string, any[]>;
  physicalByHash: Map<string, any[]>;
  physicalByName: Map<string, any[]>;
  physicalByNormTitle: Map<string, any[]>;
  virtualByUuid: Map<string, any>;
}

export function buildVaultModIndex(allVaultMods: any[]): VaultModIndex {
  const allMods = Array.isArray(allVaultMods) ? allVaultMods : [];
  const physicalMods: any[] = [];
  const virtualMods: any[] = [];
  const byUuid = new Map<string, any[]>();
  const physicalByUuid = new Map<string, any[]>();
  const physicalByHash = new Map<string, any[]>();
  const physicalByName = new Map<string, any[]>();
  const physicalByNormTitle = new Map<string, any[]>();
  const virtualByUuid = new Map<string, any>();

  const pushToMap = (map: Map<string, any[]>, key: string, val: any) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(val);
  };

  for (const vm of allMods) {
    if (!vm) continue;
    const vmUuid = extractCleanUuid(
      vm.dbId,
      vm.id,
      vm.baseFamilyId,
      vm.familyId
    ).toLowerCase();
    if (vmUuid) {
      pushToMap(byUuid, vmUuid, vm);
    }

    if (vm.isVirtual) {
      if (!vm.isCollection) {
        virtualMods.push(vm);
        const virtUuid = extractCleanUuid(
          vm.dbId,
          vm.baseFamilyId
        ).toLowerCase();
        if (virtUuid && !virtualByUuid.has(virtUuid)) {
          virtualByUuid.set(virtUuid, vm);
        }
      }
    } else {
      physicalMods.push(vm);
      const pmUuid = extractCleanUuid(vm.dbId, vm.id).toLowerCase();
      if (pmUuid) {
        pushToMap(physicalByUuid, pmUuid, vm);
      }
      if (vm.hash) {
        pushToMap(physicalByHash, String(vm.hash).toLowerCase(), vm);
      }
      if (vm.name && typeof vm.name === "string") {
        pushToMap(physicalByName, vm.name, vm);
        pushToMap(physicalByName, vm.name.toLowerCase(), vm);
      }
      const titleFromDisp = normTitleForMatch(vm.displayName);
      const titleFromName = normTitleForMatch(vm.name);
      if (titleFromDisp) pushToMap(physicalByNormTitle, titleFromDisp, vm);
      if (titleFromName && titleFromName !== titleFromDisp) {
        pushToMap(physicalByNormTitle, titleFromName, vm);
      }
    }
  }

  return {
    allMods,
    physicalMods,
    virtualMods,
    byUuid,
    physicalByUuid,
    physicalByHash,
    physicalByName,
    physicalByNormTitle,
    virtualByUuid,
  };
}

export function mergeHydratedMod(
  baseMod: any,
  hydratedMeta: any,
  vaultOrIndex: VaultModIndex | any[],
  t: any
): any {
  if (!baseMod) return null;

  const childSources: any[] = [
    ...(Array.isArray(baseMod._groupedMods) ? baseMod._groupedMods : []),
    ...(Array.isArray(baseMod.flavors) ? baseMod.flavors : []),
  ];

  const cleanBaseId = extractCleanUuid(
    baseMod.dbId,
    baseMod.id,
    baseMod.baseFamilyId,
    baseMod.familyId,
    baseMod.name
  );

  if (cleanBaseId) {
    const cleanLower = cleanBaseId.toLowerCase();
    if (vaultOrIndex && !Array.isArray(vaultOrIndex) && vaultOrIndex.byUuid) {
      const matched = vaultOrIndex.byUuid.get(cleanLower);
      if (matched) {
        for (let i = 0; i < matched.length; i++) {
          childSources.push(matched[i]);
        }
      }
    } else if (Array.isArray(vaultOrIndex)) {
      for (const vm of vaultOrIndex) {
        if (!vm) continue;
        const vmId = extractCleanUuid(vm.dbId, vm.id, vm.baseFamilyId, vm.familyId);
        if (vmId && vmId.toLowerCase() === cleanLower) {
          childSources.push(vm);
        }
      }
    }
  }

  let localOvr: Record<string, any> | undefined;
  if (!baseMod?.isNexusView) {
    try {
      const h = baseMod?.hash ? String(baseMod.hash).trim() : "";
      if (h) {
        const allOvr = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
        if (allOvr && typeof allOvr[h] === "object" && allOvr[h] !== null) {
          localOvr = allOvr[h];
        }
      }
    } catch { }
  }

  const resolvedAuthor =
    localOvr?.author !== undefined
      ? String(localOvr.author || "")
      : pickFirstValidAuthor(
          t,
          baseMod.author,
          baseMod.master_author,
          hydratedMeta?.author,
          hydratedMeta?.master_author,
          ...childSources
        ) ||
        hydratedMeta?.author ||
        baseMod.author ||
        "";

  const resolvedMasonId =
    baseMod.mason_id ||
    hydratedMeta?.mason_id ||
    childSources.find((cs: any) => cs?.mason_id)?.mason_id ||
    null;

  const resolvedCategory =
    baseMod.category_override ||
    baseMod.category ||
    baseMod.type ||
    hydratedMeta?.category_override ||
    childSources.find((cs: any) => cs?.category_override || cs?.category || cs?.type)
      ?.category_override ||
    "";

  const resolvedCompat =
    localOvr && Array.isArray(localOvr.compatible_versions)
      ? localOvr.compatible_versions
      : Array.isArray(baseMod.compatible_versions) && baseMod.compatible_versions.length > 0
        ? baseMod.compatible_versions
        : hydratedMeta?.compatible_versions ||
        childSources.find(
          (cs: any) =>
            Array.isArray(cs?.compatible_versions) && cs.compatible_versions.length > 0
        )?.compatible_versions ||
        [];

  const latestVerCreated =
    baseMod.mod_versions?.[0]?.created_at ||
    hydratedMeta?.mod_versions?.[0]?.created_at ||
    childSources.find((cs: any) => cs?.mod_versions?.[0]?.created_at)?.mod_versions?.[0]
      ?.created_at;

  const resolvedCreated =
    baseMod.created_at ||
    hydratedMeta?.created_at ||
    childSources.find((cs: any) => cs?.created_at)?.created_at ||
    latestVerCreated ||
    null;

  const resolvedUpdated =
    baseMod.updated_at ||
    hydratedMeta?.updated_at ||
    childSources.find((cs: any) => cs?.updated_at)?.updated_at ||
    latestVerCreated ||
    resolvedCreated ||
    null;

  const isLocalVerStr = (v: any) => isPlaceholderVersionStr(v, t);

  const resolvedVersion =
    (!isLocalVerStr(baseMod.version) ? baseMod.version : "") ||
    (!isLocalVerStr(baseMod.latest_version) ? baseMod.latest_version : "") ||
    (!isLocalVerStr(hydratedMeta?.version) ? hydratedMeta?.version : "") ||
    childSources.find((cs: any) => !isLocalVerStr(cs?.version))?.version ||
    "";

  const resolvedDesc =
    localOvr?.description !== undefined
      ? String(localOvr.description || "")
      : localOvr?.desc !== undefined
        ? String(localOvr.desc || "")
        : baseMod.description ||
          baseMod.desc ||
          hydratedMeta?.description ||
          childSources.find((cs: any) => cs?.description && String(cs.description).trim() !== "")
            ?.description ||
          "";

  const resolvedUrl =
    localOvr?.url !== undefined
      ? String(localOvr.url || "")
      : baseMod.url ||
        hydratedMeta?.url ||
        childSources.find((cs: any) => cs?.url)?.url ||
        "";

  const resolvedImageUrl =
    localOvr?.image_url !== undefined
      ? String(localOvr.image_url || "")
      : localOvr?.imageUrl !== undefined
        ? String(localOvr.imageUrl || "")
        : baseMod.image_url ||
          baseMod.imageUrl ||
          hydratedMeta?.image_url ||
          childSources.find((cs: any) => cs?.image_url || cs?.imageUrl)?.image_url ||
          "";

  return {
    ...baseMod,
    dbId:
      baseMod.dbId ||
      hydratedMeta?.dbId ||
      cleanBaseId ||
      (baseMod.isNexusView ? baseMod.id : undefined),
    hash: baseMod.hash || hydratedMeta?.hash || "",
    author: resolvedAuthor,
    master_author: resolvedAuthor,
    mason_id: resolvedMasonId,
    category: resolvedCategory,
    category_override: resolvedCategory,
    type: resolvedCategory,
    description: resolvedDesc,
    url: resolvedUrl,
    image_url: resolvedImageUrl,
    compatible_versions: resolvedCompat,
    created_at: resolvedCreated,
    updated_at: resolvedUpdated,
    version: resolvedVersion,
    status:
      localOvr?.status !== undefined
        ? String(localOvr.status || "")
        : baseMod.status ||
          hydratedMeta?.status ||
          childSources.find((cs: any) => cs?.status)?.status ||
          (baseMod.isNexusView ? "stable" : ""),
    status_reason:
      localOvr?.status_reason !== undefined
        ? (localOvr.status_reason || undefined)
        : baseMod.status_reason ||
          hydratedMeta?.status_reason ||
          childSources.find((cs: any) => cs?.status_reason)?.status_reason ||
          undefined,
    compliance_tier: (() => {
      const rawTier =
        baseMod.compliance_tier ??
        hydratedMeta?.compliance_tier ??
        childSources.find((cs: any) => cs?.compliance_tier != null)?.compliance_tier ??
        0;
      return !baseMod?.isNexusView ? sanitizeComplianceTierForLocal(rawTier) : rawTier;
    })(),
    is_paid:
      localOvr?.is_paid !== undefined
        ? Boolean(localOvr.is_paid)
        : Boolean(
            baseMod.is_paid ||
            hydratedMeta?.is_paid ||
            childSources.some((cs: any) => Boolean(cs?.is_paid))
          ),
    is_early_access:
      localOvr?.is_early_access !== undefined
        ? Boolean(localOvr.is_early_access)
        : Boolean(
            baseMod.is_early_access ||
            hydratedMeta?.is_early_access ||
            childSources.some((cs: any) => Boolean(cs?.is_early_access))
          ),
    highlanderGroupId:
      baseMod.highlanderGroupId ||
      baseMod.highlander_group_id ||
      hydratedMeta?.highlanderGroupId ||
      childSources.find((cs: any) => cs?.highlanderGroupId || cs?.highlander_group_id)
        ?.highlanderGroupId ||
      undefined,
    highlanderSlotKey:
      localOvr?.highlanderSlotKey !== undefined
        ? (localOvr.highlanderSlotKey || undefined)
        : baseMod.highlanderSlotKey ||
          baseMod.highlander_slot_key ||
          hydratedMeta?.highlanderSlotKey ||
          childSources.find((cs: any) => cs?.highlanderSlotKey)?.highlanderSlotKey ||
          undefined,
    highlanderSlotName:
      localOvr?.highlanderSlotName !== undefined
        ? (localOvr.highlanderSlotName || undefined)
        : baseMod.highlanderSlotName ||
          baseMod.highlander_slot_name ||
          hydratedMeta?.highlanderSlotName ||
          childSources.find((cs: any) => cs?.highlanderSlotName)?.highlanderSlotName ||
          undefined,
    mod_versions:
      baseMod.mod_versions ||
      hydratedMeta?.mod_versions ||
      childSources.find((cs: any) => cs?.mod_versions)?.mod_versions,
    requirements:
      localOvr && Array.isArray(localOvr.requirements)
        ? localOvr.requirements
        : Array.isArray(baseMod.requirements) && baseMod.requirements.length > 0
          ? baseMod.requirements
          : Array.isArray(baseMod.requires) && baseMod.requires.length > 0
            ? baseMod.requires
            : hydratedMeta?.requirements || undefined,
    twins:
      localOvr && Array.isArray(localOvr.twins)
        ? localOvr.twins
        : Array.isArray(baseMod.twins) && baseMod.twins.length > 0
          ? baseMod.twins
          : hydratedMeta?.twins || undefined,
    ...(localOvr && Array.isArray(localOvr.requiredDLC) ? { requiredDLC: localOvr.requiredDLC } : {}),
    ...(localOvr && Array.isArray(localOvr.conflicts) ? { conflicts: localOvr.conflicts } : {}),
    ...(localOvr?.manifest_url !== undefined ? { manifest_url: localOvr.manifest_url || undefined } : {}),
    ...(localOvr?.folder_structure !== undefined ? { folder_structure: localOvr.folder_structure } : {}),
    ...(localOvr?.category_override !== undefined
      ? {
          category: localOvr.category_override,
          category_override: localOvr.category_override,
          type: localOvr.category_override,
        }
      : {}),
    ...(localOvr?.version !== undefined ? { version: String(localOvr.version || "") } : {}),
    hydratedCollectionChildren:
      hydratedMeta?.hydratedCollectionChildren ||
      baseMod.hydratedCollectionChildren ||
      undefined,
  };
}

