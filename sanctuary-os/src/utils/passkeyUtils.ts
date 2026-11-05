import { createClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop, isLinuxDesktop } from "./envUtils";
import {
  supabaseAuth,
  getActiveGameClient,
  getSpokeClientById,
  RESOLVED_SANCTUARY_CONFIG,
} from "../supabase";
import { useStore } from "../store";
import { triggerPwaWebPush } from "./webPushClient";

export interface MfaSecurityState {
  passkeys: any[];
  totpFactors: any[];
  allVerifiedFactors: any[];
  hasPasskey: boolean;
  hasTotp: boolean;
  isPasskeyVerified: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
}

export function isLocalhostBrowser(): boolean {
  if (!import.meta.env.DEV || isDesktop() || typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

let devBridgeInitialized = false;

export function initDevPasskeyBridge(): void {
  if (devBridgeInitialized || !import.meta.env.DEV || !isDesktop() || typeof window === "undefined") {
    return;
  }
  devBridgeInitialized = true;
  try {
    const es = new EventSource("/__dev-webauthn/stream");
    es.onmessage = async (event) => {
      try {
        const { requestId, kind, options } = JSON.parse(event.data || "{}");
        if (!requestId) return;
        try {
          const cmd =
            kind === "register" ? "native_webauthn_register" : "native_webauthn_authenticate";
          const credential = await invoke(cmd, { options });
          await fetch("/__dev-webauthn/response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, credential }),
          });
        } catch (err: any) {
          await fetch("/__dev-webauthn/response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              error: err?.message || String(err),
            }),
          });
        }
      } catch {}
    };
  } catch {}
}

export async function syncDevSessionToVite(session: any): Promise<void> {
  if (!import.meta.env.DEV || !session?.access_token || !session?.refresh_token) return;
  if (!isDesktop() && !isLocalhostBrowser()) return;
  try {
    await fetch("/__dev-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user?.id,
      }),
    });
  } catch {}
}

export async function clearDevSessionOnVite(): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (!isDesktop() && !isLocalhostBrowser()) return;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("sanctuary_dev_signed_out", "true");
    }
    await fetch("/__dev-session", { method: "DELETE" });
  } catch {}
}

export async function restoreDevSessionFromVite(): Promise<any | null> {
  if (!import.meta.env.DEV || !isLocalhostBrowser()) return null;
  try {
    const res = await fetch("/__dev-session");
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const devSession = json?.session;
    if (!devSession?.access_token || !devSession?.refresh_token) return null;
    const { data, error } = await supabaseAuth.auth.setSession({
      access_token: devSession.access_token,
      refresh_token: devSession.refresh_token,
    });
    if (error || !data?.session) return null;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("sanctuary_dev_signed_out");
    }
    markPasskeySessionVerified(data.session.user?.id);
    notifyMfaStateChanged();
    return data.session;
  } catch {
    return null;
  }
}

async function requestDevDesktopWebAuthn(
  kind: "register" | "authenticate",
  options: any
): Promise<{ handled: boolean; credential: any | null; error: Error | null }> {
  if (!import.meta.env.DEV || !isLocalhostBrowser()) {
    return { handled: false, credential: null, error: null };
  }
  try {
    const res = await fetch("/__dev-webauthn/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, options }),
    });
    if (res.status === 404) {
      return { handled: false, credential: null, error: null };
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return {
        handled: true,
        credential: null,
        error: new Error(json?.error || "Desktop WebAuthn bridge failed."),
      };
    }
    if (json?.credential) {
      return { handled: true, credential: json.credential, error: null };
    }
    return { handled: false, credential: null, error: null };
  } catch {
    return { handled: false, credential: null, error: null };
  }
}

export function isWebAuthnSupported(): boolean {
  if (isDesktop()) return true;
  return (
    typeof window !== "undefined" &&
    "PublicKeyCredential" in window &&
    Boolean(window.PublicKeyCredential) &&
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

/**
 * Returns true if the current client has a direct local WebAuthn bridge (Browser WebAuthn on Web/PWA,
 * Windows Hello `webauthn.dll` on Windows Desktop, or macOS Touch ID / LocalAuthentication on macOS Desktop).
 * Returns false on SteamOS/Linux Desktop, where Companion Passkey Handshake is used as the primary
 * hardware/biometric Passkey verification flow.
 */
export function isNativeLocalPasskeySupported(): boolean {
  if (!isDesktop()) {
    return isWebAuthnSupported();
  }
  if (isLinuxDesktop()) return false;
  return true;
}

export function getPasskeyDeviceLabel(): string {
  if (isLinuxDesktop()) return "SteamOS / Steam Deck Rig";
  if (isDesktop()) {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    if (/Macintosh|Mac OS X/i.test(ua)) return "macOS Desktop Rig";
    return "Windows Desktop Rig";
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "Mobile Companion PWA";
  return "Web Browser Companion";
}

/**
 * Masks an email address 
 * so raw emails are never exposed in UI panels or screenshots.
 */
export function maskEmailAddress(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return trimmed;
  return trimmed.replace(/(.).*(@.*)/, "$1***$2");
}

/**
 * Strips raw email addresses from legacy factor friendly names
 */
export function sanitizeFactorFriendlyName(
  rawName: string | null | undefined,
  fallback: string
): string {
  if (!rawName || typeof rawName !== "string") return fallback;
  const trimmed = rawName.trim();
  if (!trimmed) return fallback;
  if (trimmed.includes("@")) {
    const suffixMatch = trimmed.match(/\(\d+\)$/);
    return suffixMatch ? `${fallback} ${suffixMatch[0]}` : fallback;
  }
  return trimmed;
}

export function isElevatedRoleRequiringPasskey(params: {
  userRole?: string | null;
  osRole?: string | null;
  isVerifiedMason?: boolean;
}): boolean {
  const uRole = (params.userRole || "").toLowerCase();
  const oRole = (params.osRole || "").toLowerCase();
  if (params.isVerifiedMason) return true;
  if (["architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(uRole)) {
    return true;
  }
  if (["keeper", "core_dev", "admin"].includes(oRole)) {
    return true;
  }
  return false;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLen);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deserializeCreationOptions(options: any): PublicKeyCredentialCreationOptions {
  if (
    typeof PublicKeyCredential !== "undefined" &&
    typeof (PublicKeyCredential as any).parseCreationOptionsFromJSON === "function"
  ) {
    return (PublicKeyCredential as any).parseCreationOptionsFromJSON(options);
  }
  const { challenge, user, excludeCredentials, ...rest } = options;
  return {
    ...rest,
    challenge: base64UrlToUint8Array(challenge).buffer as ArrayBuffer,
    user: {
      ...user,
      id: base64UrlToUint8Array(user.id).buffer as ArrayBuffer,
    },
    excludeCredentials: Array.isArray(excludeCredentials)
      ? excludeCredentials.map((c: any) => ({
          ...c,
          id: base64UrlToUint8Array(c.id).buffer as ArrayBuffer,
          type: c.type || "public-key",
        }))
      : undefined,
  };
}

function deserializeRequestOptions(options: any): PublicKeyCredentialRequestOptions {
  if (
    typeof PublicKeyCredential !== "undefined" &&
    typeof (PublicKeyCredential as any).parseRequestOptionsFromJSON === "function"
  ) {
    return (PublicKeyCredential as any).parseRequestOptionsFromJSON(options);
  }
  const { challenge, allowCredentials, ...rest } = options;
  return {
    ...rest,
    challenge: base64UrlToUint8Array(challenge).buffer as ArrayBuffer,
    allowCredentials: Array.isArray(allowCredentials)
      ? allowCredentials.map((c: any) => ({
          ...c,
          id: base64UrlToUint8Array(c.id).buffer as ArrayBuffer,
          type: c.type || "public-key",
        }))
      : undefined,
  };
}

function serializeRegistrationCredential(cred: PublicKeyCredential): any {
  if (typeof (cred as any).toJSON === "function") {
    return (cred as any).toJSON();
  }
  const resp = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64Url(resp.clientDataJSON),
      attestationObject: bufferToBase64Url(resp.attestationObject),
      transports: typeof resp.getTransports === "function" ? resp.getTransports() : ["internal", "hybrid"],
    },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: (cred as any).authenticatorAttachment || "platform",
  };
}

function serializeAuthenticationCredential(cred: PublicKeyCredential): any {
  if (typeof (cred as any).toJSON === "function") {
    return (cred as any).toJSON();
  }
  const resp = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufferToBase64Url(resp.authenticatorData),
      clientDataJSON: bufferToBase64Url(resp.clientDataJSON),
      signature: bufferToBase64Url(resp.signature),
      userHandle: resp.userHandle ? bufferToBase64Url(resp.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: (cred as any).authenticatorAttachment || "platform",
  };
}

async function getAuthHeaders(requireJwt = true): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = {
    apikey: RESOLVED_SANCTUARY_CONFIG.supabaseAnonKey,
    "Content-Type": "application/json",
  };
  if (requireJwt) {
    const { data } = await supabaseAuth.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchUserPasskeysViaRest(): Promise<any[]> {
  try {
    const headers = await getAuthHeaders(true);
    if (!headers) return [];
    const res = await fetch(`${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys`, {
      method: "GET",
      headers,
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.passkeys)) return json.passkeys;
    return [];
  } catch {
    return [];
  }
}

let cachedMfaState: MfaSecurityState | null = null;
let cachedMfaUserId: string | null = null;

// Zero-Trust Device-Bound Passkey Seal (12-hour TTL, never persisted in localStorage)
const PASSKEY_SEAL_STORAGE_KEY = "sanctuary_passkey_seal_v2";
const PASSKEY_SEAL_TTL_MS = 12 * 60 * 60 * 1000;
const WEBAUTHN_IDB_NAME = "sanctuary_webauthn_keystore";
const WEBAUTHN_IDB_STORE = "device_keys";
const WEBAUTHN_IDB_KEY_ID = "passkey_seal_key_v2";

let inMemoryVerifiedUserId: string | null = null;
let inMemoryVerifiedAt = 0;
let cachedDesktopHardwareId: string | null = null;
let cachedWebCryptoSealKey: CryptoKey | null = null;

function purgeLegacyPlaintextPasskeyFlags(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("sanctuary_passkey_verified");
      localStorage.removeItem("sanctuary_passkey_verified_uid");
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("sanctuary_passkey_verified");
    }
  } catch {}
}

purgeLegacyPlaintextPasskeyFlags();

async function getOrCreateWebDeviceSealKey(): Promise<CryptoKey | null> {
  if (cachedWebCryptoSealKey) return cachedWebCryptoSealKey;
  if (typeof window === "undefined" || !window.crypto?.subtle || !window.indexedDB) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(WEBAUTHN_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(WEBAUTHN_IDB_STORE)) {
          db.createObjectStore(WEBAUTHN_IDB_STORE);
        }
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(WEBAUTHN_IDB_STORE, "readonly");
          const store = tx.objectStore(WEBAUTHN_IDB_STORE);
          const getReq = store.get(WEBAUTHN_IDB_KEY_ID);
          getReq.onsuccess = async () => {
            if (getReq.result instanceof CryptoKey) {
              cachedWebCryptoSealKey = getReq.result;
              db.close();
              resolve(getReq.result);
              return;
            }
            try {
              // Generate a non-extractable HMAC-SHA256 hardware/browser-bound key
              const newKey = await window.crypto.subtle.generateKey(
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign", "verify"]
              );
              const writeTx = db.transaction(WEBAUTHN_IDB_STORE, "readwrite");
              writeTx.objectStore(WEBAUTHN_IDB_STORE).put(newKey, WEBAUTHN_IDB_KEY_ID);
              writeTx.oncomplete = () => {
                cachedWebCryptoSealKey = newKey;
                db.close();
                resolve(newKey);
              };
              writeTx.onerror = () => {
                cachedWebCryptoSealKey = newKey;
                db.close();
                resolve(newKey);
              };
            } catch {
              db.close();
              resolve(null);
            }
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

async function computeDeviceBoundSealSignature(userId: string, issuedAt: number): Promise<string | null> {
  try {
    const message = `SanctuaryOS-PasskeySeal-v2:${userId}:${issuedAt}`;
    const msgBytes = new TextEncoder().encode(message);

    if (isDesktop()) {
      if (!cachedDesktopHardwareId) {
        cachedDesktopHardwareId = await invoke<string>("get_hardware_id");
      }
      if (!cachedDesktopHardwareId || cachedDesktopHardwareId === "unknown") return null;
      const combined = new TextEncoder().encode(`${cachedDesktopHardwareId}:${message}`);
      const digest = await crypto.subtle.digest("SHA-256", combined);
      return bufferToBase64Url(digest);
    }

    const key = await getOrCreateWebDeviceSealKey();
    if (!key) return null;
    const sigBuffer = await crypto.subtle.sign("HMAC", key, msgBytes);
    return bufferToBase64Url(sigBuffer);
  } catch {
    return null;
  }
}

async function verifyAndHydrateDeviceBoundSeal(session?: any): Promise<boolean> {
  purgeLegacyPlaintextPasskeyFlags();
  const uid = session?.user?.id;
  if (!uid) return false;

  if (isLocalhostBrowser() && Boolean(session?.user?.id || session?.access_token)) {
    inMemoryVerifiedUserId = uid;
    inMemoryVerifiedAt = Date.now();
    return true;
  }

  const now = Date.now();
  if (
    inMemoryVerifiedUserId === uid &&
    inMemoryVerifiedAt > 0 &&
    now - inMemoryVerifiedAt < PASSKEY_SEAL_TTL_MS
  ) {
    return true;
  }

  try {
    if (typeof sessionStorage === "undefined") return false;
    const rawSeal = sessionStorage.getItem(PASSKEY_SEAL_STORAGE_KEY);
    if (!rawSeal) return false;

    const parsed = JSON.parse(rawSeal);
    if (
      !parsed ||
      typeof parsed.uid !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.sig !== "string"
    ) {
      sessionStorage.removeItem(PASSKEY_SEAL_STORAGE_KEY);
      return false;
    }

    if (parsed.uid !== uid || now - parsed.iat >= PASSKEY_SEAL_TTL_MS || parsed.iat > now + 60_000) {
      sessionStorage.removeItem(PASSKEY_SEAL_STORAGE_KEY);
      return false;
    }

    const expectedSig = await computeDeviceBoundSealSignature(parsed.uid, parsed.iat);
    if (!expectedSig || expectedSig !== parsed.sig) {
      // Seal came from a different machine/browser or was tampered with!
      sessionStorage.removeItem(PASSKEY_SEAL_STORAGE_KEY);
      inMemoryVerifiedUserId = null;
      inMemoryVerifiedAt = 0;
      return false;
    }

    inMemoryVerifiedUserId = uid;
    inMemoryVerifiedAt = parsed.iat;
    return true;
  } catch {
    return false;
  }
}

export function getCachedMfaSecurityState(userId?: string | null): MfaSecurityState | null {
  if (!cachedMfaState) return null;
  if (userId && cachedMfaUserId && userId !== cachedMfaUserId) return null;
  return cachedMfaState;
}

export function markPasskeySessionVerified(userId?: string | null): void {
  try {
    purgeLegacyPlaintextPasskeyFlags();
    const resolvedUid = userId || cachedMfaUserId;
    const issuedAt = Date.now();

    if (resolvedUid) {
      inMemoryVerifiedUserId = resolvedUid;
      inMemoryVerifiedAt = issuedAt;

      computeDeviceBoundSealSignature(resolvedUid, issuedAt)
        .then((sig) => {
          if (sig && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(
              PASSKEY_SEAL_STORAGE_KEY,
              JSON.stringify({ uid: resolvedUid, iat: issuedAt, sig })
            );
          }
        })
        .catch(() => {});
    }

    if (cachedMfaState) {
      cachedMfaState = {
        ...cachedMfaState,
        isPasskeyVerified: true,
        currentLevel: "aal2",
      };
    }
  } catch {}
}

export function clearPasskeySessionVerified(): void {
  try {
    purgeLegacyPlaintextPasskeyFlags();
    inMemoryVerifiedUserId = null;
    inMemoryVerifiedAt = 0;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(PASSKEY_SEAL_STORAGE_KEY);
    }
    if (cachedMfaState) {
      cachedMfaState = {
        ...cachedMfaState,
        isPasskeyVerified: false,
      };
    }
  } catch {}
}

export function isPasskeySessionVerified(session?: any): boolean {
  try {
    purgeLegacyPlaintextPasskeyFlags();
    if (isLocalhostBrowser() && Boolean(session?.user?.id || session?.access_token)) {
      return true;
    }
    const uid = session?.user?.id || cachedMfaUserId;
    if (!uid) return false;
    const now = Date.now();
    if (
      inMemoryVerifiedUserId === uid &&
      inMemoryVerifiedAt > 0 &&
      now - inMemoryVerifiedAt < PASSKEY_SEAL_TTL_MS
    ) {
      return true;
    }
  } catch {}
  return false;
}

export async function fetchMfaSecurityState(): Promise<MfaSecurityState> {
  try {
    const [sessionRes, rawApiPasskeys, factorsRes, aalRes] = await Promise.all([
      supabaseAuth.auth.getSession().catch(() => ({ data: { session: null } })),
      fetchUserPasskeysViaRest(),
      supabaseAuth.auth.mfa.listFactors().catch(() => ({ data: null, error: null })),
      supabaseAuth.auth.mfa
        .getAuthenticatorAssuranceLevel()
        .catch(() => ({ data: null, error: null })),
    ]);

    const activeSession = sessionRes?.data?.session;

    const normalizedApiPasskeys = rawApiPasskeys.map((pk: any) => ({
      ...pk,
      id: pk.id,
      factor_type: "webauthn",
      status: "verified",
      source: "passkey_api",
      created_at: pk.created_at || new Date().toISOString(),
      friendly_name: sanitizeFactorFriendlyName(pk.friendly_name, "FIDO2 Passkey"),
    }));

    const allFactors = factorsRes?.data?.all || [];
    const legacyWebAuthnFactors = (
      factorsRes?.data?.webauthn ||
      allFactors.filter((f: any) => f.factor_type === "webauthn" && f.status === "verified")
    )
      .filter((f: any) => f.status === "verified")
      .map((f: any) => ({
        ...f,
        source: "mfa_api",
        friendly_name: sanitizeFactorFriendlyName(f.friendly_name, "FIDO2 Passkey"),
      }));

    const seenPasskeyIds = new Set<string>();
    const passkeys: any[] = [];
    for (const pk of [...normalizedApiPasskeys, ...legacyWebAuthnFactors]) {
      if (pk?.id && !seenPasskeyIds.has(pk.id)) {
        seenPasskeyIds.add(pk.id);
        passkeys.push(pk);
      }
    }

    const totpFactors = (
      factorsRes?.data?.totp ||
      allFactors.filter((f: any) => f.factor_type === "totp" && f.status === "verified")
    )
      .filter((f: any) => f.status === "verified")
      .map((f: any) => ({
        ...f,
        source: "mfa_api",
        friendly_name: sanitizeFactorFriendlyName(f.friendly_name, "Authenticator App"),
      }));

    const allVerifiedFactors = [...passkeys, ...totpFactors];
    const hasPasskey = passkeys.length > 0;
    const passkeyVerified = await verifyAndHydrateDeviceBoundSeal(activeSession);
    const rawCurrentLevel = (aalRes?.data?.currentLevel as "aal1" | "aal2" | null) ?? null;
    const rawNextLevel = (aalRes?.data?.nextLevel as "aal1" | "aal2" | null) ?? null;

    const result: MfaSecurityState = {
      passkeys,
      totpFactors,
      allVerifiedFactors,
      hasPasskey,
      hasTotp: totpFactors.length > 0,
      isPasskeyVerified: passkeyVerified,
      currentLevel: passkeyVerified ? "aal2" : rawCurrentLevel,
      nextLevel: rawNextLevel,
    };

    cachedMfaState = result;
    cachedMfaUserId = activeSession?.user?.id || null;
    return result;
  } catch (err) {
    console.error("Failed to fetch MFA security state:", err);
    return (
      cachedMfaState || {
        passkeys: [],
        totpFactors: [],
        allVerifiedFactors: [],
        hasPasskey: false,
        hasTotp: false,
        isPasskeyVerified: false,
        currentLevel: null,
        nextLevel: null,
      }
    );
  }
}

export function notifyMfaStateChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sanctuary-mfa-updated"));
  }
}

/**
 * Verifies the user's current password using an isolated non-persisted client
 * so that an active AAL2 MFA session in `supabaseAuth` is never downgraded to AAL1.
 */
export async function verifyPasswordWithoutSessionDowngrade(
  email: string,
  password: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const ephemeralClient = createClient(
      RESOLVED_SANCTUARY_CONFIG.supabaseUrl,
      RESOLVED_SANCTUARY_CONFIG.supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: "sanctuary-os-ephemeral-reauth",
        },
      }
    );

    const { error } = await ephemeralClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { verified: false, error: error.message };
    }
    return { verified: true };
  } catch (err: any) {
    return { verified: false, error: err?.message || String(err) };
  }
}

/**
 * Registers and verifies a new FIDO2 / WebAuthn Passkey via Supabase's `/auth/v1/passkeys` REST API.
 * Works natively on both Web (`https://sanctuaryos.net`) and Desktop (`Sanctuary OS` via Windows `webauthn.dll`).
 */
export async function registerFidoPasskey(
  friendlyName: string,
  options?: { currentPassword?: string }
): Promise<{
  data: any | null;
  error: Error | null;
}> {
  if (!isWebAuthnSupported()) {
    return {
      data: null,
      error: new Error("WebAuthn / Passkeys are not supported in this environment."),
    };
  }

  try {
    const headers = await getAuthHeaders(true);
    if (!headers) {
      return { data: null, error: new Error("No active session found.") };
    }

    // 0. Zero-Trust Step-Up & Anti-Cookie-Hijack Gate:
    //    - If the account ALREADY has at least one registered Passkey, the caller MUST have
    //      verified an existing Passkey on this physical device in the current session first.
    //    - If the account has TOTP 2FA enabled, the session must be at AAL2.
    //    - Enrolling the first Passkey (or when currentPassword is supplied) requires verifying
    //      the account's current password so a stolen cookie/localStorage token cannot inject a rogue Passkey.
    const currentSecurity = await fetchMfaSecurityState();
    if (currentSecurity.hasPasskey && !currentSecurity.isPasskeyVerified) {
      return {
        data: null,
        error: new Error(
          "Security Lock: Your account already has an active FIDO2 Passkey. You must authenticate with your existing Passkey on this device before registering an additional Passkey."
        ),
      };
    }

    if (
      currentSecurity.hasTotp &&
      currentSecurity.currentLevel !== "aal2" &&
      !currentSecurity.isPasskeyVerified
    ) {
      return {
        data: null,
        error: new Error(
          "Security Lock: Two-Factor Authentication is active on this account. Complete 2FA verification before registering a new Passkey."
        ),
      };
    }

    const { data: preSessionData } = await supabaseAuth.auth.getSession();
    const activeEmail = preSessionData?.session?.user?.email || "";
    const providedPassword = options?.currentPassword?.trim() || "";

    if (!isLocalhostBrowser() && (!currentSecurity.hasPasskey || providedPassword.length > 0)) {
      if (!providedPassword) {
        return {
          data: null,
          error: new Error(
            "Current account password is required to authorize FIDO2 Passkey registration."
          ),
        };
      }
      if (activeEmail) {
        const pwCheck = await verifyPasswordWithoutSessionDowngrade(activeEmail, providedPassword);
        if (!pwCheck.verified) {
          return {
            data: null,
            error: new Error(
              "Current password verification failed. Please check your password and try again."
            ),
          };
        }
      }
    }

    // 1. Fetch passkey registration options from Supabase Auth
    const optRes = await fetch(
      `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/registration/options`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }
    );
    const optJson = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optJson?.challenge_id || !optJson?.options) {
      return {
        data: null,
        error: new Error(
          optJson?.msg ||
            optJson?.error_description ||
            optJson?.message ||
            "Failed to start Passkey registration."
        ),
      };
    }

    const serverOptions = optJson.options;
    const cleanName = sanitizeFactorFriendlyName(friendlyName, "FIDO2 Passkey");

    // Never expose raw email addresses in the OS passkey prompt (e.g. Windows Security)
    const { data: sessionData } = await supabaseAuth.auth.getSession();
    const sessionMeta = sessionData?.session?.user?.user_metadata || {};
    const safeUserLabel = sanitizeFactorFriendlyName(
      sessionMeta.username ||
        sessionMeta.mason_name ||
        sessionMeta.display_name ||
        cleanName ||
        "Sanctuary OS",
      cleanName || "Sanctuary OS"
    );
    if (serverOptions?.user) {
      serverOptions.user.name = safeUserLabel;
      serverOptions.user.displayName = safeUserLabel;
    }

    // 2. Run WebAuthn ceremony (native Windows webauthn.dll on Desktop, Vite Desktop bridge on localhost, or Browser WebAuthn on Web)
    let serializedCredential: any = null;
    if (isDesktop()) {
      serializedCredential = await invoke("native_webauthn_register", {
        options: serverOptions,
      });
    } else {
      if (isLocalhostBrowser()) {
        const bridgeRes = await requestDevDesktopWebAuthn("register", serverOptions);
        if (bridgeRes.handled) {
          if (bridgeRes.error) throw bridgeRes.error;
          serializedCredential = bridgeRes.credential;
        }
      }
      if (!serializedCredential) {
        if (isLocalhostBrowser() && typeof window !== "undefined") {
          serverOptions.rp = {
            ...(serverOptions.rp || {}),
            id: window.location.hostname,
          };
          delete serverOptions.excludeCredentials;
        }
        const publicKeyOptions = deserializeCreationOptions(serverOptions);
        const cred = await navigator.credentials.create({ publicKey: publicKeyOptions });
        if (!cred || !(cred instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new Error("Passkey registration was cancelled."),
          };
        }
        serializedCredential = serializeRegistrationCredential(cred);
      }
    }

    // 3. Verify registration with Supabase Auth (on Web in Hub & Spoke mode, route through
    //    game-gateway so both https://sanctuaryos.net and https://www.sanctuaryos.net origins
    //    are verified against the snapshotted WebAuthn challenge without consuming it on origin mismatch)
    let verifyRes: Response;
    let createdPasskey: any = {};

    if (!isDesktop() && RESOLVED_SANCTUARY_CONFIG.mode !== "standalone") {
      verifyRes = await fetch(
        `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/functions/v1/game-gateway`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "verify_webauthn_registration",
            payload: {
              challenge_id: optJson.challenge_id,
              credential: serializedCredential,
              friendly_name: cleanName,
            },
          }),
        }
      );
      createdPasskey = await verifyRes.json().catch(() => ({}));
    } else {
      verifyRes = await fetch(
        `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/registration/verify`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            challenge_id: optJson.challenge_id,
            credential: serializedCredential,
          }),
        }
      );
      createdPasskey = await verifyRes.json().catch(() => ({}));
    }

    if (!verifyRes.ok || createdPasskey?.error) {
      return {
        data: null,
        error: new Error(
          createdPasskey?.msg ||
            createdPasskey?.error_description ||
            createdPasskey?.message ||
            createdPasskey?.error ||
            "Failed to verify Passkey registration."
        ),
      };
    }

    // 4. Save user's custom friendly name (if not already persisted by game-gateway)
    if (createdPasskey?.id && cleanName && createdPasskey?.friendly_name !== cleanName) {
      try {
        await fetch(
          `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/${createdPasskey.id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ friendly_name: cleanName }),
          }
        );
      } catch (updateErr) {
        console.warn("Failed to update passkey friendly name:", updateErr);
      }
    }

    markPasskeySessionVerified(sessionData?.session?.user?.id);
    notifyMfaStateChanged();
    return { data: createdPasskey, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Authenticates using a FIDO2 / WebAuthn Passkey via Supabase's `/auth/v1/passkeys` REST API.
 * Works natively on both Web (`https://sanctuaryos.net`) and Desktop (`Sanctuary OS` via Windows `webauthn.dll`).
 */
export async function authenticateFidoPasskey(
  _factorId?: string,
  options?: { forceFreshCeremony?: boolean }
): Promise<{
  data: any | null;
  error: Error | null;
}> {
  if (!isWebAuthnSupported()) {
    return {
      data: null,
      error: new Error("WebAuthn / Passkeys are not supported in this environment."),
    };
  }

  try {
    if (isLocalhostBrowser() && !options?.forceFreshCeremony) {
      const { data: preSessionData } = await supabaseAuth.auth.getSession();
      const preSession = preSessionData?.session;
      if (preSession?.user?.id) {
        markPasskeySessionVerified(preSession.user.id);
        await syncDevSessionToVite(preSession);
        notifyMfaStateChanged();
        return {
          data: { verified: true, passkey_verified: true, user: preSession.user },
          error: null,
        };
      }

      const restoredFromDesktop = await restoreDevSessionFromVite();
      if (restoredFromDesktop?.user?.id) {
        return {
          data: {
            ...restoredFromDesktop,
            verified: true,
            passkey_verified: true,
            user: restoredFromDesktop.user,
          },
          error: null,
        };
      }
    }

    const headers = await getAuthHeaders(false);
    if (!headers) {
      return { data: null, error: new Error("Failed to initialize authentication headers.") };
    }

    // 1. Fetch authentication challenge options from Supabase Auth
    const optRes = await fetch(
      `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/authentication/options`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ gotrue_meta_security: {} }),
      }
    );
    const optJson = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optJson?.challenge_id || !optJson?.options) {
      return {
        data: null,
        error: new Error(
          optJson?.msg ||
            optJson?.error_description ||
            optJson?.message ||
            "Failed to start Passkey authentication."
        ),
      };
    }

    const serverOptions = optJson.options;

    // 2. Run WebAuthn assertion (native Windows webauthn.dll on Desktop, Vite Desktop bridge on localhost, or Browser WebAuthn on Web)
    let serializedCredential: any = null;
    if (isDesktop()) {
      serializedCredential = await invoke("native_webauthn_authenticate", {
        options: serverOptions,
      });
    } else {
      if (isLocalhostBrowser()) {
        const bridgeRes = await requestDevDesktopWebAuthn("authenticate", serverOptions);
        if (bridgeRes.handled) {
          if (bridgeRes.error) throw bridgeRes.error;
          serializedCredential = bridgeRes.credential;
        }
      }
      if (!serializedCredential) {
        if (isLocalhostBrowser() && typeof window !== "undefined") {
          serverOptions.rpId = window.location.hostname;
          delete serverOptions.allowCredentials;
        }
        const publicKeyOptions = deserializeRequestOptions(serverOptions);
        const cred = await navigator.credentials.get({ publicKey: publicKeyOptions });
        if (!cred || !(cred instanceof PublicKeyCredential)) {
          return {
            data: null,
            error: new Error("Passkey verification was cancelled."),
          };
        }
        serializedCredential = serializeAuthenticationCredential(cred);
      }
    }

    // 3. Verify authentication with Supabase Auth and hydrate session.
    //    On Web in Hub & Spoke mode, route through game-gateway so both https://sanctuaryos.net
    //    and https://www.sanctuaryos.net origins are verified without losing the challenge row.
    const { data: existingSessionData } = await supabaseAuth.auth.getSession();
    const existingSession = existingSessionData?.session;

    let verifyRes: Response;
    let verifyJson: any = {};

    if (!isDesktop() && RESOLVED_SANCTUARY_CONFIG.mode !== "standalone") {
      const gatewayHeaders: Record<string, string> = { ...headers };
      if (existingSession?.access_token && !gatewayHeaders.Authorization) {
        gatewayHeaders.Authorization = `Bearer ${existingSession.access_token}`;
      }
      verifyRes = await fetch(
        `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/functions/v1/game-gateway`,
        {
          method: "POST",
          headers: gatewayHeaders,
          body: JSON.stringify({
            action: "verify_webauthn_assertion",
            payload: {
              challenge_id: optJson.challenge_id,
              credential: serializedCredential,
            },
          }),
        }
      );
      verifyJson = await verifyRes.json().catch(() => ({}));
    } else {
      verifyRes = await fetch(
        `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/authentication/verify`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            challenge_id: optJson.challenge_id,
            credential: serializedCredential,
          }),
        }
      );
      verifyJson = await verifyRes.json().catch(() => ({}));
    }

    if (!verifyRes.ok || verifyJson?.error) {
      return {
        data: null,
        error: new Error(
          verifyJson?.msg ||
            verifyJson?.error_description ||
            verifyJson?.message ||
            verifyJson?.error ||
            "Failed to verify Passkey authentication."
        ),
      };
    }

    const verifiedUserId = verifyJson?.user?.id || existingSession?.user?.id;

    markPasskeySessionVerified(verifiedUserId);

    // Only hydrate via setSession if there is no active session yet (login flow).
    // If the user is already signed in (e.g. with an AAL2 TOTP session doing a Hub step-up check),
    // keep their active session intact so we don't trigger a session downgrade or global re-auth loop.
    if (
      verifyJson?.access_token &&
      verifyJson?.refresh_token &&
      (!existingSession || existingSession.user?.id !== verifiedUserId)
    ) {
      await supabaseAuth.auth.setSession({
        access_token: verifyJson.access_token,
        refresh_token: verifyJson.refresh_token,
      });
    }

    notifyMfaStateChanged();
    return { data: verifyJson, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Removes either a FIDO2 Passkey (`DELETE /auth/v1/passkeys/:id`) or a TOTP Authenticator App (`auth.mfa.unenroll`).
 */
export async function deleteSecurityFactor(factor: {
  id: string;
  factor_type?: string;
  source?: string;
}): Promise<{ error: Error | null }> {
  try {
    const currentSecurity = await fetchMfaSecurityState();
    if (currentSecurity.hasPasskey && !currentSecurity.isPasskeyVerified) {
      return {
        error: new Error(
          "Security Lock: You must authenticate with your existing FIDO2 Passkey on this device before removing a security factor."
        ),
      };
    }

    if (factor.source === "passkey_api" || factor.factor_type === "webauthn") {
      const headers = await getAuthHeaders(true);
      if (headers) {
        const res = await fetch(
          `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/${factor.id}`,
          {
            method: "DELETE",
            headers,
          }
        );
        if (res.ok) {
          notifyMfaStateChanged();
          return { error: null };
        }
      }
      const fallback = await supabaseAuth.auth.mfa.unenroll({ factorId: factor.id });
      if (fallback.error) {
        return { error: fallback.error };
      }
      notifyMfaStateChanged();
      return { error: null };
    }

    const { error } = await supabaseAuth.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      return { error };
    }
    notifyMfaStateChanged();
    return { error: null };
  } catch (err: any) {
    return {
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

// ============================================================================
// ZERO-PII AES-256-GCM COMPANION PASSKEY HANDSHAKE (STEAM DECK / MACOS / RIGS)
// ============================================================================

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
  return sha256Hex(
    `sanctuary_citizen_passkey_handshake_v1:${userId}:${(email || "").trim().toLowerCase()}`
  );
}

async function deriveHandshakeAesKey(
  userId: string,
  email: string | undefined,
  salt: Uint8Array
): Promise<CryptoKey> {
  const passphrase = `${userId}::${(email || "").trim().toLowerCase()}::sanctuary_passkey_handshake_key_v1`;
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

async function computeHandshakeApprovalSignature(
  challengeNonce: string,
  handshakeId: string,
  handshakeCode: string,
  userId: string
): Promise<string> {
  return sha256Hex(
    `${challengeNonce}:${handshakeId}:${handshakeCode}:${userId}:APPROVED_BY_LIVE_PASSKEY_V1`
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
    const activeClient = getActiveGameClient();
    if (activeClient && !clients.includes(activeClient)) {
      clients.push(activeClient);
    }
  } catch {}
  try {
    const spokeClient = await getSpokeClientById("sims4");
    if (spokeClient && !clients.includes(spokeClient)) {
      clients.push(spokeClient);
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
      clients.map((c) =>
        c
          .from("citizen_staging_queue")
          .delete()
          .eq("user_token", userToken)
          .catch(() => {})
      )
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
      c.from("citizen_staging_queue")
        .insert([insertedId ? { id: insertedId, ...rowPayload } : rowPayload])
        .then(() => {})
        .catch(() => {});
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
      clients.map((client) =>
        client
          .from("citizen_staging_queue")
          .select("*")
          .eq("user_token", userToken)
          .order("created_at", { ascending: false })
          .limit(5)
          .then((res: any) => ({ client, rows: Array.isArray(res?.data) ? res.data : [] }))
          .catch(() => ({ client, rows: [] }))
      )
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
        await client.from("citizen_staging_queue").delete().eq("id", row.id).catch(() => {});
        continue;
      }

      if (decrypted.status === "approved" && decrypted.approvalSignature) {
        const expectedSig = await computeHandshakeApprovalSignature(
          expectedNonce,
          handshakeId,
          decrypted.handshakeCode,
          user.id
        );
        if (
          decrypted.approvalSignature === expectedSig &&
          decrypted.approvedAt &&
          Date.now() - decrypted.approvedAt < 180_000
        ) {
          await Promise.all(
            clients.map((c) =>
              c
                .from("citizen_staging_queue")
                .delete()
                .eq("user_token", userToken)
                .catch(() => {})
            )
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
      clients.map((client) =>
        client
          .from("citizen_staging_queue")
          .select("*")
          .eq("user_token", userToken)
          .order("created_at", { ascending: false })
          .limit(5)
          .then((res: any) => ({ client, rows: Array.isArray(res?.data) ? res.data : [] }))
          .catch(() => ({ client, rows: [] }))
      )
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
        client
          .from("citizen_staging_queue")
          .delete()
          .in("id", expiredIds)
          .then(() => {})
          .catch(() => {});
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

    // MANDATORY LIVE PASSKEY STEP-UP RIGHT THEN AND THERE
    const authRes = await authenticateFidoPasskey(undefined, {
      forceFreshCeremony: true,
    });
    if (authRes.error || !authRes.data) {
      return {
        success: false,
        error:
          authRes.error ||
          new Error("Live FIDO2 Passkey verification was cancelled or failed."),
      };
    }

    const approvalSignature = await computeHandshakeApprovalSignature(
      handshake.payload.challengeNonce,
      handshake.payload.handshakeId,
      handshake.payload.handshakeCode,
      user.id
    );

    const updatedPayload: CompanionPasskeyHandshakePayload = {
      ...handshake.payload,
      status: "approved",
      approvedAt: Date.now(),
      approverDevice: getPasskeyDeviceLabel(),
      approvalSignature,
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
