import { invoke } from "@tauri-apps/api/core";
import { isDesktop, isLinuxDesktop } from "../envUtils";
import { supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../../supabase";
import { useStore } from "../../store";

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

export const BLIND_EMAIL_DOMAIN = "blind.sanctuaryos.net";

export function isBlindedEmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith(`@${BLIND_EMAIL_DOMAIN}`) ||
    lower.endsWith("@blind.sanctuaryos.local") ||
    lower.startsWith("zk-")
  );
}

/**
 * Masks an email address
 * so raw emails are never exposed in UI panels or screenshots.
 */
export function maskEmailAddress(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return trimmed;
  if (isBlindedEmailAddress(trimmed)) {
    const [local, domain] = trimmed.split("@");
    const prefix = local.slice(0, 7);
    return `${prefix}••••@${domain}`;
  }
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

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
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

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deserializeCreationOptions(options: any): PublicKeyCredentialCreationOptions {
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

export function deserializeRequestOptions(options: any): PublicKeyCredentialRequestOptions {
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

export function serializeRegistrationCredential(cred: PublicKeyCredential): any {
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

export function serializeAuthenticationCredential(cred: PublicKeyCredential): any {
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

let inFlightSessionPromise: Promise<any | null> | null = null;

export async function getFastActiveSession(): Promise<any | null> {
  if (inFlightSessionPromise) return inFlightSessionPromise;
  inFlightSessionPromise = supabaseAuth.auth
    .getSession()
    .then(({ data }) => data?.session || null)
    .catch(() => useStore.getState().session || null)
    .finally(() => {
      inFlightSessionPromise = null;
    });
  return inFlightSessionPromise;
}

export async function getAuthHeaders(
  requireJwt = true,
  accessTokenOverride?: string | null,
  attachOptionalJwt = false
): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = {
    apikey: RESOLVED_SANCTUARY_CONFIG.supabaseAnonKey,
    "Content-Type": "application/json",
  };
  if (accessTokenOverride) {
    headers.Authorization = `Bearer ${accessTokenOverride}`;
    return headers;
  }
  if (requireJwt || attachOptionalJwt) {
    const activeSession = await getFastActiveSession();
    const token = activeSession?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (requireJwt) {
      return null;
    }
  }
  return headers;
}

export async function fetchUserPasskeysViaRest(accessTokenOverride?: string | null): Promise<any[]> {
  try {
    const headers = await getAuthHeaders(true, accessTokenOverride);
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

export let cachedMfaState: MfaSecurityState | null = null;
let cachedMfaUserId: string | null = null;
let inFlightMfaStatePromise: Promise<MfaSecurityState> | null = null;

// Pre-warmed WebAuthn authentication options cache (single-use per challenge, 120s TTL)
export const PASSKEY_AUTH_OPTIONS_TTL_MS = 120_000;
export interface CachedPasskeyAuthOptions {
  challenge_id: string;
  options: any;
  userId: string | null;
  fetchedAt: number;
}
let cachedPasskeyAuthOptions: CachedPasskeyAuthOptions | null = null;
let inFlightPrewarmPromise: Promise<CachedPasskeyAuthOptions | null> | null = null;

// Zero-Trust Device-Bound Passkey Seal (12-hour TTL, never persisted in localStorage)
const PASSKEY_SEAL_STORAGE_KEY = "sanctuary_passkey_seal_v2";
const PASSKEY_SEAL_TTL_MS = 12 * 60 * 60 * 1000;
const WEBAUTHN_IDB_NAME = "sanctuary_webauthn_keystore";
const WEBAUTHN_IDB_STORE = "device_keys";
const WEBAUTHN_IDB_KEY_ID = "passkey_seal_key_v2";

let inMemoryVerifiedUserId: string | null = null;
let inMemoryVerifiedAt = 0;
let cachedDesktopHardwareId: string | null = null;
let inFlightDesktopHardwareIdPromise: Promise<string | null> | null = null;
let cachedWebCryptoSealKey: CryptoKey | null = null;

export async function getDesktopHardwareId(): Promise<string | null> {
  if (!isDesktop()) return null;
  if (cachedDesktopHardwareId) return cachedDesktopHardwareId;
  if (inFlightDesktopHardwareIdPromise) return inFlightDesktopHardwareIdPromise;
  inFlightDesktopHardwareIdPromise = invoke<string>("get_hardware_id")
    .then((raw) => {
      if (raw && raw !== "unknown") {
        cachedDesktopHardwareId = raw;
      }
      return raw || null;
    })
    .catch(() => null)
    .finally(() => {
      inFlightDesktopHardwareIdPromise = null;
    });
  return inFlightDesktopHardwareIdPromise;
}

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
      const hwid = await getDesktopHardwareId();
      if (!hwid || hwid === "unknown") return null;
      const combined = new TextEncoder().encode(`${hwid}:${message}`);
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
  if (inFlightMfaStatePromise) {
    return inFlightMfaStatePromise;
  }

  inFlightMfaStatePromise = (async (): Promise<MfaSecurityState> => {
    try {
      const activeSession = await getFastActiveSession();
      const accessToken = activeSession?.access_token || null;

      const [rawApiPasskeys, factorsRes, aalRes] = await Promise.all([
        fetchUserPasskeysViaRest(accessToken),
        supabaseAuth.auth.mfa.listFactors().catch(() => ({ data: null, error: null })),
        supabaseAuth.auth.mfa
          .getAuthenticatorAssuranceLevel()
          .catch(() => ({ data: null, error: null })),
      ]);

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

      if (hasPasskey && !passkeyVerified && isNativeLocalPasskeySupported()) {
        void prewarmPasskeyAuthenticationOptions();
      }

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
    } finally {
      inFlightMfaStatePromise = null;
    }
  })();

  return inFlightMfaStatePromise;
}

export function notifyMfaStateChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sanctuary-mfa-updated"));
  }
}


export function enrichAllowCredentialsFromCache(serverOptions: any, preferredFactorId?: string): any {
  if (!serverOptions || typeof serverOptions !== "object") return serverOptions;
  if (Array.isArray(serverOptions.allowCredentials) && serverOptions.allowCredentials.length > 0) {
    return serverOptions;
  }
  const cachedPasskeys = cachedMfaState?.passkeys || [];
  const explicitDescriptors: Array<{ id: string; type: string; transports?: string[] }> = [];
  for (const pk of cachedPasskeys) {
    const rawCredId =
      pk?.credential_id || pk?.credentialId || pk?.webauthn_credential_id || "";
    if (!rawCredId || typeof rawCredId !== "string") continue;
    const entry: { id: string; type: string; transports?: string[] } = {
      id: rawCredId,
      type: "public-key",
    };
    if (Array.isArray(pk?.transports) && pk.transports.length > 0) {
      entry.transports = pk.transports;
    }
    if (preferredFactorId && pk?.id === preferredFactorId) {
      explicitDescriptors.unshift(entry);
    } else {
      explicitDescriptors.push(entry);
    }
  }
  if (explicitDescriptors.length > 0) {
    serverOptions.allowCredentials = explicitDescriptors;
  }
  return serverOptions;
}

export async function fetchPasskeyAuthenticationOptionsPayload(
  activeSession?: any | null
): Promise<{ data: CachedPasskeyAuthOptions | null; error?: Error }> {
  const token = activeSession?.access_token || null;
  const headers = await getAuthHeaders(false, token, true);
  if (!headers) {
    return { data: null, error: new Error("Failed to initialize authentication headers.") };
  }

  let optRes = await fetch(
    `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/authentication/options`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ gotrue_meta_security: {} }),
    }
  );

  // If GoTrue rejects an authenticated Bearer token on options, fall back cleanly to anon headers.
  if (!optRes.ok && headers.Authorization) {
    const anonHeaders = await getAuthHeaders(false);
    if (anonHeaders) {
      optRes = await fetch(
        `${RESOLVED_SANCTUARY_CONFIG.supabaseUrl}/auth/v1/passkeys/authentication/options`,
        {
          method: "POST",
          headers: anonHeaders,
          body: JSON.stringify({ gotrue_meta_security: {} }),
        }
      );
    }
  }

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

  return {
    data: {
      challenge_id: optJson.challenge_id,
      options: optJson.options,
      userId: activeSession?.user?.id || null,
      fetchedAt: Date.now(),
    },
  };
}

export async function prewarmPasskeyAuthenticationOptions(
  forceRefresh = false
): Promise<CachedPasskeyAuthOptions | null> {
  if (!isWebAuthnSupported()) return null;
  const activeSession = await getFastActiveSession();
  const activeUserId = activeSession?.user?.id || null;

  if (
    !forceRefresh &&
    cachedPasskeyAuthOptions &&
    cachedPasskeyAuthOptions.userId === activeUserId &&
    Date.now() - cachedPasskeyAuthOptions.fetchedAt < PASSKEY_AUTH_OPTIONS_TTL_MS
  ) {
    return cachedPasskeyAuthOptions;
  }

  if (inFlightPrewarmPromise) {
    return inFlightPrewarmPromise;
  }

  inFlightPrewarmPromise = fetchPasskeyAuthenticationOptionsPayload(activeSession)
    .then((res) => {
      if (res.data) {
        cachedPasskeyAuthOptions = res.data;
        return res.data;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inFlightPrewarmPromise = null;
    });

  return inFlightPrewarmPromise;
}

/**
 * Authenticates using a FIDO2 / WebAuthn Passkey via Supabase's `/auth/v1/passkeys` REST API.
 * Works natively on both Web (`https://sanctuaryos.net`) and Desktop (`Sanctuary OS` via Windows `webauthn.dll`).
 */

export function getCachedMfaUserId(): string | null {
  return cachedMfaUserId;
}

export async function resolveOrFetchAuthOptions(
  activeSession: any,
  forceFreshCeremony: boolean
): Promise<{ data: CachedPasskeyAuthOptions | null; error?: Error }> {
  const activeUserId = activeSession?.user?.id || null;
  let optJson: CachedPasskeyAuthOptions | null = null;
  if (
    !forceFreshCeremony &&
    cachedPasskeyAuthOptions &&
    cachedPasskeyAuthOptions.userId === activeUserId &&
    Date.now() - cachedPasskeyAuthOptions.fetchedAt < PASSKEY_AUTH_OPTIONS_TTL_MS
  ) {
    optJson = cachedPasskeyAuthOptions;
    cachedPasskeyAuthOptions = null;
  } else if (!forceFreshCeremony && inFlightPrewarmPromise) {
    const awaitedPrewarm = await inFlightPrewarmPromise;
    if (
      awaitedPrewarm &&
      awaitedPrewarm.userId === activeUserId &&
      Date.now() - awaitedPrewarm.fetchedAt < PASSKEY_AUTH_OPTIONS_TTL_MS
    ) {
      optJson = awaitedPrewarm;
      if (cachedPasskeyAuthOptions?.challenge_id === awaitedPrewarm.challenge_id) {
        cachedPasskeyAuthOptions = null;
      }
    }
  }
  if (!optJson) {
    cachedPasskeyAuthOptions = null;
    const freshRes = await fetchPasskeyAuthenticationOptionsPayload(activeSession);
    if (!freshRes.data) {
      return { data: null, error: freshRes.error };
    }
    optJson = freshRes.data;
  }
  return { data: optJson };
}

