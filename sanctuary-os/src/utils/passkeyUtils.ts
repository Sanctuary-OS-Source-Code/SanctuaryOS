import { createClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./envUtils";
import { supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../supabase";

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

export function getCachedMfaSecurityState(userId?: string | null): MfaSecurityState | null {
  if (!cachedMfaState) return null;
  if (userId && cachedMfaUserId && userId !== cachedMfaUserId) return null;
  return cachedMfaState;
}

export function markPasskeySessionVerified(userId?: string | null): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("sanctuary_passkey_verified", "true");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("sanctuary_passkey_verified", "true");
      if (userId) {
        localStorage.setItem("sanctuary_passkey_verified_uid", userId);
      }
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
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("sanctuary_passkey_verified");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("sanctuary_passkey_verified");
      localStorage.removeItem("sanctuary_passkey_verified_uid");
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
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("sanctuary_passkey_verified") === "true") {
      return true;
    }
    if (typeof localStorage !== "undefined" && localStorage.getItem("sanctuary_passkey_verified") === "true") {
      const uid = session?.user?.id;
      const storedUid = localStorage.getItem("sanctuary_passkey_verified_uid");
      if (!uid || !storedUid || uid === storedUid) {
        return true;
      }
    }
    const token = session?.access_token;
    if (typeof token === "string" && token.includes(".")) {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
        if (Array.isArray(json?.amr)) {
          const hasPasskeyAmr = json.amr.some((entry: any) => {
            const m = typeof entry === "string" ? entry : entry?.method;
            return m === "passkey" || m === "webauthn";
          });
          if (hasPasskeyAmr) return true;
        }
      }
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
    const passkeyVerified = isPasskeySessionVerified(activeSession);
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
export async function registerFidoPasskey(friendlyName: string): Promise<{
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

    // 2. Run WebAuthn ceremony (native Windows webauthn.dll on Desktop, or Browser WebAuthn on Web)
    let serializedCredential: any = null;
    if (isDesktop()) {
      serializedCredential = await invoke("native_webauthn_register", {
        options: serverOptions,
      });
    } else {
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
export async function authenticateFidoPasskey(_factorId?: string): Promise<{
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

    // 2. Run WebAuthn assertion (native Windows webauthn.dll on Desktop, or Browser WebAuthn on Web)
    let serializedCredential: any = null;
    if (isDesktop()) {
      serializedCredential = await invoke("native_webauthn_authenticate", {
        options: serverOptions,
      });
    } else {
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
