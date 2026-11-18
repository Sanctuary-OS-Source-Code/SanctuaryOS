import { useState } from "react";
import { HoverTooltip, getNormalizedArtifactName, VAULT_CHIP_CLASS, formatDisplayName, getExtensionRegex, getModFallbackUrl, getModIcon, handleOpenUrl, deduplicateBlueprintArtifacts, filterBlueprintModArtifacts, stripPriorityTierPrefix, isScriptExtension } from "../../shared";
import { formatCleanModTitle, formatAddonModuleName, extractValidCreator } from "../CommandIncompatiblePanel";
import { useStore } from "../../store";
import { resolveComplianceHashTiers, normalizeComplianceHash } from "../../utils/complianceHashTiers";

interface VaultLookupCacheEntry {
  localByHash: Map<string, any>;
  localByExact: Map<string, any>;
  localByFile: Map<string, any>;
  localByBase: Map<string, any>;
  virtualByFamilyId: Map<string, any>;
  parentByDbId: Map<string, any>;
}

const vaultLookupWeakCache = new WeakMap<any[], VaultLookupCacheEntry>();
let cachedNexusItemsRef: any[] | null = null;
let cachedNexusParentByHash = new Map<string, any>();
let cachedNexusParentByNorm = new Map<string, any>();

export function getOrBuildVaultLookup(allVaultMods: any[], extRegex: RegExp): VaultLookupCacheEntry {
  const existing = vaultLookupWeakCache.get(allVaultMods);
  if (existing) return existing;

  const localByHash = new Map<string, any>();
  const localByExact = new Map<string, any>();
  const localByFile = new Map<string, any>();
  const localByBase = new Map<string, any>();
  const virtualByFamilyId = new Map<string, any>();
  const parentByDbId = new Map<string, any>();

  for (const vm of allVaultMods) {
    if (!vm) continue;
    if (vm.isVirtual) {
      if (vm.dbId) virtualByFamilyId.set(String(vm.dbId).split("@")[0], vm);
      if (vm.baseFamilyId) virtualByFamilyId.set(String(vm.baseFamilyId).split("@")[0], vm);
      if (vm.familyId) virtualByFamilyId.set(String(vm.familyId).split("@")[0], vm);
      if (vm.setId) virtualByFamilyId.set(`set_${vm.setId}`, vm);
      if (Array.isArray(vm.flavors)) {
        for (const fl of vm.flavors) {
          if (!fl) continue;
          if (fl.hash && !localByHash.has(fl.hash)) localByHash.set(fl.hash, fl);
          if (fl.name) {
            const rawLow = String(fl.name).toLowerCase();
            localByExact.set(rawLow, fl);
            const fPart = (String(fl.name).split(/[\\/]/).pop() || String(fl.name)).toLowerCase();
            if (!localByFile.has(fPart)) localByFile.set(fPart, fl);
            const bPart = fPart.replace(extRegex, "").toLowerCase();
            if (bPart && !localByBase.has(bPart)) localByBase.set(bPart, fl);
          }
        }
      }
      continue;
    }
    if (vm.dbId) parentByDbId.set(String(vm.dbId), vm);
    if (vm.hash) localByHash.set(vm.hash, vm);
    if (vm.name) {
      const rawLow = String(vm.name).toLowerCase();
      localByExact.set(rawLow, vm);
      const fPart = (String(vm.name).split(/[\\/]/).pop() || String(vm.name)).toLowerCase();
      if (!localByFile.has(fPart)) localByFile.set(fPart, vm);
      const bPart = fPart.replace(extRegex, "").toLowerCase();
      if (bPart && !localByBase.has(bPart)) localByBase.set(bPart, vm);
    }
  }

  const built: VaultLookupCacheEntry = {
    localByHash,
    localByExact,
    localByFile,
    localByBase,
    virtualByFamilyId,
    parentByDbId,
  };
  vaultLookupWeakCache.set(allVaultMods, built);
  return built;
}

export function getOrBuildNexusParentLookup() {
  try {
    const nexusItems: any[] = (window as any).__sanctuaryCache?.nexus?.nexusItems || [];
    if (nexusItems === cachedNexusItemsRef) {
      return {
        nexusParentByHash: cachedNexusParentByHash,
        nexusParentByNorm: cachedNexusParentByNorm,
      };
    }
    const nexusParentByHash = new Map<string, any>();
    const nexusParentByNorm = new Map<string, any>();
    for (const ni of nexusItems) {
      if (!ni) continue;
      if ((ni.isParent || ni.isVirtual || ni.isCollection) && Array.isArray(ni.flavors)) {
        for (const fl of ni.flavors) {
          if (!fl) continue;
          if (fl.hash) nexusParentByHash.set(String(fl.hash), ni);
          if (Array.isArray(fl.mod_versions)) {
            for (const mv of fl.mod_versions) {
              if (mv?.dna_hash) nexusParentByHash.set(String(mv.dna_hash), ni);
            }
          }
          const fn = getNormalizedArtifactName(fl.name || "");
          if (fn && !nexusParentByNorm.has(fn)) nexusParentByNorm.set(fn, ni);
        }
      } else {
        if (ni.hash) nexusParentByHash.set(String(ni.hash), ni);
        if (Array.isArray(ni.mod_versions)) {
          for (const mv of ni.mod_versions) {
            if (mv?.dna_hash) nexusParentByHash.set(String(mv.dna_hash), ni);
          }
        }
      }
    }
    cachedNexusItemsRef = nexusItems;
    cachedNexusParentByHash = nexusParentByHash;
    cachedNexusParentByNorm = nexusParentByNorm;
    return { nexusParentByHash, nexusParentByNorm };
  } catch {
    return {
      nexusParentByHash: cachedNexusParentByHash,
      nexusParentByNorm: cachedNexusParentByNorm,
    };
  }
}

export interface BlueprintComplianceViolation {
  name: string;
  cleanName: string;
  hash: string;
  reason: string;
  tier: number | null;
  modId?: string;
  author?: string;
  status?: string;
}

export interface BlueprintComplianceAuditResult {
  blueprintId: any;
  isCompliant: boolean;
  violations: BlueprintComplianceViolation[];
  compliantArtifacts: any[];
  totalRawCount?: number;
}

export async function auditBlueprintsTier0Compliance(
  supabaseClient: any,
  blueprints: any[],
  options: { autoFlagInDb?: boolean; existingPendingReportBpIds?: Set<any> } = {}
): Promise<
  Map<any, BlueprintComplianceAuditResult> &
    Record<string, BlueprintComplianceAuditResult>
> {
  const results = new Map<any, BlueprintComplianceAuditResult>() as Map<
    any,
    BlueprintComplianceAuditResult
  > &
    Record<string, BlueprintComplianceAuditResult>;
  if (!Array.isArray(blueprints) || blueprints.length === 0) return results;

  const allHashesSet = new Set<string>();
  for (const bp of blueprints) {
    const rawArts =
      bp?.artifacts || bp?.json_data?.artifacts || bp?.originalBlueprint?.artifacts || [];
    if (!Array.isArray(rawArts)) continue;
    for (const art of rawArts) {
      const h = typeof art === "object" && art?.hash ? String(art.hash).trim() : "";
      if (h) allHashesSet.add(h);
    }
  }

  const verifiedHashMap = new Map<
    string,
    { id: string; name: string; author: string; complianceTier: number; status: string }
  >();
  const restrictedTierMap = new Map<string, number>();
  const allHashes = Array.from(allHashesSet);
  const chunkSize = 200;

  if (allHashes.length > 0) {
    const versionPromises: any[] = [];
    for (let i = 0; i < allHashes.length; i += chunkSize) {
      const chunk = allHashes.slice(i, i + chunkSize);
      versionPromises.push(
        supabaseClient
          .from("mod_versions")
          .select("dna_hash, mods(id, name, master_author, compliance_tier, status)")
          .in("dna_hash", chunk)
      );
    }
    const [responses, rpcTierMap] = await Promise.all([
      Promise.all(versionPromises),
      resolveComplianceHashTiers(supabaseClient, allHashes),
    ]);
    rpcTierMap.forEach((tier, normH) => {
      if (tier >= 1 && tier <= 5) {
        restrictedTierMap.set(normH, tier);
      }
    });
    for (const res of responses) {
      if (!res?.error && Array.isArray(res?.data)) {
        for (const row of res.data) {
          const dbMod = Array.isArray(row.mods) ? row.mods[0] : row.mods;
          if (row.dna_hash && dbMod?.id) {
            const cTier =
              typeof dbMod.compliance_tier === "number" ? dbMod.compliance_tier : -1;
            const normRowHash = normalizeComplianceHash(row.dna_hash);
            if (cTier >= 1 && cTier <= 4) {
              if (normRowHash) restrictedTierMap.set(normRowHash, cTier);
              continue;
            }
            verifiedHashMap.set(String(row.dna_hash), {
              id: String(dbMod.id),
              name: String(dbMod.name || ""),
              author: String(dbMod.master_author || ""),
              complianceTier: cTier,
              status: String(dbMod.status || ""),
            });
          }
        }
      }
    }
  }

  for (const bp of blueprints) {
    if (!bp) continue;
    const rawArts = deduplicateBlueprintArtifacts(
      bp.artifacts || bp.json_data?.artifacts || bp.originalBlueprint?.artifacts || []
    );
    const violations: BlueprintComplianceViolation[] = [];
    const compliantArtifacts: any[] = [];

    if (Array.isArray(rawArts)) {
      for (const art of rawArts) {
        const rawName =
          typeof art === "string" ? art : String(art?.name || art?.path || "");
        if (
          !rawName ||
          rawName.startsWith("FOLDER_") ||
          rawName.startsWith("SET_") ||
          rawName.startsWith("LOCAL_SET_")
        ) {
          continue;
        }
        const cleanName = rawName.split(/[\\/]/).pop() || rawName;
        const hash = typeof art === "object" && art?.hash ? String(art.hash).trim() : "";
        const normHash = normalizeComplianceHash(hash);
        const restrictedTier = normHash ? restrictedTierMap.get(normHash) : undefined;
        const artAuthor =
          typeof art === "object" && art?.author && String(art.author).toLowerCase() !== "unknown"
            ? String(art.author)
            : "";
        const verified = hash ? verifiedHashMap.get(hash) : undefined;
        const rawStatus = verified ? verified.status.toLowerCase().trim() : "";
        const isVerifiedStable =
          rawStatus === "stable" || rawStatus === "verified" || rawStatus === "approved";

        if (hash && typeof restrictedTier === "number" && restrictedTier >= 1) {
          violations.push({
            name: rawName,
            cleanName,
            hash,
            reason: `Tier ${restrictedTier}`,
            tier: restrictedTier,
            author: artAuthor || undefined,
          });
        } else if (!hash || !verified) {
          violations.push({
            name: rawName,
            cleanName,
            hash,
            reason: "Unknown",
            tier: null,
            author: artAuthor || undefined,
          });
        } else if (verified.complianceTier !== 0) {
          violations.push({
            name: rawName,
            cleanName: verified.name || cleanName,
            hash,
            modId: verified.id,
            author: verified.author || artAuthor || undefined,
            status: verified.status,
            reason: `Tier ${verified.complianceTier}`,
            tier: verified.complianceTier,
          });
        } else if (!isVerifiedStable) {
          const reasonLabel =
            rawStatus === "unknown" || rawStatus === ""
              ? "Unknown"
              : rawStatus === "unverified"
                ? "Unverified"
                : rawStatus === "broken" || rawStatus === "corrupted"
                  ? "Corrupted"
                  : rawStatus === "unstable"
                    ? "Unstable"
                    : rawStatus === "under_review" || rawStatus === "under review"
                      ? "Under Review"
                      : "Unverified";
          violations.push({
            name: rawName,
            cleanName: verified.name || cleanName,
            hash,
            modId: verified.id,
            author: verified.author || artAuthor || undefined,
            status: verified.status,
            reason: reasonLabel,
            tier: verified.complianceTier,
          });
        } else {
          compliantArtifacts.push(art);
        }
      }
    }

    const isCompliant = violations.length === 0;
    const auditEntry: BlueprintComplianceAuditResult = {
      blueprintId: bp.id,
      isCompliant,
      violations,
      compliantArtifacts,
      totalRawCount: violations.length + compliantArtifacts.length,
    };
    results.set(bp.id, auditEntry);
    if (bp.id !== undefined && bp.id !== null) {
      results[String(bp.id)] = auditEntry;
    }

    if (options.autoFlagInDb && !isCompliant && bp.id) {
      const alreadyFlagged = options.existingPendingReportBpIds?.has(bp.id);
      if (!alreadyFlagged) {
        try {
          const { data: existingRows } = await supabaseClient
            .from("blueprint_reports")
            .select("id")
            .eq("blueprint_id", bp.id)
            .eq("status", "pending")
            .limit(1);

          if (!existingRows || existingRows.length === 0) {
            const reasonText = `Nexus Compliance Audit: Blueprint contains ${violations.length.toLocaleString()} non-Tier-0 or unverified artifact(s). Only verified Tier 0 artifacts with Stable status are permitted in Nexus Blueprints. Review and re-upload when compliant.`;

            await supabaseClient.from("blueprint_reports").insert([
              {
                blueprint_id: bp.id,
                reporter_name: "Sanctuary OS Automated Compliance",
                reason: reasonText,
                status: "pending",
              },
            ]);
          }

          if (bp.compliance_tier === 0 || bp.is_market_listed === true) {
            await supabaseClient
              .from("blueprints")
              .update({ compliance_tier: 1, is_market_listed: false })
              .eq("id", bp.id);
          }
        } catch (err) {
          console.warn("Automated blueprint compliance flag error:", err);
        }
      }
    }
  }

  return results;
}

export function groupBlueprintArtifactsByFamily(
  rawArtifacts: any[],
  options: {
    modList?: any[];
    activeGameSchema?: any;
    localVaultHashes?: Set<string>;
    cloudEnrichmentMap?: Map<string, any>;
  } = {}
): any[] {
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length === 0) return [];

  const allVaultMods = Array.isArray(options.modList) ? options.modList : [];
  const activeGameSchema = options.activeGameSchema;
  const extRegex = getExtensionRegex(activeGameSchema);
  const localVaultHashes = options.localVaultHashes || new Set<string>();
  const cloudEnrichmentMap = options.cloudEnrichmentMap;

  const {
    localByHash,
    localByExact,
    localByFile,
    localByBase,
    virtualByFamilyId,
    parentByDbId,
  } = getOrBuildVaultLookup(allVaultMods, extRegex);

  const { nexusParentByHash, nexusParentByNorm } = getOrBuildNexusParentLookup();

  const dedupedArtifacts = filterBlueprintModArtifacts(rawArtifacts, activeGameSchema);
  const finalResult: any[] = [];

  for (let idx = 0; idx < dedupedArtifacts.length; idx++) {
    const rawItem = dedupedArtifacts[idx];
    const rawObj = typeof rawItem === "string" ? { name: rawItem } : rawItem || {};
    const rawPath = String(rawObj.name || rawObj.path || rawObj.id || "").trim();
    if (!rawPath) continue;

    const strippedPath = stripPriorityTierPrefix(rawPath, activeGameSchema);
    const filePart = rawPath.split(/[\\/]/).pop() || rawPath;
    const fileLower = filePart.toLowerCase();
    const baseLower = fileLower.replace(extRegex, "");
    const normArtifactKey = getNormalizedArtifactName(filePart);

    const matchedLocal =
      (rawObj.hash && localByHash.get(rawObj.hash)) ||
      localByExact.get(rawPath.toLowerCase()) ||
      (strippedPath ? localByExact.get(strippedPath.toLowerCase()) : undefined) ||
      localByFile.get(fileLower) ||
      (baseLower ? localByBase.get(baseLower) : undefined);

    const cloudInfo = rawObj.hash ? cloudEnrichmentMap?.get(String(rawObj.hash)) : undefined;
    const nexusParent =
      (rawObj.hash && nexusParentByHash.get(String(rawObj.hash))) ||
      (normArtifactKey ? nexusParentByNorm.get(normArtifactKey) : undefined);

    const famIdRaw = String(
      cloudInfo?.familyId ||
        rawObj.baseFamilyId ||
        rawObj.familyId ||
        matchedLocal?.baseFamilyId ||
        matchedLocal?.familyId ||
        (nexusParent && (nexusParent.isParent || nexusParent.isVirtual) ? nexusParent.id : "") ||
        ""
    ).split("@")[0];

    const hasRealFamily = Boolean(
      famIdRaw &&
        famIdRaw !== "null" &&
        famIdRaw !== "undefined" &&
        !famIdRaw.startsWith("local_")
    );

    const familyParent =
      cloudInfo?.parentMod ||
      (hasRealFamily
        ? parentByDbId.get(famIdRaw) || virtualByFamilyId.get(famIdRaw) || nexusParent
        : null);

    const collectionObj =
      cloudInfo?.collection ||
      (nexusParent?.isCollection ? nexusParent : null) ||
      (matchedLocal?.setId ? virtualByFamilyId.get(`set_${matchedLocal.setId}`) : null);

    const resolvedAuthor = extractValidCreator(
      rawObj,
      cloudInfo?.dbMod,
      cloudInfo?.parentMod,
      collectionObj,
      matchedLocal,
      familyParent,
      nexusParent
    );

    const isOwned = Boolean(
      (rawObj.hash && localVaultHashes.has(rawObj.hash)) || matchedLocal
    );

    const cleanFileDisplay = formatDisplayName(
      matchedLocal?.displayName || filePart,
      undefined,
      activeGameSchema
    ).trim();
    const cleanModuleTitle = formatCleanModTitle(cleanFileDisplay) || cleanFileDisplay;

    const finalAuthor = resolvedAuthor || undefined;

    const modEntry: any = {
      ...(familyParent && !familyParent.isVirtual ? familyParent : {}),
      ...(matchedLocal || {}),
      ...(cloudInfo?.dbMod || {}),
      ...rawObj,
      id: rawObj.id || cloudInfo?.dbMod?.id || matchedLocal?.dbId || rawObj.hash || `${filePart}_${idx}`,
      dbId: cloudInfo?.dbMod?.id || matchedLocal?.dbId || rawObj.dbId,
      hash: rawObj.hash || matchedLocal?.hash,
      name: cleanModuleTitle,
      displayName: cleanModuleTitle,
      _groupedTitle: cleanModuleTitle,
      _rawFirstPath: rawPath,
      _cleanFilePart: filePart,
      _cleanModuleTitle: cleanModuleTitle,
      _isOwned: isOwned,
      _moduleCount: 1,
      _ownedCount: isOwned ? 1 : 0,
      _allOwned: isOwned,
      author: finalAuthor,
      master_author: finalAuthor,
      url:
        rawObj.url ||
        cloudInfo?.downloadUrl ||
        cloudInfo?.dbMod?.url ||
        cloudInfo?.parentMod?.url ||
        collectionObj?.url ||
        matchedLocal?.url ||
        familyParent?.url ||
        nexusParent?.url,
      image_url:
        rawObj.image_url ||
        cloudInfo?.dbMod?.image_url ||
        cloudInfo?.parentMod?.image_url ||
        collectionObj?.image_url ||
        matchedLocal?.image_url ||
        matchedLocal?.imageUrl ||
        familyParent?.image_url ||
        nexusParent?.image_url,
      version:
        rawObj.version ||
        cloudInfo?.versionLabel ||
        matchedLocal?.version,
      is_paid: Boolean(
        rawObj.is_paid ||
          cloudInfo?.dbMod?.is_paid ||
          cloudInfo?.parentMod?.is_paid ||
          nexusParent?.is_paid
      ),
      is_early_access: Boolean(
        rawObj.is_early_access ||
          cloudInfo?.dbMod?.is_early_access ||
          cloudInfo?.parentMod?.is_early_access ||
          nexusParent?.is_early_access
      ),
      load_order_index:
        typeof rawObj.load_order_index === "number" ? rawObj.load_order_index : idx,
      priority_tier: rawObj.priority_tier,
      load_rules: rawObj.load_rules,
      isCollection: Boolean(rawObj.isCollection || matchedLocal?.isCollection),
      isParent: false,
      _groupKey: `${fileLower}_${idx}`,
    };
    modEntry._groupedMods = [modEntry];

    finalResult.push(modEntry);
  }

  return finalResult;
}

export function BlueprintInspectorModCard({
  mod,
  onOpenDossier,
  activeGameSchema,
  t,
  showLoadOrderChip = false,
  onUnequip,
  unequipTooltip,
  statusBadge,
}: {
  mod: any;
  onOpenDossier?: (mod: any) => void;
  activeGameSchema?: any;
  t: (key: string, fallback?: string) => string;
  showLoadOrderChip?: boolean;
  onUnequip?: (e: React.MouseEvent) => void;
  unequipTooltip?: string;
  statusBadge?: {
    label: string;
    icon: string;
    iconColorClass?: string;
  };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showImages = useStore((state: any) => state.showImages);

  const groupedMods: any[] =
    Array.isArray(mod._groupedMods) && mod._groupedMods.length > 0
      ? mod._groupedMods
      : [mod];

  const rawTitle =
    mod._groupedTitle ||
    formatDisplayName(mod.displayName || mod.name || "", undefined, activeGameSchema);
  const title = formatCleanModTitle(rawTitle) || rawTitle;

  const image =
    showImages &&
    (mod.image_url || mod.imageUrl) &&
    String(mod.image_url || mod.imageUrl) !== "null" &&
    String(mod.image_url || mod.imageUrl).trim() !== ""
      ? mod.image_url || mod.imageUrl
      : undefined;

  const modIcon = getModIcon(mod, activeGameSchema, t);
  const validCreator = extractValidCreator(mod, ...groupedMods);

  const hasScriptFile = groupedMods.some((gm) =>
    isScriptExtension(String(gm?._cleanFilePart || gm?.name || ""), activeGameSchema)
  );
  const typeLabel = mod.isCollection
    ? t("collection", "Collection")
    : groupedMods.length > 1
      ? t("suite_label", "Suite")
      : hasScriptFile
        ? t("type_script", "Script")
        : t("type_package", "Module");

  const hasRealVersion = Boolean(
    mod.version &&
      String(mod.version).trim() !== "" &&
      String(mod.version).toLowerCase() !== "v.local" &&
      String(mod.version).toLowerCase() !== "vlocal" &&
      String(mod.version).toLowerCase() !== "local" &&
      String(mod.version).toLowerCase() !== "unknown"
  );
  const cleanVer = hasRealVersion
    ? String(mod.version).replace(/^v\.?/i, "").trim()
    : null;

  const ownedCount =
    typeof mod._ownedCount === "number"
      ? mod._ownedCount
      : groupedMods.filter((gm) => gm._isOwned).length;
  const allOwned = ownedCount >= groupedMods.length && groupedMods.length > 0;

  const targetUrl = getModFallbackUrl(
    title || mod._cleanFilePart || mod.name || "",
    mod.hash,
    activeGameSchema,
    { url: mod.url, author: validCreator || undefined }
  );

  const seqNum =
    typeof mod.load_order_index === "number" ? mod.load_order_index + 1 : null;

  return (
    <div
      onClick={() => {
        if (!onOpenDossier && groupedMods.length > 1) {
          setIsExpanded((prev) => !prev);
          return;
        }
        onOpenDossier?.({
          ...mod,
          name: mod._rawFirstPath || mod.name,
          displayName: title,
          flavors: groupedMods.length > 1 ? groupedMods : undefined,
          isParent: groupedMods.length > 1,
          isVirtual: groupedMods.length > 1 ? true : mod.isVirtual,
          isNexusView: true,
        });
      }}
      className={`glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex flex-col justify-between gap-3 transition-all duration-200 cursor-pointer group relative ${
        isExpanded && groupedMods.length > 1 ? "md:col-span-2" : ""
      }`}
    >
      {/* Top Tier: Icon Well + Clean Title + Creator & Module Metadata */}
      <div className="flex items-center gap-3 min-w-0 w-full">
        {image ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
            <img src={image} alt={title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
            <span className="material-symbols-outlined !text-[20px]">{modIcon}</span>
          </div>
        )}

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="relative group/modtitle flex items-center min-w-0 w-fit max-w-full">
            <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
              {title}
            </span>
            <HoverTooltip className="z-[100]" title={title} icon={modIcon} />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
            {validCreator && (
              <>
                <span className="truncate opacity-85">
                  {formatCleanModTitle(validCreator)}
                </span>
                <span className="opacity-40 shrink-0">•</span>
              </>
            )}
            <span className="opacity-85 shrink-0">{typeLabel}</span>
            {groupedMods.length > 1 && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="opacity-85 shrink-0">
                  {groupedMods.length} {t("badge_modules_count", "Modules")}
                </span>
              </>
            )}
            {cleanVer && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-mono text-[10px] font-bold text-[var(--subtext)] opacity-85 shrink-0">
                  v{cleanVer}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Status Badges on Left | Compact Action Buttons on Right */}
      <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {showLoadOrderChip && seqNum !== null && (
            <span className={`${VAULT_CHIP_CLASS} tabular-nums`}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_tag", "tag")}
              </span>
              <span>#{String(seqNum).padStart(3, "0")}</span>
            </span>
          )}

          {statusBadge ? (
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] shrink-0 ${
                  statusBadge.iconColorClass || "text-[var(--warning)]"
                }`}
              >
                {statusBadge.icon}
              </span>
              <span>{statusBadge.label}</span>
            </span>
          ) : allOwned ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                {t("icon_check_circle", "check_circle")}
              </span>
              <span>{t("status_in_vault", "In {Vault}")}</span>
            </span>
          ) : ownedCount > 0 ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                {t("icon_timelapse", "timelapse")}
              </span>
              <span>
                {ownedCount}/{groupedMods.length} {t("status_in_vault", "In {Vault}")}
              </span>
            </span>
          ) : (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_download", "download")}
              </span>
              <span>{t("sig_queue_badge_missing", "Acquire")}</span>
            </span>
          )}

          {mod.is_early_access && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                {t("icon_science", "science")}
              </span>
              <span>{t("badge_early_access", "Early Access")}</span>
            </span>
          )}

          {mod.is_paid && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                {t("icon_monetization_on", "monetization_on")}
              </span>
              <span>{t("badge_paid", "Paid")}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {groupedMods.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`relative group/actionbtn w-7 h-7 rounded-lg glass-surface border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_account_tree", "account_tree")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={`${groupedMods.length} ${t("badge_modules_count", "Modules")}`}
                icon={t("icon_account_tree", "account_tree")}
              />
            </button>
          )}

          {onUnequip && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnequip(e);
              }}
              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[15px]">
                {t("icon_remove_circle_outline", "remove_circle_outline")}
              </span>
              <HoverTooltip
                className="z-[100] !right-0 !translate-x-0 !left-auto"
                title={unequipTooltip || t("remove_from_blueprint", "Remove from {Blueprint}")}
                icon={t("icon_remove_circle_outline", "remove_circle_outline")}
                variant="danger"
              />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenUrl(targetUrl);
            }}
            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_open_in_new", "open_in_new")}
            </span>
            <HoverTooltip
              className="z-[100] !right-0 !translate-x-0 !left-auto"
              title={t("import_intel", "Open Creator Page")}
              icon={t("icon_open_in_new", "open_in_new")}
            />
          </button>
        </div>
      </div>

      {/* Recessed Linked Modules Drawer */}
      {isExpanded && groupedMods.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="max-h-[210px] overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {groupedMods.map((gm: any, gIdx: number) => {
                const gmName =
                  gm._cleanModuleTitle ||
                  formatAddonModuleName(gm, activeGameSchema) ||
                  formatCleanModTitle(
                    formatDisplayName(
                      gm._cleanFilePart || gm.displayName || gm.name || "",
                      undefined,
                      activeGameSchema
                    )
                  );
                const gmIsScript = isScriptExtension(
                  String(gm?._cleanFilePart || gm?.name || ""),
                  activeGameSchema
                );
                const gmOwned = Boolean(gm._isOwned);

                return (
                  <div
                    key={`${gm.hash || gm.name || gIdx}-${gIdx}`}
                    onClick={() =>
                      onOpenDossier?.({
                        ...gm,
                        name: gm.name,
                        displayName: gmName,
                        isNexusView: true,
                      })
                    }
                    className="glass-surface rounded-lg px-3 py-2 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-between gap-2 transition-all cursor-pointer group/gm"
                  >
                    <div className="relative group/gmtitle flex items-center gap-2 min-w-0 flex-1">
                      <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                        {gmIsScript
                          ? t("icon_terminal", "terminal")
                          : t("icon_deployed_code", "deployed_code")}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)] group-hover/gm:text-[var(--accent)] transition-colors truncate">
                        {gmName}
                      </span>
                      <HoverTooltip
                        className="z-[100]"
                        title={gmName}
                        icon={
                          gmIsScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")
                        }
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-semibold text-[var(--subtext)] opacity-70">
                        {gmIsScript
                          ? t("type_script", "Script")
                          : t("type_package", "Module")}
                      </span>
                      <span
                        className={`material-symbols-outlined !text-[13px] ${
                          gmOwned
                            ? "text-[var(--success)]"
                            : "text-[var(--subtext)] opacity-45"
                        }`}
                      >
                        {gmOwned
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_download", "download")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

