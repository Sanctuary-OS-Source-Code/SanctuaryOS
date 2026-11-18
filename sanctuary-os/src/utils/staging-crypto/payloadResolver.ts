import { supabase } from "../../supabase";
import type { StagedArtifactItem, VaultCompanionArtifact, VaultCompanionDesktopBlueprint } from "./types";

export async function resolvePayloadDependencies(
  items: StagedArtifactItem[]
): Promise<{ mergedItems: StagedArtifactItem[]; addedCount: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { mergedItems: [], addedCount: 0 };
  }

  try {
    const existingKeys = new Set<string>();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Map of staged DB mod_id -> display name of the staged child mod
    const modIdToSourceName = new Map<string, string>();
    const idsToLookup: string[] = [];
    const hashesToLookup: string[] = [];
    const namesToLookup: string[] = [];

    const dbModById = new Map<string, any>();
    const dbModByName = new Map<string, any>();
    const dbModByHash = new Map<string, any>();

    const MOD_SELECT_FIELDS =
      "id, name, created_at, category_override, master_author, compliance_tier, image_url, description, url, compatible_versions, requiredDLC, status, status_reason, is_paid, is_early_access, mod_versions(dna_hash, version_label, created_at)";

    const registerDbMod = (modRow: any, explicitHash?: string) => {
      if (!modRow?.id) return;
      dbModById.set(String(modRow.id), modRow);
      if (modRow.name) {
        dbModByName.set(String(modRow.name).toLowerCase(), modRow);
      }
      if (explicitHash) {
        dbModByHash.set(String(explicitHash).toLowerCase(), modRow);
      }
      if (Array.isArray(modRow.mod_versions)) {
        modRow.mod_versions.forEach((mv: any) => {
          if (mv?.dna_hash) {
            dbModByHash.set(String(mv.dna_hash).toLowerCase(), modRow);
          }
        });
      }
    };

    items.forEach((item) => {
      if (item.id) existingKeys.add(item.id.toLowerCase());
      if (item.hash) existingKeys.add(item.hash.toLowerCase());
      if (item.name) existingKeys.add(item.name.toLowerCase());

      const label = item.displayName || item.name || "";
      const candidateId = item.dbId || item.id;
      if (candidateId && uuidRegex.test(String(candidateId))) {
        modIdToSourceName.set(String(candidateId), label);
        idsToLookup.push(String(candidateId));
      }
      if (item.hash) {
        hashesToLookup.push(item.hash);
      }
      if (item.name && !item.asset_type) {
        namesToLookup.push(item.name);
      }
    });

    if (idsToLookup.length > 0) {
      const { data: idData } = await supabase
        .from("mods")
        .select(MOD_SELECT_FIELDS)
        .in("id", Array.from(new Set(idsToLookup)).slice(0, 60));

      if (Array.isArray(idData)) {
        idData.forEach((row: any) => registerDbMod(row));
      }
    }

    if (hashesToLookup.length > 0) {
      const { data: vData } = await supabase
        .from("mod_versions")
        .select(`mod_id, dna_hash, mods(${MOD_SELECT_FIELDS})`)
        .in("dna_hash", Array.from(new Set(hashesToLookup)).slice(0, 60));

      if (Array.isArray(vData)) {
        vData.forEach((row: any) => {
          if (row.mod_id) {
            existingKeys.add(String(row.mod_id).toLowerCase());
            const modRef = Array.isArray(row.mods) ? row.mods[0] : row.mods;
            if (modRef) registerDbMod(modRef, row.dna_hash);
            if (!modIdToSourceName.has(row.mod_id)) {
              modIdToSourceName.set(row.mod_id, modRef?.name || row.dna_hash);
            }
          }
        });
      }
    }

    if (namesToLookup.length > 0) {
      const { data: nData } = await supabase
        .from("mods")
        .select(MOD_SELECT_FIELDS)
        .in("name", Array.from(new Set(namesToLookup)).slice(0, 60));

      if (Array.isArray(nData)) {
        nData.forEach((row: any) => {
          if (row.id) {
            registerDbMod(row);
            existingKeys.add(String(row.id).toLowerCase());
            if (!modIdToSourceName.has(row.id)) {
              modIdToSourceName.set(row.id, row.name);
            }
          }
        });
      }
    }

    const baseModIds = Array.from(modIdToSourceName.keys()).slice(0, 60);
    if (baseModIds.length === 0) {
      return { mergedItems: items, addedCount: 0 };
    }

    // Expand twin relationships so if a companion script twin is staged, its module twin ID is also checked as a child
    const { data: twinRows } = await supabase
      .from("mod_relationships")
      .select("parent_id, child_id")
      .eq("relationship_type", "twin")
      .or(
        `parent_id.in.(${baseModIds.join(",")}),child_id.in.(${baseModIds.join(",")})`
      );

    if (Array.isArray(twinRows)) {
      twinRows.forEach((tr: any) => {
        if (tr.parent_id && tr.child_id) {
          if (modIdToSourceName.has(tr.parent_id) && !modIdToSourceName.has(tr.child_id)) {
            modIdToSourceName.set(tr.child_id, modIdToSourceName.get(tr.parent_id)!);
            existingKeys.add(String(tr.child_id).toLowerCase());
          } else if (modIdToSourceName.has(tr.child_id) && !modIdToSourceName.has(tr.parent_id)) {
            modIdToSourceName.set(tr.parent_id, modIdToSourceName.get(tr.child_id)!);
            existingKeys.add(String(tr.parent_id).toLowerCase());
          }
        }
      });
    }

    const stagedChildIds = Array.from(modIdToSourceName.keys()).slice(0, 60);

    // Query where the staged mod is the child (dependent/addon/flavor) and parent_id is the master/framework mod!
    const [{ data: depRows }, { data: relRows }] = await Promise.all([
      supabase
        .from("mod_dependencies")
        .select("parent_id, child_id, dependency_name, dependency_url")
        .in("child_id", stagedChildIds),
      supabase
        .from("mod_relationships")
        .select("parent_id, child_id, relationship_type")
        .in("relationship_type", ["addon", "flavor", "set_item", "beta"])
        .in("child_id", stagedChildIds),
    ]);

    const addonRows = (relRows || []).filter((r: any) => r.relationship_type === "addon");
    const allDepRows = [...(depRows || []), ...addonRows];

    // Map of child_id -> parent_id so child flavors/addons can inherit missing metadata (author, description, category, dates) from their parent suite
    const childToParentId = new Map<string, string>();
    [...(depRows || []), ...(relRows || [])].forEach((row: any) => {
      if (row.child_id && row.parent_id && row.parent_id !== row.child_id) {
        if (!childToParentId.has(row.child_id)) {
          childToParentId.set(row.child_id, row.parent_id);
        }
      }
    });

    // Map of required parent mod_id -> child mod name that requires it (e.g. MC CMD CENTER id -> "MC WOOHOO")
    const requiredParentToChildName = new Map<string, string>();
    const missingParentIds = new Set<string>();
    const externalDeps: StagedArtifactItem[] = [];

    allDepRows.forEach((row: any) => {
      const sourceChildName = modIdToSourceName.get(row.child_id);
      const requiredParentId = row.parent_id;

      if (requiredParentId && requiredParentId !== row.child_id) {
        if (sourceChildName && !requiredParentToChildName.has(requiredParentId)) {
          requiredParentToChildName.set(requiredParentId, sourceChildName);
        }
        if (!existingKeys.has(String(requiredParentId).toLowerCase())) {
          missingParentIds.add(requiredParentId);
        }
      } else if (!requiredParentId && row.dependency_name) {
        const key = String(row.dependency_name).toLowerCase();
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          externalDeps.push({
            id: `dep_${row.dependency_name}`,
            name: row.dependency_name,
            displayName: row.dependency_name,
            url: row.dependency_url || "",
            author: "Creator Dependency",
            priority_tier: "1_Core",
            isDependency: true,
            dependencyOf: sourceChildName || undefined,
          });
        }
      }
    });

    // Fetch metadata for all required parent mods + any parent suites needed for metadata inheritance
    const allParentIdsToFetch = Array.from(
      new Set([
        ...Array.from(requiredParentToChildName.keys()),
        ...Array.from(childToParentId.values()),
      ])
    );
    const requiredParentNameToChildName = new Map<string, string>();
    const resolvedDbDeps: StagedArtifactItem[] = [];

    if (allParentIdsToFetch.length > 0) {
      const { data: depMods } = await supabase
        .from("mods")
        .select(MOD_SELECT_FIELDS)
        .in("id", allParentIdsToFetch);

      if (Array.isArray(depMods)) {
        depMods.forEach((dm: any) => {
          registerDbMod(dm);
          const childName = requiredParentToChildName.get(dm.id);
          const dmNameLow = String(dm.name || "").toLowerCase();
          if (dmNameLow && childName && dmNameLow !== childName.toLowerCase()) {
            requiredParentNameToChildName.set(dmNameLow, childName);
          }

          if (!missingParentIds.has(dm.id)) return;

          const latestVer =
            Array.isArray(dm.mod_versions) && dm.mod_versions.length > 0
              ? dm.mod_versions[0]
              : null;
          const dmHash = latestVer?.dna_hash || "";
          if (
            existingKeys.has(String(dm.id).toLowerCase()) ||
            (dmHash && existingKeys.has(dmHash.toLowerCase())) ||
            existingKeys.has(dmNameLow)
          ) {
            return;
          }
          existingKeys.add(String(dm.id).toLowerCase());
          if (dmHash) existingKeys.add(dmHash.toLowerCase());
          if (dmNameLow) existingKeys.add(dmNameLow);

          resolvedDbDeps.push({
            id: dm.id,
            dbId: dm.id,
            name: dm.name,
            displayName: dm.name,
            hash: dmHash,
            author: dm.master_author || "",
            master_author: dm.master_author || "",
            url: dm.url || "",
            version: latestVer?.version_label || "",
            image_url: dm.image_url || "",
            category: dm.category_override || "",
            category_override: dm.category_override || "",
            type: dm.category_override || "",
            description: dm.description || "",
            compatible_versions: Array.isArray(dm.compatible_versions)
              ? dm.compatible_versions
              : [],
            created_at: dm.created_at || latestVer?.created_at || undefined,
            updated_at: latestVer?.created_at || dm.created_at || undefined,
            status: dm.status || "stable",
            status_reason: dm.status_reason || undefined,
            compliance_tier: dm.compliance_tier ?? 0,
            requiredDLC: Array.isArray(dm.requiredDLC) ? dm.requiredDLC : [],
            is_paid: !!dm.is_paid,
            is_early_access: !!dm.is_early_access,
            priority_tier: "1_Core",
            isDependency: true,
            dependencyOf: childName,
          });
        });
      }
    }

    // Heal existing items in-place:
    // 1. Hydrate missing DB metadata (author, description, category, dates, status, versions) from the item's DB row or its parent suite row.
    // 2. If an existing item IS a required parent (e.g. MC CMD CENTER when MC WOOHOO is also staged), mark it isDependency=true, dependencyOf="MC WOOHOO", priority_tier="1_Core".
    // 3. If an existing item was falsely marked isDependency=true by an old inverted query, strip the false badge.
    const healedExistingItems = items.map((item) => {
      if (item.asset_type) return item;

      const itemIdStr = String(item.dbId || item.id || "");
      const itemHashLow = String(item.hash || "").toLowerCase();
      const itemNameLow = String(item.name || item.displayName || "").toLowerCase();

      const matchedMod =
        dbModById.get(itemIdStr) ||
        (itemHashLow ? dbModByHash.get(itemHashLow) : undefined) ||
        (itemNameLow ? dbModByName.get(itemNameLow) : undefined);

      const resolvedDbId =
        matchedMod?.id || (uuidRegex.test(itemIdStr) ? itemIdStr : item.dbId);
      const parentId = resolvedDbId ? childToParentId.get(String(resolvedDbId)) : undefined;
      const parentMod = parentId ? dbModById.get(String(parentId)) : undefined;

      const latestVer =
        Array.isArray(matchedMod?.mod_versions) && matchedMod.mod_versions.length > 0
          ? matchedMod.mod_versions[0]
          : null;
      const parentLatestVer =
        Array.isArray(parentMod?.mod_versions) && parentMod.mod_versions.length > 0
          ? parentMod.mod_versions[0]
          : null;

      const resolvedAuthor =
        item.author ||
        item.master_author ||
        matchedMod?.master_author ||
        parentMod?.master_author ||
        "";
      const resolvedCategory =
        item.category_override ||
        item.category ||
        item.type ||
        matchedMod?.category_override ||
        parentMod?.category_override ||
        "";
      const resolvedDesc =
        item.description ||
        matchedMod?.description ||
        parentMod?.description ||
        "";
      const resolvedCompat =
        Array.isArray(item.compatible_versions) && item.compatible_versions.length > 0
          ? item.compatible_versions
          : Array.isArray(matchedMod?.compatible_versions) &&
              matchedMod.compatible_versions.length > 0
            ? matchedMod.compatible_versions
            : Array.isArray(parentMod?.compatible_versions)
              ? parentMod.compatible_versions
              : [];
      const resolvedCreatedAt =
        item.created_at ||
        matchedMod?.created_at ||
        latestVer?.created_at ||
        parentMod?.created_at ||
        undefined;
      const resolvedUpdatedAt =
        item.updated_at ||
        latestVer?.created_at ||
        matchedMod?.created_at ||
        parentLatestVer?.created_at ||
        parentMod?.created_at ||
        undefined;
      const resolvedStatus =
        item.status || matchedMod?.status || parentMod?.status || "stable";

      const hydratedItem: StagedArtifactItem = {
        ...item,
        dbId: resolvedDbId,
        hash: item.hash || latestVer?.dna_hash || "",
        author: resolvedAuthor,
        master_author: resolvedAuthor,
        url: item.url || matchedMod?.url || parentMod?.url || "",
        version:
          item.version ||
          latestVer?.version_label ||
          parentLatestVer?.version_label ||
          "",
        image_url: item.image_url || matchedMod?.image_url || parentMod?.image_url || "",
        category: resolvedCategory,
        category_override: resolvedCategory,
        type: resolvedCategory,
        description: resolvedDesc,
        compatible_versions: resolvedCompat,
        created_at: resolvedCreatedAt,
        updated_at: resolvedUpdatedAt,
        status: resolvedStatus,
        status_reason:
          item.status_reason ||
          matchedMod?.status_reason ||
          parentMod?.status_reason ||
          undefined,
        compliance_tier:
          item.compliance_tier ??
          matchedMod?.compliance_tier ??
          parentMod?.compliance_tier ??
          0,
        requiredDLC:
          Array.isArray(item.requiredDLC) && item.requiredDLC.length > 0
            ? item.requiredDLC
            : Array.isArray(matchedMod?.requiredDLC) && matchedMod.requiredDLC.length > 0
              ? matchedMod.requiredDLC
              : Array.isArray(parentMod?.requiredDLC)
                ? parentMod.requiredDLC
                : [],
      };

      const neededByChild =
        (resolvedDbId ? requiredParentToChildName.get(String(resolvedDbId)) : undefined) ||
        requiredParentToChildName.get(itemIdStr) ||
        requiredParentNameToChildName.get(itemNameLow);

      if (neededByChild && neededByChild.toLowerCase() !== itemNameLow) {
        return {
          ...hydratedItem,
          priority_tier: "1_Core",
          isDependency: true,
          dependencyOf: neededByChild,
        };
      }

      if (hydratedItem.isDependency && !itemIdStr.startsWith("dep_")) {
        return {
          ...hydratedItem,
          isDependency: false,
          dependencyOf: undefined,
        };
      }

      return hydratedItem;
    });

    const newDeps = [...resolvedDbDeps, ...externalDeps];
    // Prepend newly resolved Core dependencies ahead of dependent child mods
    const combined = [...newDeps, ...healedExistingItems].map((it, idx) => ({
      ...it,
      load_order_index: idx,
    }));

    return {
      mergedItems: combined,
      addedCount: newDeps.length,
    };
  } catch (err) {
    console.warn("Dependency resolution in volatile memory encountered non-fatal error:", err);
    return { mergedItems: items, addedCount: 0 };
  }
}

const MOBILE_BP_EDITS_KEY = "sanctuary_mobile_blueprint_edits";

interface MobileBlueprintEditRecord {
  blueprintName: string;
  addedItems: StagedArtifactItem[];
  removedItems: StagedArtifactItem[];
  editedAt: string;
}

export function normalizeBpKey(name?: string | null): string {
  return String(name || "")
    .replace(/\s*\(imported\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

export function recordMobileBlueprintEdit(
  blueprintName: string,
  addedItems: StagedArtifactItem[] = [],
  removedItems: StagedArtifactItem[] = []
): void {
  const key = normalizeBpKey(blueprintName);
  if (!key) return;
  try {
    const raw = localStorage.getItem(MOBILE_BP_EDITS_KEY);
    const map: Record<string, MobileBlueprintEditRecord> = raw ? JSON.parse(raw) : {};
    const prev = map[key];
    const getModKey = (m: any) =>
      String(m?.dbId || m?.hash || m?.id || m?.name || m?.displayName || "")
        .trim()
        .toLowerCase();

    const nextAddedMap = new Map<string, StagedArtifactItem>();
    const nextRemovedMap = new Map<string, StagedArtifactItem>();

    (prev?.addedItems || []).forEach((it) => {
      const k = getModKey(it);
      if (k) nextAddedMap.set(k, it);
    });
    (prev?.removedItems || []).forEach((it) => {
      const k = getModKey(it);
      if (k) nextRemovedMap.set(k, it);
    });

    addedItems.forEach((it) => {
      const k = getModKey(it);
      if (!k) return;
      nextRemovedMap.delete(k);
      nextAddedMap.set(k, it);
    });
    removedItems.forEach((it) => {
      const k = getModKey(it);
      if (!k) return;
      nextAddedMap.delete(k);
      nextRemovedMap.set(k, it);
    });

    map[key] = {
      blueprintName,
      addedItems: Array.from(nextAddedMap.values()),
      removedItems: Array.from(nextRemovedMap.values()),
      editedAt: new Date().toISOString(),
    };
    localStorage.setItem(MOBILE_BP_EDITS_KEY, JSON.stringify(map));
  } catch {}
}

export function clearMobileBlueprintEdit(blueprintName?: string | null): void {
  try {
    if (!blueprintName) {
      localStorage.removeItem(MOBILE_BP_EDITS_KEY);
      return;
    }
    const key = normalizeBpKey(blueprintName);
    const raw = localStorage.getItem(MOBILE_BP_EDITS_KEY);
    if (!raw) return;
    const map: Record<string, MobileBlueprintEditRecord> = JSON.parse(raw);
    delete map[key];
    localStorage.setItem(MOBILE_BP_EDITS_KEY, JSON.stringify(map));
  } catch {}
}

export function applyMobileEditsToBlueprints(
  blueprints: VaultCompanionDesktopBlueprint[],
  snapshotSyncedAt?: string
): VaultCompanionDesktopBlueprint[] {
  if (!Array.isArray(blueprints) || blueprints.length === 0) return blueprints;
  try {
    const raw = localStorage.getItem(MOBILE_BP_EDITS_KEY);
    if (!raw) return blueprints;
    const map: Record<string, MobileBlueprintEditRecord> = JSON.parse(raw);
    if (!map || Object.keys(map).length === 0) return blueprints;

    const syncedTime = snapshotSyncedAt ? new Date(snapshotSyncedAt).getTime() : 0;
    let mapChanged = false;

    const result = blueprints.map((bp) => {
      const key = normalizeBpKey(bp.name);
      const record = map[key];
      if (!record) return bp;

      const editedTime = record.editedAt ? new Date(record.editedAt).getTime() : 0;
      if (syncedTime > 0 && editedTime > 0 && syncedTime > editedTime + 2000) {
        delete map[key];
        mapChanged = true;
        return bp;
      }

      const removedKeys = new Set<string>();
      (record.removedItems || []).forEach((rem) => {
        if (rem.dbId) removedKeys.add(`id:${String(rem.dbId).toLowerCase()}`);
        if (rem.hash) removedKeys.add(`hash:${String(rem.hash).toLowerCase()}`);
        if (rem.name) removedKeys.add(`name:${String(rem.name).toLowerCase()}`);
        if (rem.displayName) removedKeys.add(`name:${String(rem.displayName).toLowerCase()}`);
      });

      const baseArtifacts = Array.isArray(bp.artifacts) ? bp.artifacts : [];
      const filteredArtifacts = baseArtifacts.filter((art) => {
        const idK = art.dbId ? `id:${String(art.dbId).toLowerCase()}` : "";
        const hashK = art.hash ? `hash:${String(art.hash).toLowerCase()}` : "";
        const nameK = art.name ? `name:${String(art.name).toLowerCase()}` : "";
        const dispK = art.displayName ? `name:${String(art.displayName).toLowerCase()}` : "";
        return !(
          (idK && removedKeys.has(idK)) ||
          (hashK && removedKeys.has(hashK)) ||
          (nameK && removedKeys.has(nameK)) ||
          (dispK && removedKeys.has(dispK))
        );
      });

      const existingKeys = new Set<string>();
      filteredArtifacts.forEach((art) => {
        if (art.dbId) existingKeys.add(`id:${String(art.dbId).toLowerCase()}`);
        if (art.hash) existingKeys.add(`hash:${String(art.hash).toLowerCase()}`);
        if (art.name) existingKeys.add(`name:${String(art.name).toLowerCase()}`);
        if (art.displayName) existingKeys.add(`name:${String(art.displayName).toLowerCase()}`);
      });

      const addedCompanionArtifacts: VaultCompanionArtifact[] = [];
      (record.addedItems || []).forEach((add) => {
        if (add.asset_type) return;
        const idK = add.dbId ? `id:${String(add.dbId).toLowerCase()}` : "";
        const hashK = add.hash ? `hash:${String(add.hash).toLowerCase()}` : "";
        const nameK = add.name ? `name:${String(add.name).toLowerCase()}` : "";
        const dispK = add.displayName ? `name:${String(add.displayName).toLowerCase()}` : "";
        if (
          (idK && existingKeys.has(idK)) ||
          (hashK && existingKeys.has(hashK)) ||
          (nameK && existingKeys.has(nameK)) ||
          (dispK && existingKeys.has(dispK))
        ) {
          return;
        }
        if (idK) existingKeys.add(idK);
        if (hashK) existingKeys.add(hashK);
        if (nameK) existingKeys.add(nameK);
        addedCompanionArtifacts.push({
          hash: add.hash || add.id || add.name,
          dbId: add.dbId,
          name: add.name,
          displayName: add.displayName || add.name,
          author: add.author || add.master_author,
          version: add.version,
          status: add.status || "stable",
          isEquipped: Boolean(bp.isActive),
          url: add.url,
          category: add.category_override || add.category,
        });
      });

      const mergedArtifacts = [...filteredArtifacts, ...addedCompanionArtifacts];
      return {
        ...bp,
        artifacts: mergedArtifacts,
        modsCount: mergedArtifacts.length,
      };
    });

    if (mapChanged) {
      localStorage.setItem(MOBILE_BP_EDITS_KEY, JSON.stringify(map));
    }
    return result;
  } catch {
    return blueprints;
  }
}

