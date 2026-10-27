import { supabase } from "../supabase";
import { isDesktop } from "./envUtils";

export interface StagedArtifactItem {
  id: string;
  dbId?: string;
  name: string;
  displayName?: string;
  hash?: string;
  author?: string;
  master_author?: string;
  url?: string;
  version?: string;
  image_url?: string;
  category?: string;
  category_override?: string;
  type?: string;
  description?: string;
  compatible_versions?: string[];
  created_at?: string;
  updated_at?: string;
  status?: string;
  status_reason?: string;
  compliance_tier?: number;
  is_paid?: boolean;
  is_early_access?: boolean;
  requiredDLC?: string[];
  priority_tier?: string;
  load_order_index?: number;
  isDependency?: boolean;
  dependencyOf?: string;
  asset_type?: "lexicon" | "chameleon" | "workbench_template";
  asset_id?: string | number;
  language?: string;
  theme_mode?: string;
  lexicon_type?: string;
}

export interface StagedCloudPayload {
  mode: "mod_queue" | "blueprint";
  blueprintName: string;
  blueprintCode?: string;
  gameVersion?: string;
  notes?: string;
  autoEquip: boolean;
  items: StagedArtifactItem[];
  loadOrderStrategy?: "alphabetical" | "numeric_prefix" | "loadorder_txt";
  loadRules?: Record<string, string[]>;
  modTiers?: Record<string, string>;
  loadOrder?: string[];
  stagedAt: string;
  sourceDevice: string;
}

export interface ResolvedStagedArtifact extends StagedArtifactItem {
  isOwned: boolean;
  localModName?: string;
  localHash?: string;
  selected: boolean;
}

export interface ResolvedStagedPayload {
  rowId: string;
  createdAt: string;
  payload: StagedCloudPayload;
  resolvedItems: ResolvedStagedArtifact[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveUserStagingToken(userId: string, email?: string): Promise<string> {
  const raw = `sanctuary_citizen_stage_v1:${userId}:${(email || "").trim().toLowerCase()}`;
  const encoded = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveAesGcmKey(userId: string, email: string | undefined, salt: Uint8Array): Promise<CryptoKey> {
  const passphrase = `${userId}::${(email || "").trim().toLowerCase()}::sanctuary_signature_queue_v1`;
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptStagingPayload(
  payload: StagedCloudPayload,
  userId: string,
  email?: string
): Promise<{ encrypted_payload: string; iv: string; salt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(userId, email, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext
  );

  return {
    encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  };
}

export async function decryptStagingPayload(
  encrypted_payload: string,
  ivB64: string,
  saltB64: string,
  userId: string,
  email?: string
): Promise<StagedCloudPayload | null> {
  try {
    const salt = base64ToBytes(saltB64);
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(encrypted_payload);
    const key = await deriveAesGcmKey(userId, email, salt);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    const jsonStr = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(jsonStr) as StagedCloudPayload;
  } catch (err) {
    console.warn("Failed to decrypt staged payload in volatile memory:", err);
    return null;
  }
}

/**
 * Resolves child dependencies in volatile memory by querying the Spoke's
 * mod_dependencies, mod_versions, and mods tables without writing to disk.
 */
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

    const baseModIds = Array.from(modIdToSourceName.keys());
    if (baseModIds.length === 0) {
      return { mergedItems: items, addedCount: 0 };
    }

    // Expand twin relationships so if a .ts4script twin is staged, its .package twin ID is also checked as a child
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

    const stagedChildIds = Array.from(modIdToSourceName.keys());

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

export async function pushEncryptedStagingPayload(
  payload: StagedCloudPayload,
  session: any
): Promise<{ success: boolean; rowId?: string; error?: string }> {
  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" };
  }
  try {
    const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
    const { encrypted_payload, iv, salt } = await encryptStagingPayload(
      payload,
      session.user.id,
      session.user.email
    );

    // Shred any previous unapproved staging row for this user token so only the latest curated queue persists
    await supabase.from("citizen_staging_queue").delete().eq("user_token", userToken);

    const { data, error } = await supabase
      .from("citizen_staging_queue")
      .insert([
        {
          user_token: userToken,
          payload_type: payload.mode,
          encrypted_payload,
          iv,
          salt,
          item_count: payload.items.length,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      ])
      .select("id")
      .single();

    if (error) throw error;
    return { success: true, rowId: data?.id };
  } catch (err: any) {
    console.error("Failed to push encrypted staging payload:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function shredCloudStagingRow(rowId?: string, session?: any): Promise<boolean> {
  try {
    if (rowId) {
      await supabase.from("citizen_staging_queue").delete().eq("id", rowId);
    }
    if (session?.user?.id) {
      const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
      await supabase.from("citizen_staging_queue").delete().eq("user_token", userToken);
    }
    return true;
  } catch (err) {
    console.error("Failed to shred cloud staging row:", err);
    return false;
  }
}

export function getSourceDeviceLabel(): string {
  if (isDesktop()) return "Desktop Client";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "PWA / Mobile";
  return "Web / PWA Client";
}

