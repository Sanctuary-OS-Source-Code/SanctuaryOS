import { supabase, supabaseAuth, getActiveGameClient } from "../../supabase";
import { useStore } from "../../store";
import { triggerPwaWebPush } from "../webPushClient";
import { resolveStagingVaultSecret } from "../stagingCrypto";
import { getPasskeyDeviceLabel, base64UrlToUint8Array, fetchUserPasskeysViaRest, markPasskeySessionVerified, notifyMfaStateChanged } from "./core";
import { authenticateFidoPasskey } from "./webauthnOps";

export interface CompanionWebAuthnAssertionProof {
  id: string;
  rawId?: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  challengeId?: string;
}

export interface CompanionPasskeyHandshakePayload {
  handshakeId: string;
  handshakeCode: string;
  challengeNonce: string;
  requestingDevice: string;
  targetScope: string;
  status: "pending" | "approved";
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
  approverDevice?: string;
  approvalSignature?: string;
  webauthnAssertion?: CompanionWebAuthnAssertionProof;
}

export interface ResolvedCompanionPasskeyHandshake {
  rowId: string;
  payload: CompanionPasskeyHandshakePayload;
}

function bytesToBase64UrlSafe(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytesSafe(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function derivePasskeyHandshakeToken(
  userId: string,
  email?: string
): Promise<string> {
  const vaultSecret = await resolveStagingVaultSecret(userId);
  return sha256Hex(
    `sanctuary_citizen_passkey_handshake_v2:${userId}:${(email || "").trim().toLowerCase()}:${vaultSecret}`
  );
}

async function deriveHandshakeAesKey(
  userId: string,
  email: string | undefined,
  salt: Uint8Array
): Promise<CryptoKey> {
  const vaultSecret = await resolveStagingVaultSecret(userId);
  const passphrase = `${userId}::${(email || "").trim().toLowerCase()}::${vaultSecret}::sanctuary_passkey_handshake_key_v2`;
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

async function encryptHandshakePayload(
  payload: CompanionPasskeyHandshakePayload,
  userId: string,
  email?: string
): Promise<{ encrypted_payload: string; iv: string; salt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveHandshakeAesKey(userId, email, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext
  );
  return {
    encrypted_payload: bytesToBase64UrlSafe(new Uint8Array(ciphertext)),
    iv: bytesToBase64UrlSafe(iv),
    salt: bytesToBase64UrlSafe(salt),
  };
}

async function decryptHandshakePayload(
  encrypted_payload: string,
  ivB64: string,
  saltB64: string,
  userId: string,
  email?: string
): Promise<CompanionPasskeyHandshakePayload | null> {
  try {
    const salt = base64ToBytesSafe(saltB64);
    const iv = base64ToBytesSafe(ivB64);
    const ciphertext = base64ToBytesSafe(encrypted_payload);
    const key = await deriveHandshakeAesKey(userId, email, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const jsonStr = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(jsonStr) as CompanionPasskeyHandshakePayload;
  } catch {
    return null;
  }
}

const LOCAL_HANDSHAKE_IDS_STORAGE_KEY = "sanctuary_local_handshake_ids_v1";
const locallyInitiatedHandshakeIds = new Set<string>();

function markLocallyInitiatedHandshake(handshakeId: string): void {
  if (!handshakeId) return;
  locallyInitiatedHandshakeIds.add(handshakeId);
  try {
    const raw = sessionStorage.getItem(LOCAL_HANDSHAKE_IDS_STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(handshakeId)) {
      list.push(handshakeId);
      sessionStorage.setItem(
        LOCAL_HANDSHAKE_IDS_STORAGE_KEY,
        JSON.stringify(list.slice(-20))
      );
    }
  } catch {}
}

export function isLocallyInitiatedHandshake(handshakeId: string): boolean {
  if (!handshakeId) return false;
  if (locallyInitiatedHandshakeIds.has(handshakeId)) return true;
  try {
    const raw = sessionStorage.getItem(LOCAL_HANDSHAKE_IDS_STORAGE_KEY);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return Array.isArray(list) && list.includes(handshakeId);
  } catch {
    return false;
  }
}

function validateWebAuthnAssertionProof(
  proof?: CompanionWebAuthnAssertionProof | null
): boolean {
  if (
    !proof ||
    typeof proof.id !== "string" ||
    !proof.id.trim() ||
    typeof proof.authenticatorData !== "string" ||
    typeof proof.clientDataJSON !== "string" ||
    typeof proof.signature !== "string"
  ) {
    return false;
  }
  try {
    const authData = base64UrlToUint8Array(proof.authenticatorData);
    // WebAuthn authenticatorData: 32-byte rpIdHash + 1-byte flags + 4-byte signCount = min 37 bytes
    // Flag bit 0 (0x01) = User Present (UP) MUST be 1
    if (authData.byteLength < 37 || (authData[32] & 0x01) === 0) {
      return false;
    }
    const sigBytes = base64UrlToUint8Array(proof.signature);
    if (sigBytes.byteLength < 32) {
      return false;
    }
    const clientDataBytes = base64UrlToUint8Array(proof.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
    if (
      !clientData ||
      clientData.type !== "webauthn.get" ||
      typeof clientData.challenge !== "string" ||
      clientData.challenge.length < 16
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function computeHandshakeApprovalSignature(
  challengeNonce: string,
  handshakeId: string,
  handshakeCode: string,
  userId: string,
  assertion: CompanionWebAuthnAssertionProof
): Promise<string> {
  return sha256Hex(
    `${challengeNonce}:${handshakeId}:${handshakeCode}:${userId}:${assertion.id}:${assertion.authenticatorData}:${assertion.signature}:APPROVED_BY_WEBAUTHN_ASSERTION_V2`
  );
}

async function resolveSignedInUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const storeUser = useStore.getState()?.session?.user;
    if (storeUser?.id) return storeUser;
  } catch {}
  try {
    const { data } = await supabaseAuth.auth.getSession();
    if (data?.session?.user?.id) return data.session.user;
  } catch {}
  return null;
}

export async function getPasskeyHandshakeClients(): Promise<any[]> {
  const clients: any[] = [supabaseAuth];
  try {
    const activeWsId = useStore.getState()?.activeWorkspaceId;
    if (activeWsId && activeWsId !== "default_workspace" && getActiveGameClient()) {
      clients.push(supabase);
    }
  } catch {}
  return clients;
}

/**
 * Initiates a 3-minute Zero-PII AES-256-GCM Companion Passkey Handshake request on a device
 * (such as Steam Deck, Linux, or macOS) that requires another device (Mobile PWA / Web / Windows PC)
 * to perform a live FIDO2 Passkey ceremony right then and there to unlock Elevated Hubs.
 */
export async function startCompanionPasskeyHandshake(
  targetScope = "Elevated Hub Access"
): Promise<{
  data: ResolvedCompanionPasskeyHandshake | null;
  error: Error | null;
}> {
  try {
    const user = await resolveSignedInUser();
    if (!user?.id) {
      return {
        data: null,
        error: new Error("You must be signed in to start a Companion Passkey Handshake."),
      };
    }

    const userToken = await derivePasskeyHandshakeToken(user.id, user.email);
    const randDigits = new Uint32Array(2);
    window.crypto.getRandomValues(randDigits);
    const partA = String(100 + (randDigits[0] % 900));
    const partB = String(100 + (randDigits[1] % 900));
    const handshakeCode = `${partA}-${partB}`;

    const nonceBytes = new Uint8Array(32);
    window.crypto.getRandomValues(nonceBytes);
    const challengeNonce = Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const handshakeId =
      typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `hs_${Date.now()}_${partA}${partB}`;

    markLocallyInitiatedHandshake(handshakeId);

    const now = Date.now();
    const expiresAt = now + 3 * 60 * 1000; // Strict 3-minute live window

    const payload: CompanionPasskeyHandshakePayload = {
      handshakeId,
      handshakeCode,
      challengeNonce,
      requestingDevice: getPasskeyDeviceLabel(),
      targetScope,
      status: "pending",
      createdAt: now,
      expiresAt,
    };

    const { encrypted_payload, iv, salt } = await encryptHandshakePayload(
      payload,
      user.id,
      user.email
    );

    const clients = await getPasskeyHandshakeClients();
    await Promise.all(
      clients.map(async (c) => {
        try {
          await c
            .from("citizen_staging_queue")
            .delete()
            .eq("user_token", userToken);
        } catch {}
      })
    );

    const rowPayload = {
      user_token: userToken,
      payload_type: "passkey_handshake",
      encrypted_payload,
      iv,
      salt,
      item_count: 1,
      expires_at: new Date(expiresAt).toISOString(),
    };

    const { data, error } = await supabaseAuth
      .from("citizen_staging_queue")
      .insert([rowPayload])
      .select("id")
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    // Mirror into Spoke staging queue as well so both Core Hub DB and Spoke DB clients can see & approve it
    const insertedId = data?.id;
    for (const c of clients) {
      if (c === supabaseAuth) continue;
      (async () => {
        try {
          await c
            .from("citizen_staging_queue")
            .insert([insertedId ? { id: insertedId, ...rowPayload } : rowPayload]);
        } catch {}
      })();
    }

    triggerPwaWebPush({
      type: "passkey_handshake",
      handshake_token: userToken,
      title: "Approve Rig Passkey Handshake",
      body: `${payload.requestingDevice} (${payload.targetScope}) • Code: ${payload.handshakeCode}`,
      data: {
        actionTypeId: "PASSKEY_HANDSHAKE",
        handshakeId: payload.handshakeId,
        handshakeCode: payload.handshakeCode,
      },
    });

    return {
      data: {
        rowId: data?.id || "",
        payload,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Polls the status of an active Companion Passkey Handshake on the requesting rig.
 * When approved by a live Passkey ceremony on the companion device, verifies the cryptographic
 * signature, shreds the handshake row, and activates the local Passkey session seal.
 */
export async function pollCompanionPasskeyHandshake(
  handshakeId: string,
  expectedNonce: string
): Promise<{
  status: "pending" | "approved" | "expired";
  approverDevice?: string;
}> {
  try {
    const user = await resolveSignedInUser();
    if (!user?.id) return { status: "expired" };

    const userToken = await derivePasskeyHandshakeToken(user.id, user.email);
    const clients = await getPasskeyHandshakeClients();

    const queryResults = await Promise.all(
      clients.map(async (client) => {
        try {
          const res: any = await client
            .from("citizen_staging_queue")
            .select("*")
            .eq("user_token", userToken)
            .order("created_at", { ascending: false })
            .limit(5);
          return { client, rows: Array.isArray(res?.data) ? res.data : [] };
        } catch {
          return { client, rows: [] };
        }
      })
    );

    const allEntries: { client: any; row: any }[] = [];
    for (const qr of queryResults) {
      for (const row of qr.rows) {
        allEntries.push({ client: qr.client, row });
      }
    }

    if (allEntries.length === 0) {
      return { status: "expired" };
    }

    let sawMatchingPending = false;

    for (const { client, row } of allEntries) {
      if (!row?.encrypted_payload || !row?.iv || !row?.salt) continue;
      const decrypted = await decryptHandshakePayload(
        row.encrypted_payload,
        row.iv,
        row.salt,
        user.id,
        user.email
      );
      if (!decrypted || decrypted.handshakeId !== handshakeId) continue;

      if (Date.now() > decrypted.expiresAt) {
        try {
          await client.from("citizen_staging_queue").delete().eq("id", row.id);
        } catch {}
        continue;
      }

      if (
        decrypted.status === "approved" &&
        decrypted.approvalSignature &&
        validateWebAuthnAssertionProof(decrypted.webauthnAssertion)
      ) {
        const assertion = decrypted.webauthnAssertion!;
        const expectedSig = await computeHandshakeApprovalSignature(
          expectedNonce,
          handshakeId,
          decrypted.handshakeCode,
          user.id,
          assertion
        );

        // Verify server-stamped last_passkey_verified_at claim instead of transmitting raw JWT bearer tokens
        await supabaseAuth.auth.refreshSession().catch(() => null);
        const { data: verifiedUserData, error: verifyErr } = await supabaseAuth.auth.getUser();
        const serverPasskeyTs = Date.parse(
          String(verifiedUserData?.user?.app_metadata?.last_passkey_verified_at || "")
        );
        const tokenVerified =
          !verifyErr &&
          verifiedUserData?.user?.id === user.id &&
          Number.isFinite(serverPasskeyTs) &&
          serverPasskeyTs >= decrypted.createdAt - 10_000;

        // Verify the assertion credential ID belongs to one of the user's registered passkeys when enumerable
        let credentialRecognized = true;
        if (tokenVerified) {
          const registeredPasskeys = await fetchUserPasskeysViaRest();
          if (registeredPasskeys.length > 0) {
            const matchingCred = registeredPasskeys.some((pk: any) => {
              const cid = String(
                pk?.credential_id || pk?.credentialId || pk?.webauthn_credential_id || pk?.id || ""
              );
              return cid === assertion.id || cid === assertion.rawId;
            });
            // Only enforce ID match if Supabase GoTrue returned explicit credential_id fields
            const hasExplicitCredIds = registeredPasskeys.some((pk: any) =>
              Boolean(pk?.credential_id || pk?.credentialId || pk?.webauthn_credential_id)
            );
            if (hasExplicitCredIds && !matchingCred) {
              credentialRecognized = false;
            }
          }
        }

        if (
          tokenVerified &&
          credentialRecognized &&
          decrypted.approvalSignature === expectedSig &&
          decrypted.approvedAt &&
          Date.now() - decrypted.approvedAt < 180_000
        ) {
          await Promise.all(
            clients.map(async (c) => {
              try {
                await c
                  .from("citizen_staging_queue")
                  .delete()
                  .eq("user_token", userToken);
              } catch {}
            })
          );
          markPasskeySessionVerified(user.id);
          notifyMfaStateChanged();
          return {
            status: "approved",
            approverDevice: decrypted.approverDevice || "Companion Device",
          };
        }
      }

      sawMatchingPending = true;
    }

    return sawMatchingPending ? { status: "pending" } : { status: "expired" };
  } catch {
    return { status: "pending" };
  }
}

export async function cancelCompanionPasskeyHandshake(rowId?: string): Promise<void> {
  try {
    const clients = await getPasskeyHandshakeClients();
    const user = await resolveSignedInUser();
    const userToken = user?.id
      ? await derivePasskeyHandshakeToken(user.id, user.email)
      : "";

    await Promise.all(
      clients.map(async (c) => {
        try {
          if (rowId) {
            await c.from("citizen_staging_queue").delete().eq("id", rowId);
          }
          if (userToken) {
            await c.from("citizen_staging_queue").delete().eq("user_token", userToken);
          }
        } catch {}
      })
    );
  } catch {}
}

/**
 * Fetches any active, non-expired pending Companion Passkey Handshake requests for the signed-in account.
 */
export async function fetchPendingCompanionPasskeyHandshakes(): Promise<
  ResolvedCompanionPasskeyHandshake[]
> {
  try {
    const user = await resolveSignedInUser();
    if (!user?.id) return [];

    const userToken = await derivePasskeyHandshakeToken(user.id, user.email);
    const clients = await getPasskeyHandshakeClients();

    const queryResults = await Promise.all(
      clients.map(async (client) => {
        try {
          const res: any = await client
            .from("citizen_staging_queue")
            .select("*")
            .eq("user_token", userToken)
            .order("created_at", { ascending: false })
            .limit(5);
          return { client, rows: Array.isArray(res?.data) ? res.data : [] };
        } catch {
          return { client, rows: [] };
        }
      })
    );

    const results: ResolvedCompanionPasskeyHandshake[] = [];
    const seenHandshakeIds = new Set<string>();

    for (const { client, rows } of queryResults) {
      const expiredIds: string[] = [];
      for (const row of rows) {
        if (!row?.encrypted_payload || !row?.iv || !row?.salt) continue;
        const decrypted = await decryptHandshakePayload(
          row.encrypted_payload,
          row.iv,
          row.salt,
          user.id,
          user.email
        );
        if (!decrypted) continue;
        if (Date.now() > decrypted.expiresAt) {
          expiredIds.push(row.id);
          continue;
        }
        if (isLocallyInitiatedHandshake(decrypted.handshakeId)) {
          continue;
        }
        if (decrypted.status === "pending" && !seenHandshakeIds.has(decrypted.handshakeId)) {
          seenHandshakeIds.add(decrypted.handshakeId);
          results.push({
            rowId: row.id,
            payload: decrypted,
          });
        }
      }

      if (expiredIds.length > 0) {
        (async () => {
          try {
            await client
              .from("citizen_staging_queue")
              .delete()
              .in("id", expiredIds);
          } catch {}
        })();
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Approves a pending Companion Passkey Handshake ONLY after executing a live FIDO2 Passkey
 * hardware/biometric ceremony right then and there on the approving device.
 */
export async function approveCompanionPasskeyHandshake(
  handshake: ResolvedCompanionPasskeyHandshake,
  enteredCode?: string
): Promise<{
  success: boolean;
  error: Error | null;
}> {
  try {
    const user = await resolveSignedInUser();
    if (!user?.id) {
      return {
        success: false,
        error: new Error("You must be signed in to approve a Companion Passkey Handshake."),
      };
    }

    if (Date.now() > handshake.payload.expiresAt) {
      await cancelCompanionPasskeyHandshake(handshake.rowId);
      return {
        success: false,
        error: new Error("This Companion Passkey Handshake code has expired. Start a new handshake on your rig."),
      };
    }

    if (typeof enteredCode === "string" && enteredCode.trim().length > 0) {
      const cleanEntered = enteredCode.replace(/[^0-9]/g, "");
      const cleanExpected = handshake.payload.handshakeCode.replace(/[^0-9]/g, "");
      if (cleanEntered !== cleanExpected) {
        return {
          success: false,
          error: new Error("Handshake code does not match the 6-digit code displayed on your rig."),
        };
      }
    }

    // MANDATORY LIVE PASSKEY STEP-UP RIGHT THEN AND THERE (real WebAuthn assertion required)
    const authRes = await authenticateFidoPasskey(undefined, {
      forceFreshCeremony: true,
    });
    const rawCred = authRes.data?.credential;
    const webauthnAssertion: CompanionWebAuthnAssertionProof | undefined =
      rawCred && rawCred.response
        ? {
            id: String(rawCred.id || ""),
            rawId: rawCred.rawId ? String(rawCred.rawId) : undefined,
            authenticatorData: String(rawCred.response.authenticatorData || ""),
            clientDataJSON: String(rawCred.response.clientDataJSON || ""),
            signature: String(rawCred.response.signature || ""),
            challengeId: authRes.data?.challenge_id
              ? String(authRes.data.challenge_id)
              : undefined,
          }
        : undefined;

    if (
      authRes.error ||
      !authRes.data ||
      !validateWebAuthnAssertionProof(webauthnAssertion)
    ) {
      return {
        success: false,
        error:
          authRes.error ||
          new Error("Live FIDO2 WebAuthn Passkey assertion is required to approve a handshake."),
      };
    }

    const { data: currentSessData } = await supabaseAuth.auth.getSession();
    const verifiedAccessToken =
      authRes.data?.access_token || currentSessData?.session?.access_token || "";
    if (!verifiedAccessToken) {
      return {
        success: false,
        error: new Error("Verified session token missing after Passkey ceremony."),
      };
    }

    const approvalSignature = await computeHandshakeApprovalSignature(
      handshake.payload.challengeNonce,
      handshake.payload.handshakeId,
      handshake.payload.handshakeCode,
      user.id,
      webauthnAssertion!
    );

    const updatedPayload: CompanionPasskeyHandshakePayload = {
      ...handshake.payload,
      status: "approved",
      approvedAt: Date.now(),
      approverDevice: getPasskeyDeviceLabel(),
      approvalSignature,
      webauthnAssertion: webauthnAssertion!,
    };

    const { encrypted_payload, iv, salt } = await encryptHandshakePayload(
      updatedPayload,
      user.id,
      user.email
    );

    const userToken = await derivePasskeyHandshakeToken(user.id, user.email);
    const clients = await getPasskeyHandshakeClients();
    let anyUpdated = false;
    let lastErr: any = null;

    await Promise.all(
      clients.map(async (client) => {
        try {
          const { data: byIdData, error: byIdErr } = await client
            .from("citizen_staging_queue")
            .update({
              encrypted_payload,
              iv,
              salt,
            })
            .eq("id", handshake.rowId)
            .select("id");

          if (!byIdErr && Array.isArray(byIdData) && byIdData.length > 0) {
            anyUpdated = true;
            return;
          }

          const { data: byTokenData, error: byTokenErr } = await client
            .from("citizen_staging_queue")
            .update({
              encrypted_payload,
              iv,
              salt,
            })
            .eq("user_token", userToken)
            .select("id");

          if (!byTokenErr && Array.isArray(byTokenData) && byTokenData.length > 0) {
            anyUpdated = true;
          } else if (byTokenErr || byIdErr) {
            lastErr = byTokenErr || byIdErr;
          }
        } catch (err) {
          lastErr = err;
        }
      })
    );

    if (!anyUpdated && lastErr) {
      return {
        success: false,
        error: new Error(lastErr.message || String(lastErr)),
      };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

