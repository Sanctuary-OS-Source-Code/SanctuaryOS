const lookupByHash = (
  map: Record<string, any> | null | undefined,
  hash?: string | null
): Record<string, any> | null => {
  if (!map || typeof map !== "object" || !hash) return null;
  const raw = String(hash).trim();
  if (!raw) return null;
  if (map[raw] && typeof map[raw] === "object") return map[raw];
  const lower = raw.toLowerCase();
  if (map[lower] && typeof map[lower] === "object") return map[lower];
  for (const [k, v] of Object.entries(map)) {
    if (String(k).trim().toLowerCase() === lower && v && typeof v === "object") {
      return v;
    }
  }
  return null;
};

const hasObjectKeys = (val: any): val is Record<string, any> =>
  Boolean(val && typeof val === "object" && !Array.isArray(val) && Object.keys(val).length > 0);

const pickDefined = (...candidates: any[]): any => {
  for (const cand of candidates) {
    if (cand !== undefined) return cand;
  }
  return undefined;
};

const stripUndefinedKeys = <T extends Record<string, any>>(obj: T): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

const sanitizeStatusForLocal = (status: unknown): unknown => {
  if (typeof status !== "string") return status;
  if (status.toUpperCase().includes("EXPLICIT LOCAL")) return undefined;
  return status;
};

const normalizeEdgeLogicEntry = (edgeEntry?: Record<string, any> | null): Record<string, any> => {
  if (!hasObjectKeys(edgeEntry)) return {};
  return stripUndefinedKeys({
    displayName: edgeEntry.name,
    author: edgeEntry.author,
    version: edgeEntry.version,
    url: edgeEntry.download_url !== undefined ? edgeEntry.download_url : edgeEntry.url,
    manifest_url: edgeEntry.manifest_url,
    description: edgeEntry.description,
    image_url: edgeEntry.image_url,
    requiredDLC:
      edgeEntry.required_dlc !== undefined ? edgeEntry.required_dlc : edgeEntry.requiredDLC,
    compatible_versions:
      edgeEntry.game_version !== undefined
        ? Array.isArray(edgeEntry.game_version)
          ? edgeEntry.game_version
          : edgeEntry.game_version
            ? [edgeEntry.game_version]
            : []
        : edgeEntry.compatible_versions,
    requirements: edgeEntry.requirements,
    dependencies: edgeEntry.dependencies,
    twins: edgeEntry.twins,
    conflicts: edgeEntry.conflicts,
    highlander_group: edgeEntry.highlander_group,
    exclusive_slot: edgeEntry.exclusive_slot,
    status: sanitizeStatusForLocal(edgeEntry.status),
    status_reason: edgeEntry.status_reason,
  });
};

const PORTABLE_MOD_KEYS = [
  "displayName",
  "author",
  "version",
  "url",
  "manifest_url",
  "description",
  "image_url",
  "category_override",
  "sub_type",
  "file_extension",
  "requiredDLC",
  "compatible_versions",
  "folder_structure",
  "allow_write",
  "is_paid",
  "is_early_access",
  "created_at",
  "updated_at",
  "requirements",
  "dependencies",
  "twins",
  "conflicts",
  "invisibleRivals",
  "interchangeableIds",
  "highlander_group",
  "exclusive_slot",
  "highlanderSlotKey",
  "highlanderSlotName",
  "parentName",
  "relationshipType",
  "familyId",
  "baseFamilyId",
  "status",
  "status_reason",
] as const;

export function sanitizeComplianceTierForLocal(tier: unknown): number {
  const num = Number(tier ?? 0);
  if (num === 6) return 6;
  return 0;
}

export function hasExistingClientModData(
  hash?: string | null,
  localOverrides?: Record<string, any> | null,
  edgeLogic?: Record<string, any> | null
): boolean {
  return (
    hasObjectKeys(lookupByHash(localOverrides, hash)) ||
    hasObjectKeys(lookupByHash(edgeLogic, hash))
  );
}

export function buildExportableModMetadata({
  mod,
  override,
  meta,
  edgeEntry,
  modName,
  cleanName,
}: {
  mod?: Record<string, any> | null;
  override?: Record<string, any> | null;
  meta?: Record<string, any> | null;
  edgeEntry?: Record<string, any> | null;
  modName: string;
  cleanName?: string;
}): Record<string, any> {
  const ovr = hasObjectKeys(override) ? override : {};
  const m = hasObjectKeys(meta) ? meta : {};
  const vm = hasObjectKeys(mod) ? mod : {};
  const edge = normalizeEdgeLogicEntry(edgeEntry);

  const hash = pickDefined(ovr.hash, m.hash, vm.hash);
  const resolvedImageUrl = pickDefined(
    ovr.image_url,
    ovr.imageUrl,
    edge.image_url,
    m.image_url,
    m.imageUrl,
    vm.image_url,
    vm.imageUrl
  );

  const out: Record<string, any> = {
    name: modName,
    cleanName: cleanName ?? pickDefined(m.cleanName, vm.cleanName),
    hash,
    image_url: resolvedImageUrl,
  };

  for (const key of PORTABLE_MOD_KEYS) {
    if (key === "image_url") continue;
    const rawVal = pickDefined(ovr[key], edge[key], m[key], vm[key]);
    out[key] = key === "status" ? sanitizeStatusForLocal(rawVal) : rawVal;
  }

  out.compliance_tier = sanitizeComplianceTierForLocal(
    pickDefined(ovr.compliance_tier, m.compliance_tier, vm.compliance_tier)
  );
  out.isLocalOverride = Boolean(
    hasObjectKeys(override) || m.isLocalOverride || vm.isLocalOverride
  );

  return stripUndefinedKeys(out);
}

export function mergeImportedModWithClientPriority({
  importedMod,
  targetHash,
  localOverrides,
  edgeLogic,
  existingPlaysetMeta,
}: {
  importedMod: Record<string, any> | null | undefined;
  targetHash?: string | null;
  localOverrides?: Record<string, any> | null;
  edgeLogic?: Record<string, any> | null;
  existingPlaysetMeta?: Record<string, any> | null;
}): {
  resolvedModMeta: Record<string, any>;
  shouldWriteLocalOverride: boolean;
  nextOverrideEntry: Record<string, any> | null;
} {
  const imp = hasObjectKeys(importedMod) ? { ...importedMod } : {};
  imp.compliance_tier = sanitizeComplianceTierForLocal(imp.compliance_tier);
  if (imp.status !== undefined) {
    const sanitizedStatus = sanitizeStatusForLocal(imp.status);
    if (sanitizedStatus === undefined) delete imp.status;
    else imp.status = sanitizedStatus;
  }

  const effectiveHash = String(targetHash || imp.hash || "").trim();
  const clientOvr = lookupByHash(localOverrides, effectiveHash);
  const rawClientEdge = lookupByHash(edgeLogic, effectiveHash);
  const clientEdge = normalizeEdgeLogicEntry(rawClientEdge);
  const existingPm = hasObjectKeys(existingPlaysetMeta) ? { ...existingPlaysetMeta } : {};
  if (existingPm.compliance_tier !== undefined) {
    existingPm.compliance_tier = sanitizeComplianceTierForLocal(existingPm.compliance_tier);
  }
  if (existingPm.status !== undefined) {
    const sanitizedExistingStatus = sanitizeStatusForLocal(existingPm.status);
    if (sanitizedExistingStatus === undefined) delete existingPm.status;
    else existingPm.status = sanitizedExistingStatus;
  }

  const clientHasLocalData = hasObjectKeys(clientOvr) || hasObjectKeys(rawClientEdge);

  if (clientHasLocalData) {
    const sanitizedOvr: Record<string, any> = hasObjectKeys(clientOvr) ? { ...clientOvr } : {};
    if (sanitizedOvr.compliance_tier !== undefined) {
      sanitizedOvr.compliance_tier = sanitizeComplianceTierForLocal(sanitizedOvr.compliance_tier);
    }
    if (sanitizedOvr.status !== undefined) {
      const sanitizedOvrStatus = sanitizeStatusForLocal(sanitizedOvr.status);
      if (sanitizedOvrStatus === undefined) delete sanitizedOvr.status;
      else sanitizedOvr.status = sanitizedOvrStatus;
    }

    const merged = stripUndefinedKeys({
      ...imp,
      ...stripUndefinedKeys(existingPm),
      ...clientEdge,
      ...stripUndefinedKeys(sanitizedOvr),
    });
    merged.compliance_tier = sanitizeComplianceTierForLocal(merged.compliance_tier);
    if (hasObjectKeys(clientOvr)) {
      merged.isLocalOverride = true;
    }

    return {
      resolvedModMeta: merged,
      shouldWriteLocalOverride: false,
      nextOverrideEntry: null,
    };
  }

  const resolvedModMeta = stripUndefinedKeys({
    ...imp,
    ...stripUndefinedKeys(existingPm),
  });
  resolvedModMeta.compliance_tier = sanitizeComplianceTierForLocal(
    resolvedModMeta.compliance_tier
  );

  const shouldWriteLocalOverride = Boolean(imp.isLocalOverride);
  if (!shouldWriteLocalOverride) {
    return {
      resolvedModMeta,
      shouldWriteLocalOverride: false,
      nextOverrideEntry: null,
    };
  }

  const nextOvr: Record<string, any> = {};
  for (const key of PORTABLE_MOD_KEYS) {
    if (imp[key] !== undefined) nextOvr[key] = imp[key];
  }
  if (effectiveHash) nextOvr.hash = effectiveHash;
  if (imp.name !== undefined) nextOvr.name = imp.name;
  nextOvr.compliance_tier = sanitizeComplianceTierForLocal(imp.compliance_tier);
  nextOvr.imported_from_blueprint = true;
  nextOvr.is_user_dossier = false;

  return {
    resolvedModMeta,
    shouldWriteLocalOverride: true,
    nextOverrideEntry: stripUndefinedKeys(nextOvr),
  };
}

