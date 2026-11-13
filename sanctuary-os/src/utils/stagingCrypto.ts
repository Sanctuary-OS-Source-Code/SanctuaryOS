import { supabase, supabaseAuth } from "../supabase";
import { isDesktop, isLinuxDesktop } from "./envUtils";
import { packageBlueprintLoadOrder } from "../hooks/usePlaySetLogic";
import { triggerPwaWebPush } from "./webPushClient";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";

export interface StagedArtifactItem {
  id: string;
  dbId?: string;
  name: string;
  displayName?: string;
  hash?: string;
  author?: string;
  master_author?: string;
  url?: string;
  manifest_url?: string;
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
  load_rules?: any[];
  ignored_conflicts?: string[];
  isLocalOverride?: boolean;
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
  targetDesktopBlueprint?: string;
  gameVersion?: string;
  notes?: string;
  autoEquip: boolean;
  items: StagedArtifactItem[];
  removedItems?: StagedArtifactItem[];
  loadOrderStrategy?: string;
  loadRules?: any;
  modTiers?: Record<string, string>;
  loadOrder?: string[];
  ignoredConflicts?: string[];
  isFullRigBlueprint?: boolean;
  stagedAt: string;
  sourceDevice: string;
}

export interface VaultCompanionArtifact {
  hash: string;
  dbId?: string;
  name: string;
  displayName?: string;
  author?: string;
  version?: string;
  status?: string;
  isEquipped?: boolean;
  hasUpdate?: boolean;
  newVersion?: string;
  url?: string;
  manifestUrl?: string;
  complianceTier?: number;
  category?: string;
  alertType?: "critical" | "alert";
  alertReason?: string;
}

export interface VaultCompanionDesktopBlueprint {
  name: string;
  code?: string;
  isActive: boolean;
  modsCount: number;
  artifactIndices?: number[];
  artifacts?: VaultCompanionArtifact[];
}

export interface VaultCompanionSnapshot {
  activeBlueprintName?: string;
  gameVersion?: string;
  syncedAt: string;
  vaultCount?: number;
  criticalCount?: number;
  alertsCount?: number;
  updatesCount?: number;
  blueprintsCount?: number;
  criticalArtifacts?: VaultCompanionArtifact[];
  alertArtifacts?: VaultCompanionArtifact[];
  updateArtifacts?: VaultCompanionArtifact[];
  desktopBlueprints?: VaultCompanionDesktopBlueprint[];
  artifacts: VaultCompanionArtifact[];
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
  isCompletedLocally?: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return btoa(parts.join(""));
}

async function maybeCompressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined" || input.byteLength < 1024) {
    return input;
  }
  try {
    const cs = new CompressionStream("gzip");
    const readPromise = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    const writePromise = writer
      .write(input as unknown as BufferSource)
      .then(() => writer.close());
    const [compressedBuf] = await Promise.all([readPromise, writePromise]);
    return new Uint8Array(compressedBuf);
  } catch {
    return input;
  }
}

async function maybeDecompressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (
    input.byteLength >= 2 &&
    input[0] === 0x1f &&
    input[1] === 0x8b &&
    typeof DecompressionStream !== "undefined"
  ) {
    try {
      const ds = new DecompressionStream("gzip");
      const readPromise = new Response(ds.readable).arrayBuffer();
      const writer = ds.writable.getWriter();
      const writePromise = writer
        .write(input as unknown as BufferSource)
        .then(() => writer.close());
      const [decompressedBuf] = await Promise.all([readPromise, writePromise]);
      return new Uint8Array(decompressedBuf);
    } catch {
      return input;
    }
  }
  return input;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const STAGING_SECRET_STORAGE_PREFIX = "sanctuary_staging_secret_v2_";
const inMemoryStagingSecrets = new Map<string, string>();
const inFlightSecretSyncs = new Set<string>();

function generateRandom256BitHex(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function captureUrlFragmentStagingSecret(userId: string): string | null {
  if (typeof window === "undefined" || !window.location?.hash) return null;
  const rawHash = window.location.hash.replace(/^#/, "");
  if (!rawHash) return null;
  const params = new URLSearchParams(rawHash);
  const fragmentSecret = (params.get("k") || params.get("staging_secret") || "").trim();
  if (!fragmentSecret || fragmentSecret.length < 32 || !/^[A-Za-z0-9_-]+$/.test(fragmentSecret)) {
    return null;
  }
  try {
    localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, fragmentSecret);
  } catch {}
  try {
    params.delete("k");
    params.delete("staging_secret");
    const remaining = params.toString();
    const cleanUrl = `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ""}`;
    window.history.replaceState(null, "", cleanUrl);
  } catch {}
  return fragmentSecret;
}

/**
 * Resolves high-entropy 256-bit secret material for Zero-PII staging encryption and token derivation.
 * Never derives keys solely from public `userId + email`. Secret material is resolved from:
 * 1. Pairing QR/link URL fragment `#k=<secret>` (never transmitted in HTTP requests or public rows)
 * 2. Private GoTrue `user_metadata.staging_vault_secret_v2` (authenticated user session only)
 * 3. Device local cache (`localStorage`), generating a fresh CSPRNG 256-bit secret if absent.
 */
export async function resolveStagingVaultSecret(
  userId: string,
  explicitSecret?: string
): Promise<string> {
  if (!userId) {
    throw new Error("Cannot derive staging secret without an authenticated user ID.");
  }

  if (explicitSecret && explicitSecret.trim().length >= 32) {
    const clean = explicitSecret.trim();
    inMemoryStagingSecrets.set(userId, clean);
    try {
      localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, clean);
    } catch {}
    return clean;
  }

  const fromFragment = captureUrlFragmentStagingSecret(userId);
  if (fromFragment) {
    inMemoryStagingSecrets.set(userId, fromFragment);
    syncStagingSecretToUserMetadata(userId, fromFragment);
    return fromFragment;
  }

  const cachedMem = inMemoryStagingSecrets.get(userId);
  if (cachedMem && cachedMem.length >= 32) {
    return cachedMem;
  }

  let metadataSecret = "";
  try {
    const storeSession = useStore.getState()?.session;
    if (storeSession?.user?.id === userId) {
      const candidate = storeSession.user?.user_metadata?.staging_vault_secret_v2;
      if (typeof candidate === "string" && candidate.trim().length >= 32) {
        metadataSecret = candidate.trim();
      }
    }
    if (!metadataSecret) {
      const { data } = await supabaseAuth.auth.getSession();
      if (data?.session?.user?.id === userId) {
        const candidate = data.session.user?.user_metadata?.staging_vault_secret_v2;
        if (typeof candidate === "string" && candidate.trim().length >= 32) {
          metadataSecret = candidate.trim();
        }
      }
    }
  } catch {}

  if (metadataSecret) {
    inMemoryStagingSecrets.set(userId, metadataSecret);
    try {
      localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, metadataSecret);
    } catch {}
    return metadataSecret;
  }

  try {
    const localSecret = (localStorage.getItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`) || "").trim();
    if (localSecret.length >= 32) {
      inMemoryStagingSecrets.set(userId, localSecret);
      syncStagingSecretToUserMetadata(userId, localSecret);
      return localSecret;
    }
  } catch {}

  const generated = generateRandom256BitHex();
  inMemoryStagingSecrets.set(userId, generated);
  try {
    localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, generated);
  } catch {}
  syncStagingSecretToUserMetadata(userId, generated);
  return generated;
}

function syncStagingSecretToUserMetadata(userId: string, secret: string): void {
  if (!userId || !secret || inFlightSecretSyncs.has(userId)) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  inFlightSecretSyncs.add(userId);
  (async () => {
    try {
      const { data } = await supabaseAuth.auth.getSession();
      if (
        data?.session?.user?.id === userId &&
        data.session.user?.user_metadata?.staging_vault_secret_v2 !== secret
      ) {
        await supabaseAuth.auth.updateUser({
          data: { staging_vault_secret_v2: secret },
        });
      }
    } catch {
      // Non-fatal; secret remains in volatile/local storage and URL pairing fragment
    } finally {
      inFlightSecretSyncs.delete(userId);
    }
  })();
}

export async function buildStagingPairingUrl(baseUrl: string, userId: string): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId);
  const trimmed = baseUrl.replace(/#.*$/, "");
  return `${trimmed}#k=${encodeURIComponent(secret)}`;
}

async function sha256HexUtf8(raw: string): Promise<string> {
  const encoded = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Domain-separated Spoke Relink Claim Secret derived from the user's private
 * `staging_vault_secret_v2` so sharing a Cut-the-Cord relink token with an
 * independent Spoke never reveals the user's Hub staging encryption secret.
 */
export async function deriveSpokeRelinkSecret(
  userId: string,
  explicitSecret?: string
): Promise<string> {
  const cleanUid = String(userId || "").trim().toLowerCase();
  if (!cleanUid) {
    throw new Error("Cannot derive Spoke Relink Secret without a System ID.");
  }
  const masterSecret = await resolveStagingVaultSecret(userId, explicitSecret);
  return sha256HexUtf8(`sanctuary_spoke_relink_secret_v1:${cleanUid}:${masterSecret}`);
}

/**
 * Publicly non-invertible SHA-256 commitment hash registered in
 * `sanctuary_internal.spoke_relink_commitments` while federated.
 * Matches PostgreSQL `relink_spoke_profile_uuid` byte-for-byte.
 */
export async function deriveSpokeRelinkCommitmentHash(
  userId: string,
  explicitSecret?: string
): Promise<string> {
  const cleanUid = String(userId || "").trim().toLowerCase();
  const claimSecret = await deriveSpokeRelinkSecret(userId, explicitSecret);
  return sha256HexUtf8(`sanctuary_spoke_relink_v1:${cleanUid}:${claimSecret}`);
}

export async function buildSpokeRelinkToken(
  userId: string,
  explicitSecret?: string
): Promise<string> {
  const cleanUid = String(userId || "").trim().toLowerCase();
  const claimSecret = await deriveSpokeRelinkSecret(userId, explicitSecret);
  return `SRK1.${cleanUid}.${claimSecret}`;
}

export function parseSpokeRelinkToken(
  rawToken: string
): { legacyUuid: string; claimSecret: string } | null {
  const trimmed = String(rawToken || "").trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^SRK1\./i, "");
  const dotIdx = withoutPrefix.indexOf(".");
  if (dotIdx <= 0) return null;
  const legacyUuid = withoutPrefix.slice(0, dotIdx).trim().toLowerCase();
  const claimSecret = withoutPrefix.slice(dotIdx + 1).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(legacyUuid) || claimSecret.length < 32) {
    return null;
  }
  return { legacyUuid, claimSecret };
}

export interface EncryptedSupporterVaultPayload {
  version: 1;
  syncedAt: string;
  follows: any[];
  supporters: any[];
  removedFollowKeys?: Record<string, number>;
  removedSupporterKeys?: Record<string, number>;
}

export async function deriveUserSupporterVaultToken(
  userId: string,
  email?: string,
  explicitSecret?: string
): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  return sha256HexUtf8(
    `sanctuary_supporter_vault_v1:${userId}:${(email || "").trim().toLowerCase()}:${secret}`
  );
}

export async function pushEncryptedSupporterVault(
  vaultPayload: EncryptedSupporterVaultPayload,
  session: any
): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (typeof localStorage !== "undefined" && localStorage.getItem("sanctuary_local_only") === "true") {
    return false;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const supporterToken = await deriveUserSupporterVaultToken(
      session.user.id,
      session.user.email
    );
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);

    const rawPlaintext = new TextEncoder().encode(JSON.stringify(vaultPayload));
    const plaintext = await maybeCompressBytes(rawPlaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      plaintext as unknown as BufferSource
    );

    const client = supabaseAuth || supabase;
    await client
      .from("citizen_staging_queue")
      .delete()
      .eq("user_token", supporterToken);

    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const { error } = await client.from("citizen_staging_queue").insert([
      {
        user_token: supporterToken,
        payload_type: "supporter_vault_sync",
        encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
        item_count: 0,
        expires_at: new Date(Date.now() + tenYearsMs).toISOString(),
      },
    ]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("Failed to push encrypted Zero-PII Supporter Vault:", err);
    return false;
  }
}

export async function pullEncryptedSupporterVault(
  session: any
): Promise<EncryptedSupporterVaultPayload | null> {
  if (!session?.user?.id) return null;
  if (typeof localStorage !== "undefined" && localStorage.getItem("sanctuary_local_only") === "true") {
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const supporterToken = await deriveUserSupporterVaultToken(
      session.user.id,
      session.user.email
    );
    const client = supabaseAuth || supabase;
    const { data, error } = await client
      .from("citizen_staging_queue")
      .select("encrypted_payload, iv, salt, created_at")
      .eq("user_token", supporterToken)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0];
    if (!row?.encrypted_payload || !row?.iv || !row?.salt) return null;

    const salt = base64ToBytes(row.salt);
    const iv = base64ToBytes(row.iv);
    const ciphertext = base64ToBytes(row.encrypted_payload);
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const decompressedBytes = await maybeDecompressBytes(new Uint8Array(decryptedBuffer));
    const parsed = JSON.parse(
      new TextDecoder().decode(decompressedBytes)
    ) as EncryptedSupporterVaultPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.warn("Failed to decrypt Zero-PII Supporter Vault:", err);
    return null;
  }
}

export async function deriveUserStagingToken(
  userId: string,
  email?: string,
  explicitSecret?: string
): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  const raw = `sanctuary_citizen_stage_v2:${userId}:${(email || "").trim().toLowerCase()}:${secret}`;
  const encoded = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveAesGcmKey(
  userId: string,
  email: string | undefined,
  salt: Uint8Array,
  explicitSecret?: string
): Promise<CryptoKey> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  const passphrase = `${userId}::${(email || "").trim().toLowerCase()}::${secret}::sanctuary_signature_queue_v2`;
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

  const rawPlaintext = new TextEncoder().encode(JSON.stringify(payload));
  const plaintext = await maybeCompressBytes(rawPlaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext as unknown as BufferSource
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
    const decompressedBytes = await maybeDecompressBytes(new Uint8Array(decryptedBuffer));
    const jsonStr = new TextDecoder().decode(decompressedBytes);
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

function normalizeBpKey(name?: string | null): string {
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

export async function pushEncryptedStagingPayload(
  payload: StagedCloudPayload,
  session: any
): Promise<{ success: boolean; rowId?: string; error?: string }> {
  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" };
  }
  try {
    const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
    const targetBpKey = normalizeBpKey(
      payload.targetDesktopBlueprint || payload.blueprintName
    );

    // Check existing staging rows for this user token so editing the SAME blueprint merges & replaces its row instead of creating a duplicate blueprint
    const { data: existingRows } = await supabase
      .from("citizen_staging_queue")
      .select("*")
      .eq("user_token", userToken)
      .order("created_at", { ascending: false })
      .limit(10);

    const matchingRowIdsToDelete: string[] = [];
    let mergedPayload: StagedCloudPayload = { ...payload };

    if (Array.isArray(existingRows) && existingRows.length > 0 && targetBpKey) {
      for (const row of existingRows) {
        if (!row?.encrypted_payload || !row?.iv || !row?.salt) continue;
        const oldDecrypted = await decryptStagingPayload(
          row.encrypted_payload,
          row.iv,
          row.salt,
          session.user.id,
          session.user.email
        );
        if (!oldDecrypted) continue;
        const oldKey = normalizeBpKey(
          oldDecrypted.targetDesktopBlueprint || oldDecrypted.blueprintName
        );
        if (oldKey && oldKey === targetBpKey) {
          matchingRowIdsToDelete.push(row.id);
          if (payload.isFullRigBlueprint) {
            continue;
          }
          const getModKey = (m: any) =>
            String(m?.dbId || m?.hash || m?.id || m?.name || m?.displayName || "")
              .trim()
              .toLowerCase();
          const addedMap = new Map<string, StagedArtifactItem>();
          const removedMap = new Map<string, StagedArtifactItem>();

          (oldDecrypted.items || []).forEach((it) => {
            const k = getModKey(it);
            if (k) addedMap.set(k, it);
          });
          (oldDecrypted.removedItems || []).forEach((it) => {
            const k = getModKey(it);
            if (k) removedMap.set(k, it);
          });
          (mergedPayload.items || []).forEach((it) => {
            const k = getModKey(it);
            if (!k) return;
            removedMap.delete(k);
            addedMap.set(k, it);
          });
          (mergedPayload.removedItems || []).forEach((it) => {
            const k = getModKey(it);
            if (!k) return;
            addedMap.delete(k);
            removedMap.set(k, it);
          });

          const nextItems = Array.from(addedMap.values()).map((it, idx) => ({
            ...it,
            load_order_index: idx,
          }));
          const nextRemoved = Array.from(removedMap.values());
          mergedPayload = {
            ...mergedPayload,
            targetDesktopBlueprint:
              mergedPayload.targetDesktopBlueprint ||
              oldDecrypted.targetDesktopBlueprint ||
              oldDecrypted.blueprintName,
            items: nextItems,
            removedItems: nextRemoved.length > 0 ? nextRemoved : undefined,
          };
        }
      }
    }

    if (matchingRowIdsToDelete.length > 0) {
      await supabase
        .from("citizen_staging_queue")
        .delete()
        .in("id", matchingRowIdsToDelete);
    }

    const { encrypted_payload, iv, salt } = await encryptStagingPayload(
      mergedPayload,
      session.user.id,
      session.user.email
    );

    const totalChanges =
      (mergedPayload.items?.length || 0) + (mergedPayload.removedItems?.length || 0);

    const ttlMs = mergedPayload.isFullRigBlueprint
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const { data, error } = await supabase
      .from("citizen_staging_queue")
      .insert([
        {
          user_token: userToken,
          payload_type: mergedPayload.mode,
          encrypted_payload,
          iv,
          salt,
          item_count: totalChanges,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        },
      ])
      .select("id")
      .single();

    if (error) throw error;
    if (!data?.id) {
      return {
        success: false,
        error: "Cloud staging queue unavailable for active workspace.",
      };
    }

    triggerPwaWebPush({
      type: "blueprint_staging",
      staging_token: userToken,
      title: "Blueprint Staged to Signature Queue",
      body: `${mergedPayload.blueprintName} (${totalChanges} items) • ${mergedPayload.sourceDevice}`,
    });

    if (mergedPayload.mode === "blueprint" && !mergedPayload.isFullRigBlueprint) {
      recordMobileBlueprintEdit(
        mergedPayload.targetDesktopBlueprint || mergedPayload.blueprintName,
        mergedPayload.items || [],
        mergedPayload.removedItems || []
      );
    }

    return { success: true, rowId: data?.id };
  } catch (err: any) {
    console.error("Failed to push encrypted staging payload:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function stageFullBlueprintToRigQueue(
  targetSet: any,
  modList: any[],
  activeGameSchema: any,
  session: any,
  selectedVersion?: string
): Promise<{ success: boolean; rowId?: string; count?: number; error?: string }> {
  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" };
  }
  if (!targetSet || !Array.isArray(targetSet.mods)) {
    return { success: false, error: "Invalid Blueprint" };
  }

  try {
    let localOverrides: Record<string, any> = {};
    try {
      localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
    } catch {}

    const safeModList = Array.isArray(modList) ? modList : [];
    const byExact = new Map<string, any>();
    const byCleanLower = new Map<string, any>();

    const registerLocalMod = (m: any) => {
      if (!m || !m.name) return;
      if (!byExact.has(m.name)) byExact.set(m.name, m);
      const lastSlash = Math.max(m.name.lastIndexOf("/"), m.name.lastIndexOf("\\"));
      const clean = (lastSlash >= 0 ? m.name.slice(lastSlash + 1) : m.name).toLowerCase();
      if (clean && !byCleanLower.has(clean)) byCleanLower.set(clean, m);
    };

    for (let i = 0; i < safeModList.length; i++) {
      const m = safeModList[i];
      if (!m) continue;
      if (m.isVirtual) {
        if (Array.isArray(m.flavors)) {
          m.flavors.forEach((fl: any) => {
            if (fl && !fl.isVirtual) registerLocalMod(fl);
          });
        }
        continue;
      }
      registerLocalMod(m);
    }

    const packagedLO = packageBlueprintLoadOrder(targetSet, activeGameSchema, safeModList);

    const rawModObjects = targetSet.mods
      .map((rawMod: any) => {
        const modName =
          typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
        if (
          !modName ||
          modName.startsWith("FOLDER_") ||
          modName.startsWith("SET_") ||
          modName.startsWith("LOCAL_SET_")
        ) {
          return null;
        }
        const lastSlash = Math.max(modName.lastIndexOf("/"), modName.lastIndexOf("\\"));
        const cleanName = lastSlash >= 0 ? modName.slice(lastSlash + 1) || modName : modName;
        const mod = byExact.get(modName) || byCleanLower.get(cleanName.toLowerCase());
        if (mod?.isVirtual) return null;

        const hash = String(
          mod?.hash || targetSet.modHashes?.[modName] || targetSet.modHashes?.[cleanName] || ""
        ).trim();
        const override = hash ? localOverrides[hash] : undefined;
        const meta = targetSet.modMeta?.[modName] || targetSet.modMeta?.[cleanName];

        return {
          id: hash || mod?.dbId || cleanName,
          dbId: mod?.dbId ? String(mod.dbId) : undefined,
          name: modName,
          displayName: override?.displayName || meta?.displayName || mod?.displayName || cleanName,
          hash,
          url:
            override?.url ||
            meta?.url ||
            mod?.download_url ||
            mod?.url ||
            "",
          manifest_url:
            override?.manifest_url ||
            meta?.manifest_url ||
            mod?.manifest_url ||
            undefined,
          author:
            override?.author ||
            meta?.author ||
            mod?.author ||
            mod?.master_author ||
            "Unknown",
          version: override?.version || meta?.version || mod?.version || "v.Local",
          description: override?.description ?? meta?.description ?? mod?.description ?? undefined,
          image_url: override?.image_url ?? meta?.image_url ?? mod?.image_url ?? undefined,
          category_override:
            override?.category_override ||
            meta?.category_override ||
            mod?.category_override ||
            mod?.category ||
            undefined,
          category:
            override?.category_override ||
            meta?.category_override ||
            mod?.category_override ||
            mod?.category ||
            undefined,
          requiredDLC: override?.requiredDLC || meta?.requiredDLC || mod?.requiredDLC || [],
          compatible_versions:
            override?.compatible_versions ||
            meta?.compatible_versions ||
            mod?.compatible_versions ||
            [],
          compliance_tier: Number(mod?.compliance_tier ?? meta?.compliance_tier ?? 0),
          status: mod?.status || "stable",
          is_paid: Boolean(override?.is_paid ?? meta?.is_paid ?? mod?.is_paid ?? false),
          is_early_access: Boolean(
            override?.is_early_access ?? meta?.is_early_access ?? mod?.is_early_access ?? false
          ),
          isLocalOverride: Boolean(override || mod?.isLocalOverride),
        };
      })
      .filter(Boolean);

    const enrichedArtifacts: StagedArtifactItem[] =
      packagedLO.enrichAndSortArtifacts(rawModObjects);

    if (enrichedArtifacts.length === 0) {
      return {
        success: false,
        error: "Cannot stage an empty Blueprint with 0 linked items.",
      };
    }

    // Enrich any items that have a DNA hash and are missing a creator URL from Spoke mod_versions (including Tier 1-4!)
    const hashesMissingUrl = Array.from(
      new Set(
        enrichedArtifacts
          .filter((it) => it.hash && !it.url)
          .map((it) => String(it.hash).trim())
          .filter(Boolean)
      )
    );

    if (hashesMissingUrl.length > 0) {
      const dbByHash = new Map<string, any>();
      const chunkSize = 60;
      const chunks: string[][] = [];
      for (let i = 0; i < hashesMissingUrl.length; i += chunkSize) {
        chunks.push(hashesMissingUrl.slice(i, i + chunkSize));
      }
      const batchConcurrency = 4;
      for (let b = 0; b < chunks.length; b += batchConcurrency) {
        const batch = chunks.slice(b, b + batchConcurrency);
        const results = await Promise.all(
          batch.map((chunk) =>
            supabase
              .from("mod_versions")
              .select(
                "dna_hash, version_label, mods(id, is_paid, is_early_access, url, master_author, compliance_tier, category_override)"
              )
              .in("dna_hash", chunk)
          )
        );
        results.forEach(({ data: vData }) => {
          if (Array.isArray(vData)) {
            vData.forEach((row: any) => {
              if (row?.dna_hash) dbByHash.set(String(row.dna_hash), row);
            });
          }
        });
      }

      if (dbByHash.size > 0) {
        for (let i = 0; i < enrichedArtifacts.length; i++) {
          const item = enrichedArtifacts[i];
          const dbRow = item.hash ? dbByHash.get(String(item.hash)) : undefined;
          if (!dbRow) continue;
          const modRef = Array.isArray(dbRow.mods) ? dbRow.mods[0] : dbRow.mods;
          if (!modRef) continue;
          enrichedArtifacts[i] = {
            ...item,
            dbId: item.dbId || (modRef.id ? String(modRef.id) : undefined),
            url: item.url || modRef.url || "",
            author:
              !item.author || item.author === "Unknown"
                ? modRef.master_author || item.author
                : item.author,
            version:
              !item.version || item.version === "v.Local"
                ? dbRow.version_label || item.version
                : item.version,
            compliance_tier: item.compliance_tier || modRef.compliance_tier || 0,
            category: item.category || modRef.category_override || undefined,
            category_override: item.category_override || modRef.category_override || undefined,
            is_paid: item.is_paid ?? Boolean(modRef.is_paid),
            is_early_access: item.is_early_access ?? Boolean(modRef.is_early_access),
          };
        }
      }
    }

    const payload: StagedCloudPayload = {
      mode: "blueprint",
      isFullRigBlueprint: true,
      blueprintName: String(targetSet.name || "Blueprint"),
      targetDesktopBlueprint: String(targetSet.name || "Blueprint"),
      blueprintCode: targetSet.code || undefined,
      gameVersion: selectedVersion || "all",
      autoEquip: true,
      items: enrichedArtifacts,
      loadOrderStrategy: packagedLO.load_order_strategy,
      loadRules: packagedLO.load_rules,
      modTiers: packagedLO.mod_tiers,
      loadOrder: packagedLO.load_order,
      ignoredConflicts: packagedLO.ignored_conflicts,
      stagedAt: new Date().toISOString(),
      sourceDevice: getSourceDeviceLabel(),
    };

    const res = await pushEncryptedStagingPayload(payload, session);
    if (res.success && res.rowId) {
      // Mark completed on the sending rig so it doesn't prompt this rig to re-deploy its own Blueprint,
      // while remaining pending in the cloud for the user's Steam Deck / other rigs!
      markStagingRowDeployedLocally(res.rowId);

      // Immediately hydrate volatileSignatureQueues so the Rig Beam Pipeline UI updates instantaneously
      try {
        const optimisticResolved: ResolvedStagedPayload = {
          rowId: res.rowId,
          createdAt: payload.stagedAt,
          isCompletedLocally: true,
          payload,
          resolvedItems: enrichedArtifacts.map((it) => ({
            ...it,
            isOwned: true,
            localModName: it.name,
            localHash: it.hash,
            selected: true,
          })),
        };
        const modalState = useModalStore.getState();
        const targetKey = normalizeBpKey(
          payload.targetDesktopBlueprint || payload.blueprintName
        );
        const prevList = Array.isArray(modalState.volatileSignatureQueues)
          ? (modalState.volatileSignatureQueues as ResolvedStagedPayload[])
          : [];
        const filteredPrev = prevList.filter((q) => {
          if (q?.rowId === res.rowId) return false;
          const qKey = normalizeBpKey(
            q?.payload?.targetDesktopBlueprint || q?.payload?.blueprintName || ""
          );
          return !targetKey || qKey !== targetKey;
        });
        const nextQueues = [optimisticResolved, ...filteredPrev];
        modalState.setVolatileSignatureQueues(nextQueues);
        if (!modalState.volatileSignatureQueue) {
          modalState.setVolatileSignatureQueue(optimisticResolved);
        }
      } catch {}

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));
      }
      return { success: true, rowId: res.rowId, count: enrichedArtifacts.length };
    }
    return { success: false, error: res.error || "Failed to stage Blueprint" };
  } catch (err: any) {
    console.error("Failed to stage full Blueprint to Rig Queue:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function shredCloudStagingRow(
  rowId?: string,
  session?: any
): Promise<boolean> {
  try {
    if (rowId) {
      await supabase.from("citizen_staging_queue").delete().eq("id", rowId);
      return true;
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

const LOCAL_DEPLOYED_ROWS_KEY = "sanctuary_deployed_staging_rows";

export function markStagingRowDeployedLocally(rowId: string): void {
  if (!rowId) return;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = Array.from(new Set([rowId, ...(Array.isArray(list) ? list : [])])).slice(0, 50);
    localStorage.setItem(LOCAL_DEPLOYED_ROWS_KEY, JSON.stringify(next));
  } catch {}
}

export function unmarkStagingRowDeployedLocally(rowId: string): void {
  if (!rowId) return;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    if (!raw) return;
    const list: string[] = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    const next = list.filter((id) => id !== rowId);
    localStorage.setItem(LOCAL_DEPLOYED_ROWS_KEY, JSON.stringify(next));
  } catch {}
}

export function isStagingRowDeployedLocally(rowId: string): boolean {
  if (!rowId) return false;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return Array.isArray(list) && list.includes(rowId);
  } catch {
    return false;
  }
}

export function getSourceDeviceLabel(): string {
  if (isLinuxDesktop()) return "SteamOS / Linux Rig";
  if (isDesktop()) return "Windows / Desktop Rig";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "PWA / Mobile";
  return "Web / PWA Client";
}

export async function deriveUserCompanionToken(
  userId: string,
  email?: string,
  explicitSecret?: string
): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  const raw = `sanctuary_citizen_companion_v2:${userId}:${(email || "").trim().toLowerCase()}:${secret}`;
  const encoded = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pushEncryptedVaultCompanionSnapshot(
  snapshot: VaultCompanionSnapshot,
  session: any
): Promise<boolean> {
  if (!session?.user?.id) return false;
  try {
    const companionToken = await deriveUserCompanionToken(session.user.id, session.user.email);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);

    const rawPlaintext = new TextEncoder().encode(JSON.stringify(snapshot));
    const plaintext = await maybeCompressBytes(rawPlaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      plaintext as unknown as BufferSource
    );

    await supabase
      .from("citizen_staging_queue")
      .delete()
      .eq("user_token", companionToken);

    const { error } = await supabase.from("citizen_staging_queue").insert([
      {
        user_token: companionToken,
        payload_type: "companion_radar",
        encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
        item_count: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);
    if (error) throw error;

    const crit = Number(snapshot.criticalCount || 0);
    const upds = Number(snapshot.updatesCount || 0);
    if (crit > 0 || upds > 0) {
      const summaryKey = `${crit}:${upds}`;
      let lastPushed = "";
      try {
        lastPushed = localStorage.getItem("sanctuary_last_pushed_companion_summary") || "";
      } catch {}
      if (summaryKey !== lastPushed) {
        try {
          localStorage.setItem("sanctuary_last_pushed_companion_summary", summaryKey);
        } catch {}
        const parts: string[] = [];
        if (crit > 0) parts.push(`${crit} Critical Failures`);
        if (upds > 0) parts.push(`${upds} Updates Available`);
        triggerPwaWebPush({
          type: "companion_radar",
          companion_token: companionToken,
          title: "Vault Companion Radar Alert",
          body: `${parts.join(" • ")}${snapshot.activeBlueprintName ? ` (${snapshot.activeBlueprintName})` : ""}`,
          unique_id: `companion_radar_${summaryKey}`,
        });
      }
    }

    return true;
  } catch (err) {
    console.warn("Failed to sync encrypted Vault Companion snapshot:", err);
    return false;
  }
}

export async function fetchEncryptedVaultCompanionSnapshots(
  session: any
): Promise<VaultCompanionSnapshot[]> {
  if (!session?.user?.id) return [];
  try {
    const companionToken = await deriveUserCompanionToken(session.user.id, session.user.email);
    const { data, error } = await supabase
      .from("citizen_staging_queue")
      .select("*")
      .eq("user_token", companionToken)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) return [];

    const row = data[0];
    if (!row?.encrypted_payload || !row?.iv || !row?.salt) return [];
    const salt = base64ToBytes(row.salt);
    const iv = base64ToBytes(row.iv);
    const ciphertext = base64ToBytes(row.encrypted_payload);
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const decompressedBytes = await maybeDecompressBytes(new Uint8Array(decryptedBuffer));
    const parsed = JSON.parse(
      new TextDecoder().decode(decompressedBytes)
    ) as VaultCompanionSnapshot;
    if (parsed && Array.isArray(parsed.artifacts)) {
      // Statically poll any bound Edge Manifest URLs (especially for Tier 1-4 / unknown / local mods)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const uniqueUrls = Array.from(
          new Set(
            parsed.artifacts
              .map((a) => a.manifestUrl)
              .filter(
                (u): u is string =>
                  Boolean(
                    u &&
                      /^https?:\/\//i.test(u) &&
                      !u.includes("example.com") &&
                      !u.includes("your-domain.com")
                  )
              )
          )
        ).slice(0, 25);

        if (uniqueUrls.length > 0) {
          const manifestByUrl = new Map<string, any>();
          await Promise.all(
            uniqueUrls.map(async (mUrl) => {
              try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 3500);
                const resp = await fetch(mUrl, { signal: ctrl.signal });
                clearTimeout(timer);
                if (resp.ok) {
                  const data = await resp.json();
                  if (data) manifestByUrl.set(mUrl, data);
                }
              } catch {}
            })
          );

          if (manifestByUrl.size > 0) {
            parsed.artifacts = parsed.artifacts.map((art) => {
              if (!art.manifestUrl || !manifestByUrl.has(art.manifestUrl)) return art;
              const rawJson = manifestByUrl.get(art.manifestUrl);
              const candidates = Array.isArray(rawJson)
                ? rawJson
                : Array.isArray(rawJson?.artifacts)
                  ? rawJson.artifacts
                  : Array.isArray(rawJson?.manifests)
                    ? rawJson.manifests
                    : null;
              const needle = String(art.displayName || art.name || "").toLowerCase();
              const manifest = candidates
                ? candidates.find(
                    (c: any) =>
                      String(c?.artifact?.id || "").toLowerCase() === needle ||
                      String(c?.artifact?.name || "").toLowerCase() === needle
                  ) || candidates[0]
                : rawJson;
              if (!manifest?.artifact) return art;

              const next = { ...art };
              const edgeStatus = String(
                manifest.artifact?.status ||
                  manifest.status ||
                  manifest.atomic_logic?.status ||
                  ""
              )
                .toLowerCase()
                .trim();
              if (edgeStatus === "broken" || edgeStatus === "corrupted" || edgeStatus === "obsolete") {
                next.status = edgeStatus;
                next.alertType = "critical";
              } else if (edgeStatus === "unstable") {
                next.status = "unstable";
                if (next.alertType !== "critical") next.alertType = "alert";
              }

              const latestVer = String(manifest.artifact?.version || "")
                .replace(/^v/i, "")
                .trim();
              const curVer = String(art.version || "")
                .replace(/^v/i, "")
                .trim();
              const latestSha = String(manifest.payload?.sha256 || "")
                .toLowerCase()
                .trim();
              const curSha = String(art.hash || "")
                .toLowerCase()
                .trim();
              const prevHashes: string[] = Array.isArray(manifest.previous_hashes)
                ? manifest.previous_hashes.map((h: any) => String(h).toLowerCase().trim())
                : [];

              if (
                (latestSha && curSha && latestSha !== curSha && prevHashes.includes(curSha)) ||
                (latestVer &&
                  curVer &&
                  curVer.toLowerCase() !== "local" &&
                  curVer.toLowerCase() !== ".local" &&
                  latestVer.toLowerCase() !== curVer.toLowerCase())
              ) {
                next.hasUpdate = true;
                next.newVersion = manifest.artifact?.version || next.newVersion;
                if (manifest.payload?.download_url) {
                  next.url = manifest.payload.download_url;
                }
              }
              return next;
            });
          }
        }
      }

      if (!Array.isArray(parsed.desktopBlueprints) || parsed.desktopBlueprints.length === 0) {
        try {
          const cachedBps = localStorage.getItem("sanctuary_cached_companion_blueprints");
          if (cachedBps) {
            const parsedCached = JSON.parse(cachedBps);
            if (Array.isArray(parsedCached) && parsedCached.length > 0) {
              parsed.desktopBlueprints = parsedCached;
            }
          }
        } catch {}
      } else {
        try {
          const slimBps = parsed.desktopBlueprints.map((bp) => ({
            name: bp.name,
            code: bp.code,
            isActive: bp.isActive,
            modsCount: bp.modsCount,
            artifactIndices: bp.artifactIndices,
          }));
          localStorage.setItem("sanctuary_cached_companion_blueprints", JSON.stringify(slimBps));
        } catch {}
      }

      if (Array.isArray(parsed.desktopBlueprints)) {
        const hydratedBps = parsed.desktopBlueprints.map((bp) => ({
          ...bp,
          artifacts: Array.isArray(bp.artifacts) && bp.artifacts.length > 0
            ? bp.artifacts
            : Array.isArray(bp.artifactIndices)
              ? bp.artifactIndices
                  .map((idx) => parsed.artifacts[idx])
                  .filter(Boolean)
              : [],
        }));
        parsed.desktopBlueprints = applyMobileEditsToBlueprints(hydratedBps, parsed.syncedAt);
        if (!parsed.blueprintsCount || parsed.blueprintsCount < parsed.desktopBlueprints.length) {
          parsed.blueprintsCount = parsed.desktopBlueprints.length;
        }
      }
      return [parsed];
    }
    return [];
  } catch (err) {
    console.warn("Failed to fetch Vault Companion snapshot:", err);
    return [];
  }
}

function toCompanionArtifact(
  m: any,
  overrideStatus?: string,
  overrideAlertType?: "critical" | "alert"
): VaultCompanionArtifact {
  const firstFlavor =
    Array.isArray(m?.flavors) && m.flavors.length > 0 ? m.flavors[0] : null;
  const resolvedHash = String(
    m?.hash || firstFlavor?.hash || m?.dbId || m?._groupedTitle || m?.name || ""
  ).trim();
  const resolvedDbId = m?.dbId
    ? String(m.dbId)
    : firstFlavor?.dbId
      ? String(firstFlavor.dbId)
      : undefined;
  const cleanName =
    String(m?._groupedTitle || m?.displayName || m?.meta_name || m?.name || "")
      .split(/[\\/]/)
      .pop() || resolvedHash;
  return {
    hash: resolvedHash,
    dbId: resolvedDbId,
    name: cleanName,
    displayName: m?._groupedTitle || m?.displayName || m?.meta_name || cleanName,
    author: m?.author || firstFlavor?.author || undefined,
    version: m?.version || firstFlavor?.version || undefined,
    status: overrideStatus || m?.status || "stable",
    isEquipped: true,
    hasUpdate: Boolean(m?.hasUpdate),
    newVersion:
      m?.newVersion ||
      (Array.isArray(m?.flavors)
        ? m.flavors.find((fl: any) => fl?.newVersion)?.newVersion
        : undefined) ||
      undefined,
    url: m?.download_url || m?.url || firstFlavor?.url || undefined,
    manifestUrl: m?.manifest_url || firstFlavor?.manifest_url || undefined,
    complianceTier: typeof m?.compliance_tier === "number" ? m.compliance_tier : undefined,
    category: m?.category_override || m?.category || m?.type || undefined,
    alertType: overrideAlertType,
    alertReason: m?._issue_label || m?.status_reason || undefined,
  };
}

let lastCompanionSyncSignature = "";
let lastCompanionSyncAt = 0;
let inFlightCompanionSync: Promise<boolean> | null = null;

export async function syncDesktopCompanionRadarSnapshot(
  modList: any[],
  session: any,
  activeBlueprintName?: string,
  gameVersion?: string,
  exactDesktopSummary?: {
    vaultCount?: number;
    criticalCount?: number;
    alertsCount?: number;
    updatesCount?: number;
    blueprintsCount?: number;
    criticalItems?: any[];
    alertItems?: any[];
    updateItems?: any[];
    playSets?: any[];
  }
): Promise<boolean> {
  if (!isDesktop() || !session?.user?.id) return false;
  if (localStorage.getItem("sanctuary_local_only") === "true") return false;
  if (localStorage.getItem("sanctuary_cloud_companion_sync") === "false") return false;

  const storePlaySets = useStore.getState()?.playSets;
  const candidatePlaySets = Array.isArray(exactDesktopSummary?.playSets)
    ? exactDesktopSummary!.playSets!
    : Array.isArray(storePlaySets)
      ? storePlaySets
      : [];

  const syncSig = [
    session.user.id,
    activeBlueprintName || "",
    gameVersion || "",
    Array.isArray(modList) ? modList.length : 0,
    exactDesktopSummary?.vaultCount ?? -1,
    exactDesktopSummary?.criticalCount ?? -1,
    exactDesktopSummary?.alertsCount ?? -1,
    exactDesktopSummary?.updatesCount ?? -1,
    exactDesktopSummary?.blueprintsCount ?? candidatePlaySets.length,
    Array.isArray(exactDesktopSummary?.criticalItems) ? 1 : 0,
  ].join("|");

  if (
    syncSig === lastCompanionSyncSignature &&
    Date.now() - lastCompanionSyncAt < 15_000
  ) {
    return true;
  }
  if (inFlightCompanionSync) {
    try {
      await inFlightCompanionSync;
    } catch {}
    if (
      syncSig === lastCompanionSyncSignature &&
      Date.now() - lastCompanionSyncAt < 15_000
    ) {
      return true;
    }
  }

  const safeList = Array.isArray(modList) ? modList : [];
  const virtualFolderIds = new Set<string>();
  safeList.forEach((v: any) => {
    if (!v?.isVirtual || !v.dbId) return;
    const dbIdStr = String(v.dbId);
    if (dbIdStr === "undefined" || dbIdStr === "null") return;
    if (
      (v.hash?.startsWith("local_set_") || v.name?.startsWith("LOCAL_SET_")) &&
      !dbIdStr.startsWith("f_") &&
      !dbIdStr.startsWith("local_")
    ) {
      return;
    }
    virtualFolderIds.add(dbIdStr);
  });

  const criticalKeySet = new Set<string>();
  const alertKeySet = new Set<string>();
  const updateMap = new Map<string, any>();

  (exactDesktopSummary?.criticalItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m._groupedTitle || m.displayName || m.name || "").toLowerCase();
    if (k) criticalKeySet.add(k);
  });
  (exactDesktopSummary?.alertItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m._groupedTitle || m.displayName || m.name || "").toLowerCase();
    if (k) alertKeySet.add(k);
  });
  (exactDesktopSummary?.updateItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m.displayName || m.name || "").toLowerCase();
    if (k) updateMap.set(k, m);
  });

  const topLevelVaultItems: VaultCompanionArtifact[] = [];
  const addedTopKeys = new Set<string>();
  const nameToTopIndex = new Map<string, number>();

  const activeSchema = useStore.getState()?.activeGameSchema;
  const schemaSupportedExts: string[] = Array.isArray(activeSchema?.extensions?.supported)
    ? activeSchema.extensions.supported
        .map((ext: any) => String(ext || "").trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean)
    : [];
  const escapedExts = schemaSupportedExts.map((e) =>
    e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const supportedExtRegex =
    escapedExts.length > 0 ? new RegExp(`\\.(${escapedExts.join("|")})$`, "i") : null;
  const stripSupportedExt = (fileName?: string): string | undefined => {
    if (!fileName) return undefined;
    if (supportedExtRegex) {
      return fileName.replace(supportedExtRegex, "");
    }
    return fileName.replace(/\.[^/.]+$/, "");
  };

  for (let i = 0; i < safeList.length; i++) {
    const mod = safeList[i];
    if (!mod) continue;
    if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
      const dbIdStr = String(mod.dbId || "");
      if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) continue;
    }
    if (!mod.isVirtual && mod.name) {
      const lowName = String(mod.name).toLowerCase();
      const isModBinary = supportedExtRegex
        ? supportedExtRegex.test(lowName)
        : /\.[a-z0-9]{1,16}$/i.test(lowName);
      if (!isModBinary) continue;
    }
    const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "")
      .toUpperCase()
      .trim();
    const baseModName =
      modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
    if (baseModName === "FILTERS") continue;
    if (!mod.isVirtual) {
      const folderExists =
        (mod.familyId && virtualFolderIds.has(String(mod.familyId))) ||
        (mod.setId && virtualFolderIds.has(String(mod.setId)));
      if (folderExists) continue;
    }

    const firstFlavor = Array.isArray(mod.flavors) && mod.flavors.length > 0 ? mod.flavors[0] : null;
    const resolvedHash = String(mod.hash || firstFlavor?.hash || mod.dbId || mod.name || "").trim();
    const resolvedDbId = mod.dbId
      ? String(mod.dbId)
      : firstFlavor?.dbId
        ? String(firstFlavor.dbId)
        : undefined;
    const cleanName =
      String(mod.displayName || mod.meta_name || mod.name || "").split(/[\\/]/).pop() ||
      resolvedHash;

    const kDb = resolvedDbId ? resolvedDbId.toLowerCase() : "";
    const kHash = resolvedHash.toLowerCase();
    const kTitle = String(mod.displayName || mod.name || "").toLowerCase();

    const isCrit =
      (kDb && criticalKeySet.has(kDb)) ||
      (kHash && criticalKeySet.has(kHash)) ||
      (kTitle && criticalKeySet.has(kTitle)) ||
      String(mod.status || "").toLowerCase() === "broken" ||
      String(mod.status || "").toLowerCase() === "corrupted";
    const isAlrt =
      !isCrit &&
      ((kDb && alertKeySet.has(kDb)) ||
        (kHash && alertKeySet.has(kHash)) ||
        (kTitle && alertKeySet.has(kTitle)) ||
        String(mod.status || "").toLowerCase() === "unstable");

    const matchedUpd =
      (kDb && updateMap.get(kDb)) ||
      (kHash && updateMap.get(kHash)) ||
      (kTitle && updateMap.get(kTitle));
    const hasFlavorUpdate =
      Array.isArray(mod.flavors) && mod.flavors.some((fl: any) => Boolean(fl?.hasUpdate));
    const hasUpd = Boolean(matchedUpd || mod.hasUpdate || hasFlavorUpdate);

    const dedupKey = kDb || kHash || kTitle;
    if (dedupKey) addedTopKeys.add(dedupKey);

    const topIdx = topLevelVaultItems.length;
    topLevelVaultItems.push({
      hash: resolvedHash,
      dbId: resolvedDbId,
      name: cleanName,
      displayName: mod.displayName || mod.meta_name || cleanName,
      author: mod.author || firstFlavor?.author || undefined,
      version: mod.version || firstFlavor?.version || undefined,
      status: isCrit ? "broken" : isAlrt ? "unstable" : mod.status || "stable",
      isEquipped: Boolean(mod.enabled || mod.inActivePlayset || mod.isEquipped),
      hasUpdate: hasUpd,
      newVersion:
        matchedUpd?.newVersion ||
        mod.newVersion ||
        (Array.isArray(mod.flavors)
          ? mod.flavors.find((fl: any) => fl?.newVersion)?.newVersion
          : undefined) ||
        undefined,
      url: mod.download_url || mod.url || firstFlavor?.url || undefined,
      manifestUrl: mod.manifest_url || firstFlavor?.manifest_url || undefined,
      complianceTier: typeof mod.compliance_tier === "number" ? mod.compliance_tier : undefined,
      category: mod.category_override || mod.category || mod.type || undefined,
      alertType: isCrit ? "critical" : isAlrt ? "alert" : undefined,
    });

    const registerLookup = (rawStr?: string) => {
      if (!rawStr) return;
      const low = String(rawStr).toLowerCase().replace(/\\/g, "/");
      if (!nameToTopIndex.has(low)) nameToTopIndex.set(low, topIdx);
      const base = low.split("/").pop();
      if (base && !nameToTopIndex.has(base)) nameToTopIndex.set(base, topIdx);
      const noExt = stripSupportedExt(base);
      if (noExt && !nameToTopIndex.has(noExt)) nameToTopIndex.set(noExt, topIdx);
    };
    registerLookup(mod.name);
    registerLookup(mod.displayName);
    registerLookup(cleanName);
    if (Array.isArray(mod.flavors)) {
      mod.flavors.forEach((fl: any) => {
        registerLookup(fl?.name);
        registerLookup(fl?.displayName);
      });
    }
  }

  const criticalArtifacts = Array.isArray(exactDesktopSummary?.criticalItems)
    ? exactDesktopSummary!.criticalItems!.map((m) =>
        toCompanionArtifact(m, "broken", "critical")
      )
    : undefined;
  const alertArtifacts = Array.isArray(exactDesktopSummary?.alertItems)
    ? exactDesktopSummary!.alertItems!.map((m) =>
        toCompanionArtifact(m, "unstable", "alert")
      )
    : undefined;
  const updateArtifacts = Array.isArray(exactDesktopSummary?.updateItems)
    ? exactDesktopSummary!.updateItems!.map((m) => ({
        ...toCompanionArtifact(m, m?.status || "stable"),
        hasUpdate: true,
      }))
    : undefined;

  let effectivePlaySets: any[] = candidatePlaySets;
  if (effectivePlaySets.length === 0) {
    try {
      const wsId =
        localStorage.getItem("sanctuary_active_workspace") ||
        useStore.getState()?.activeWorkspaceId ||
        "";
      const rawSaved = wsId ? localStorage.getItem(`sanctuary_${wsId}_playsets`) : null;
      if (rawSaved) {
        const parsedSaved = JSON.parse(rawSaved);
        if (Array.isArray(parsedSaved)) {
          effectivePlaySets = parsedSaved;
        }
      }
    } catch {}
  }

  const desktopBlueprints: VaultCompanionDesktopBlueprint[] | undefined =
    effectivePlaySets.length > 0
      ? effectivePlaySets.map((ps: any) => {
          const rawMods = Array.isArray(ps?.mods) ? ps.mods : [];
          const matchedIdxSet = new Set<number>();
          rawMods.forEach((rm: any) => {
            const rawName = typeof rm === "string" ? rm : String(rm?.name || rm?.path || "");
            if (!rawName) return;
            const clean = rawName
              .replace(/^[1-4]_[A-Za-z]+_/i, "")
              .toLowerCase()
              .replace(/\\/g, "/");
            const base = clean.split("/").pop() || clean;
            const noExt = stripSupportedExt(base) || base;
            const idx =
              nameToTopIndex.get(clean) ??
              nameToTopIndex.get(base) ??
              nameToTopIndex.get(noExt);
            if (idx !== undefined) {
              matchedIdxSet.add(idx);
            }
          });
          const indices = Array.from(matchedIdxSet);
          return {
            name: String(ps?.name || "Blueprint"),
            code: ps?.code || undefined,
            isActive: Boolean(
              activeBlueprintName &&
                String(ps?.name || "").toLowerCase() === activeBlueprintName.toLowerCase()
            ),
            modsCount: indices.length > 0 ? indices.length : rawMods.length,
            artifactIndices: indices,
          };
        })
      : undefined;

  const snapshot: VaultCompanionSnapshot = {
    activeBlueprintName: activeBlueprintName || undefined,
    gameVersion: gameVersion || undefined,
    syncedAt: new Date().toISOString(),
    vaultCount: exactDesktopSummary?.vaultCount ?? topLevelVaultItems.length,
    criticalCount: exactDesktopSummary?.criticalCount ?? criticalArtifacts?.length,
    alertsCount: exactDesktopSummary?.alertsCount ?? alertArtifacts?.length,
    updatesCount: exactDesktopSummary?.updatesCount ?? updateArtifacts?.length,
    blueprintsCount: exactDesktopSummary?.blueprintsCount ?? desktopBlueprints?.length,
    criticalArtifacts,
    alertArtifacts,
    updateArtifacts,
    desktopBlueprints,
    artifacts: topLevelVaultItems,
  };

  const pushPromise = pushEncryptedVaultCompanionSnapshot(snapshot, session)
    .then((ok) => {
      if (ok) {
        lastCompanionSyncSignature = syncSig;
        lastCompanionSyncAt = Date.now();
      }
      return ok;
    })
    .finally(() => {
      if (inFlightCompanionSync === pushPromise) {
        inFlightCompanionSync = null;
      }
    });

  inFlightCompanionSync = pushPromise;
  return pushPromise;
}

