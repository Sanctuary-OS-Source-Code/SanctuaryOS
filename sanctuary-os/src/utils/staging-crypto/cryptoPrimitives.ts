import { supabase, supabaseAuth } from "../../supabase";
import { useStore } from "../../store";
import type { StagedCloudPayload } from "./types";
export * from "./types";

export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return btoa(parts.join(""));
}

export async function maybeCompressBytes(input: Uint8Array): Promise<Uint8Array> {
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

export async function maybeDecompressBytes(input: Uint8Array): Promise<Uint8Array> {
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

export function base64ToBytes(b64: string): Uint8Array {
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
const inFlightSecretResolutions = new Map<string, Promise<string>>();
const syncedKeyringSecrets = new Map<string, string>();
let keyringTableUnavailable = false;
const derivedAesKeyCache = new Map<string, Promise<CryptoKey>>();

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
 * Never embeds secret material into JWT `user_metadata`. Secret material is resolved from:
 * 1. Pairing QR/link URL fragment `#k=<secret>` (never transmitted in HTTP requests or public rows)
 * 2. In-memory or local device cache (`localStorage`), with automatic migration/removal of legacy JWT metadata
 * 3. Private RLS-isolated `user_encrypted_keyrings` table on Hub DB (`auth.uid() = user_id`), or fresh CSPRNG 256-bit secret.
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
    syncStagingSecretToKeyring(userId, clean);
    return clean;
  }

  const fromFragment = captureUrlFragmentStagingSecret(userId);
  if (fromFragment) {
    inMemoryStagingSecrets.set(userId, fromFragment);
    syncStagingSecretToKeyring(userId, fromFragment);
    return fromFragment;
  }

  const cachedMem = inMemoryStagingSecrets.get(userId);
  if (cachedMem && cachedMem.length >= 32) {
    return cachedMem;
  }

  const existingResolution = inFlightSecretResolutions.get(userId);
  if (existingResolution) {
    return existingResolution;
  }

  const resolutionPromise = (async (): Promise<string> => {
    const canSyncCloud =
      (typeof navigator === "undefined" || navigator.onLine) &&
      (typeof localStorage === "undefined" ||
        localStorage.getItem("sanctuary_local_only") !== "true") &&
      !keyringTableUnavailable;

    let keyringSecret = "";
    let legacyJwtSecret = "";
    try {
      const storeSession = useStore.getState()?.session;
      if (storeSession?.user?.id === userId) {
        const candidate = storeSession.user?.user_metadata?.staging_vault_secret_v2;
        if (typeof candidate === "string" && candidate.trim().length >= 32) {
          legacyJwtSecret = candidate.trim();
        }
      }

      if (canSyncCloud) {
        const { data: krRow, error: krErr } = await supabaseAuth
          .from("user_encrypted_keyrings")
          .select("staging_secret_v2")
          .eq("user_id", userId)
          .maybeSingle();

        if (krErr) {
          const msg = String(krErr.message || "");
          if (
            krErr.code === "PGRST205" ||
            krErr.code === "42P01" ||
            (krErr as any).status === 404 ||
            msg.includes("404")
          ) {
            keyringTableUnavailable = true;
          }
        } else if (
          krRow &&
          typeof (krRow as any).staging_secret_v2 === "string" &&
          (krRow as any).staging_secret_v2.trim().length >= 32
        ) {
          keyringSecret = (krRow as any).staging_secret_v2.trim();
          syncedKeyringSecrets.set(userId, keyringSecret);
        }
      }

      if (!keyringSecret && !legacyJwtSecret) {
        const { data } = await supabaseAuth.auth.getSession();
        if (data?.session?.user?.id === userId) {
          const candidate = data.session.user?.user_metadata?.staging_vault_secret_v2;
          if (typeof candidate === "string" && candidate.trim().length >= 32) {
            legacyJwtSecret = candidate.trim();
          }
        }
      }
    } catch {}

    const cloudSecret = keyringSecret || legacyJwtSecret;
    if (cloudSecret) {
      inMemoryStagingSecrets.set(userId, cloudSecret);
      try {
        localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, cloudSecret);
      } catch {}
      // Migrate legacy JWT user_metadata secret into isolated RLS table and scrub it from JWT tokens
      if (legacyJwtSecret || !keyringSecret) {
        syncStagingSecretToKeyring(userId, cloudSecret, Boolean(legacyJwtSecret));
      }
      return cloudSecret;
    }

    try {
      const localSecret = (localStorage.getItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`) || "").trim();
      if (localSecret.length >= 32) {
        inMemoryStagingSecrets.set(userId, localSecret);
        syncStagingSecretToKeyring(userId, localSecret);
        return localSecret;
      }
    } catch {}

    const generated = generateRandom256BitHex();
    inMemoryStagingSecrets.set(userId, generated);
    try {
      localStorage.setItem(`${STAGING_SECRET_STORAGE_PREFIX}${userId}`, generated);
    } catch {}
    syncStagingSecretToKeyring(userId, generated);
    return generated;
  })();

  inFlightSecretResolutions.set(userId, resolutionPromise);
  try {
    return await resolutionPromise;
  } finally {
    inFlightSecretResolutions.delete(userId);
  }
}

function syncStagingSecretToKeyring(
  userId: string,
  secret: string,
  scrubLegacyJwtMetadata = false
): void {
  if (!userId || !secret || inFlightSecretSyncs.has(userId)) return;
  if (keyringTableUnavailable) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true"
  ) {
    return;
  }
  if (syncedKeyringSecrets.get(userId) === secret && !scrubLegacyJwtMetadata) {
    return;
  }
  inFlightSecretSyncs.add(userId);
  (async () => {
    try {
      if (syncedKeyringSecrets.get(userId) !== secret) {
        const { error: upsertErr } = await supabaseAuth
          .from("user_encrypted_keyrings")
          .upsert({
            user_id: userId,
            staging_secret_v2: secret,
            updated_at: new Date().toISOString(),
          });
        if (upsertErr) {
          const msg = String(upsertErr.message || "");
          if (
            upsertErr.code === "PGRST205" ||
            upsertErr.code === "42P01" ||
            (upsertErr as any).status === 404 ||
            msg.includes("404")
          ) {
            keyringTableUnavailable = true;
          }
        } else {
          syncedKeyringSecrets.set(userId, secret);
        }
      }
      const { data } = await supabaseAuth.auth.getSession();
      if (
        (scrubLegacyJwtMetadata ||
          data?.session?.user?.user_metadata?.staging_vault_secret_v2 !== undefined) &&
        data?.session?.user?.id === userId &&
        data.session.user?.user_metadata?.staging_vault_secret_v2 !== null
      ) {
        // Strip secret material out of JWT raw_user_meta_data so bearer tokens carry zero E2EE secrets
        await supabaseAuth.auth.updateUser({
          data: { staging_vault_secret_v2: null },
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
  spokeSupporters?: any[];
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

export interface EncryptedNotificationSyncPayload {
  version: 1;
  updated_at: string;
  prefs_updated_at?: number;
  delivered_ids?: Record<string, number>;
  read_hub_ids?: Record<string, number>;
  dismissed_hub_ids?: Record<string, number>;
  dismissed_global_alerts?: Record<string, number>;
  prefs?: {
    os_enabled?: boolean;
    cross_workspace_enabled?: boolean;
    allowed_cross_spokes?: string[] | null;
    mod_alerts_bp_scope?: string;
    notify_author_only?: boolean;
    modes_global?: Record<string, string>;
    modes_by_spoke?: Record<string, Record<string, string>>;
    muted_spokes_by_category?: Record<string, string[]>;
    mason_alerts?: Record<string, Record<string, boolean>>;
  };
}

export async function deriveUserNotificationSyncToken(
  userId: string,
  email?: string,
  explicitSecret?: string
): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  return sha256HexUtf8(
    `sanctuary_notif_sync_v1:${userId}:${(email || "").trim().toLowerCase()}:${secret}`
  );
}

export async function pushEncryptedNotificationSyncState(
  syncPayload: EncryptedNotificationSyncPayload,
  session: any
): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true"
  ) {
    return false;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const notifToken = await deriveUserNotificationSyncToken(
      session.user.id,
      session.user.email
    );
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);

    const rawPlaintext = new TextEncoder().encode(JSON.stringify(syncPayload));
    const plaintext = await maybeCompressBytes(rawPlaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      plaintext as unknown as BufferSource
    );

    const client = supabaseAuth || supabase;
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const { data: insertedRows, error } = await client
      .from("citizen_staging_queue")
      .insert([
        {
          user_token: notifToken,
          payload_type: "notification_state_sync",
          encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
          iv: bytesToBase64(iv),
          salt: bytesToBase64(salt),
          item_count: 0,
          expires_at: new Date(Date.now() + tenYearsMs).toISOString(),
        },
      ])
      .select("id");
    if (error) throw error;

    const insertedId = Array.isArray(insertedRows) ? insertedRows[0]?.id : undefined;
    if (insertedId) {
      await client
        .from("citizen_staging_queue")
        .delete()
        .eq("user_token", notifToken)
        .eq("payload_type", "notification_state_sync")
        .neq("id", insertedId);
    }
    return true;
  } catch (err) {
    console.warn("Failed to push Zero-PII notification sync state:", err);
    return false;
  }
}

export async function pullEncryptedNotificationSyncState(
  session: any
): Promise<EncryptedNotificationSyncPayload | null> {
  if (!session?.user?.id) return null;
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true"
  ) {
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const notifToken = await deriveUserNotificationSyncToken(
      session.user.id,
      session.user.email
    );
    const client = supabaseAuth || supabase;
    const { data, error } = await client
      .from("citizen_staging_queue")
      .select("encrypted_payload, iv, salt, created_at")
      .eq("user_token", notifToken)
      .eq("payload_type", "notification_state_sync")
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
    ) as EncryptedNotificationSyncPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.warn("Failed to pull Zero-PII notification sync state:", err);
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

export async function deriveAesGcmKey(
  userId: string,
  email: string | undefined,
  salt: Uint8Array,
  explicitSecret?: string
): Promise<CryptoKey> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  const cacheKey = `${userId}|${(email || "").trim().toLowerCase()}|${bytesToBase64(salt)}|${secret.slice(0, 16)}`;
  const existingKeyPromise = derivedAesKeyCache.get(cacheKey);
  if (existingKeyPromise) {
    return existingKeyPromise;
  }

  const keyPromise = (async (): Promise<CryptoKey> => {
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
  })().catch((err) => {
    derivedAesKeyCache.delete(cacheKey);
    throw err;
  });

  if (derivedAesKeyCache.size >= 24) {
    const oldestKey = derivedAesKeyCache.keys().next().value;
    if (oldestKey) derivedAesKeyCache.delete(oldestKey);
  }
  derivedAesKeyCache.set(cacheKey, keyPromise);
  return keyPromise;
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
