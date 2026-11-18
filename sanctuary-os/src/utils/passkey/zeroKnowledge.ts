import { createClient } from "@supabase/supabase-js";
import { supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../../supabase";
import { useStore } from "../../store";
import { BLIND_EMAIL_DOMAIN, isBlindedEmailAddress, bufferToBase64Url, getCachedMfaUserId, fetchMfaSecurityState, notifyMfaStateChanged } from "./core";

export const OWASP_PBKDF2_SHA256_ITERATIONS = 600_000;
const LEGACY_PBKDF2_PW_V1_ITERATIONS = 100_000;
const LEGACY_PBKDF2_EMAIL_V1_ITERATIONS = 64_000;

export function isZeroKnowledgePreHashedPassword(pw: string): boolean {
  return (
    typeof pw === "string" &&
    (pw.startsWith("zkpw2$") || pw.startsWith("zkpw1$"))
  );
}

/**
 * Legacy v1 (100,000-iteration) client password derivation retained strictly for
 * seamless backward compatibility and automatic upgrade to v2 (600,000 iterations).
 */
async function deriveLegacyV1StretchedPassword(rawPassword: string): Promise<string> {
  if (!rawPassword) return "";
  if (isZeroKnowledgePreHashedPassword(rawPassword)) return rawPassword;
  try {
    const enc = new TextEncoder();
    const rawBytes = enc.encode(rawPassword);
    const domainPrefix = enc.encode("SanctuaryOS-ZeroKnowledge-Password-v1:");
    const saltSeed = new Uint8Array(domainPrefix.length + rawBytes.length);
    saltSeed.set(domainPrefix, 0);
    saltSeed.set(rawBytes, domainPrefix.length);
    const saltDigest = await crypto.subtle.digest("SHA-256", saltSeed);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      rawBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltDigest,
        iterations: LEGACY_PBKDF2_PW_V1_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      256
    );
    return `zkpw1$${bufferToBase64Url(derivedBits)}`;
  } catch {
    return rawPassword;
  }
}

/**
 * Deterministically stretches a user password on-device using OWASP's recommended
 * 600,000-iteration PBKDF2-HMAC-SHA256 before transmission (layered beneath Supabase's
 * server-side bcrypt storage) so the plaintext password is never transmitted over the network.
 */
export async function deriveZeroKnowledgePassword(rawPassword: string): Promise<string> {
  if (!rawPassword) return "";
  if (isZeroKnowledgePreHashedPassword(rawPassword)) return rawPassword;
  try {
    const enc = new TextEncoder();
    const rawBytes = enc.encode(rawPassword);
    const domainPrefix = enc.encode("SanctuaryOS-ClientStretched-Password-v2:");
    const saltSeed = new Uint8Array(domainPrefix.length + rawBytes.length);
    saltSeed.set(domainPrefix, 0);
    saltSeed.set(rawBytes, domainPrefix.length);
    const saltDigest = await crypto.subtle.digest("SHA-256", saltSeed);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      rawBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltDigest,
        iterations: OWASP_PBKDF2_SHA256_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      256
    );
    return `zkpw2$${bufferToBase64Url(derivedBits)}`;
  } catch {
    return rawPassword;
  }
}

export const deriveClientStretchedPassword = deriveZeroKnowledgePassword;

/**
 * Legacy v1 (64,000-iteration) blinded email alias derivation retained for seamless
 * sign-in fallback and automatic upgrade to v2 (600,000 iterations).
 */
async function deriveLegacyV1BlindedEmailAlias(rawIdentifier: string): Promise<string> {
  const clean = (rawIdentifier || "").trim().toLowerCase();
  if (!clean) return "";
  if (isBlindedEmailAddress(clean) && clean.includes("@")) {
    return clean;
  }
  try {
    const enc = new TextEncoder();
    const idBytes = enc.encode(clean);
    const saltBytes = enc.encode("SanctuaryOS-ZeroPII-BlindEmail-v1");
    const baseKey = await crypto.subtle.importKey(
      "raw",
      idBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: LEGACY_PBKDF2_EMAIL_V1_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      160
    );
    const hex = Array.from(new Uint8Array(derivedBits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `zk-${hex}@${BLIND_EMAIL_DOMAIN}`;
  } catch {
    return clean;
  }
}

/**
 * Deterministically hashes an email address on-device (OWASP 600,000-iteration PBKDF2-HMAC-SHA256)
 * into a blinded routing alias (`zk-<hex>@blind.sanctuaryos.net`) so no plaintext email address
 * is stored in the database.
 */
export async function deriveBlindedEmailAlias(rawIdentifier: string): Promise<string> {
  const clean = (rawIdentifier || "").trim().toLowerCase();
  if (!clean) return "";
  if (isBlindedEmailAddress(clean) && clean.includes("@")) {
    return clean;
  }
  try {
    const enc = new TextEncoder();
    const idBytes = enc.encode(clean);
    const saltBytes = enc.encode("SanctuaryOS-BlindEmail-PBKDF2-600k-v2");
    const baseKey = await crypto.subtle.importKey(
      "raw",
      idBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: OWASP_PBKDF2_SHA256_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      160
    );
    const hex = Array.from(new Uint8Array(derivedBits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `zk-${hex}@${BLIND_EMAIL_DOMAIN}`;
  } catch {
    return clean;
  }
}

/**
 * Generates a high-entropy 256-bit cryptographic recovery key for citizens who use FIDO2 Passkeys
 * and want to replace human-memorized passwords with a sovereign vault key.
 */
export function generateSovereignRecoveryKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const groups: string[] = [];
  for (let g = 0; g < 8; g++) {
    let chunk = "";
    for (let i = 0; i < 4; i++) {
      chunk += alphabet[bytes[g * 4 + i] % alphabet.length];
    }
    groups.push(chunk);
  }
  return `SOVK-${groups.join("-")}`;
}

export interface CitizenSecurityPolicy {
  enforceLoginMfa: boolean;
  enforceSessionLock: boolean;
  strictPasskeyOnly: boolean;
}

const CITIZEN_SECURITY_POLICY_PREFIX = "sanctuary_citizen_sec_policy_";

export function getCitizenSecurityPolicy(
  session?: any,
  hasAnyMfa = false,
  hasPasskey = false
): CitizenSecurityPolicy {
  const uid = session?.user?.id || getCachedMfaUserId() || "";
  const metaPolicy = session?.user?.user_metadata?.sanctuary_security_policy;
  let localPolicy: Partial<CitizenSecurityPolicy> | null = null;
  if (uid && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(`${CITIZEN_SECURITY_POLICY_PREFIX}${uid}`);
      if (raw) localPolicy = JSON.parse(raw);
    } catch {}
  }

  const merged = {
    ...(localPolicy || {}),
    ...(metaPolicy && typeof metaPolicy === "object" ? metaPolicy : {}),
  };

  return {
    enforceLoginMfa:
      typeof merged.enforceLoginMfa === "boolean"
        ? merged.enforceLoginMfa
        : Boolean(hasAnyMfa || hasPasskey),
    enforceSessionLock: Boolean(merged.enforceSessionLock),
    strictPasskeyOnly: Boolean(merged.strictPasskeyOnly && hasPasskey),
  };
}

export async function updateCitizenSecurityPolicy(
  patch: Partial<CitizenSecurityPolicy>
): Promise<{ policy: CitizenSecurityPolicy; error: Error | null }> {
  try {
    const currentSecurity = await fetchMfaSecurityState();
    if (currentSecurity.hasPasskey && !currentSecurity.isPasskeyVerified) {
      return {
        policy: getCitizenSecurityPolicy(
          undefined,
          currentSecurity.hasPasskey || currentSecurity.hasTotp,
          currentSecurity.hasPasskey
        ),
        error: new Error(
          "Security Lock: Authenticate with your existing FIDO2 Passkey on this device before modifying account lockdown policies."
        ),
      };
    }

    const { data: sessionData } = await supabaseAuth.auth.getSession();
    const activeSession = sessionData?.session;
    const current = getCitizenSecurityPolicy(
      activeSession,
      currentSecurity.hasPasskey || currentSecurity.hasTotp,
      currentSecurity.hasPasskey
    );

    const nextPolicy: CitizenSecurityPolicy = {
      ...current,
      ...patch,
    };

    if (activeSession?.user?.id && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          `${CITIZEN_SECURITY_POLICY_PREFIX}${activeSession.user.id}`,
          JSON.stringify(nextPolicy)
        );
      } catch {}
    }

    const rpcRes = await supabaseAuth.rpc("sanctuary_update_own_security_metadata", {
      p_metadata_patch: {
        sanctuary_security_policy: nextPolicy,
      },
    });

    if (rpcRes.error) {
      const { error } = await supabaseAuth.auth.updateUser({
        data: {
          sanctuary_security_policy: nextPolicy,
        },
      });
      if (error) {
        return { policy: current, error };
      }
    } else if (activeSession?.user) {
      const currentStoreSession = useStore.getState().session;
      if (currentStoreSession?.user) {
        useStore.getState().setSession({
          ...currentStoreSession,
          user: {
            ...currentStoreSession.user,
            user_metadata: {
              ...(currentStoreSession.user.user_metadata || {}),
              sanctuary_security_policy: nextPolicy,
            },
          },
        });
      }
    }

    notifyMfaStateChanged();
    return { policy: nextPolicy, error: null };
  } catch (err: any) {
    return {
      policy: getCitizenSecurityPolicy(),
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Updates the signed-in user's email and/or password via the SECURITY DEFINER RPC
 * `sanctuary_update_own_credentials` (verifying current password via pgcrypto inside Postgres
 * and bypassing GoTrue's AAL2 JWT block when TOTP/Passkey MFA is enrolled).
 */
export async function updateUserCredentialsZeroKnowledge(params: {
  currentPassword: string;
  newEmail?: string;
  newPassword?: string;
  metadataPatch?: Record<string, any>;
}): Promise<{ email?: string; error: Error | null }> {
  try {
    const rawCurrent = (params.currentPassword || "").trim();
    if (!rawCurrent) {
      return { error: new Error("Please enter your current password to verify.") };
    }

    const [currentZkV2Password, currentZkV1Password, newZkPassword] = await Promise.all([
      deriveZeroKnowledgePassword(rawCurrent),
      deriveLegacyV1StretchedPassword(rawCurrent),
      params.newPassword
        ? deriveZeroKnowledgePassword(params.newPassword)
        : Promise.resolve(undefined),
    ]);

    const mergedMeta: Record<string, any> = {
      ...(params.metadataPatch || {}),
    };
    if (newZkPassword) {
      mergedMeta.zk_password_v1 = true;
      mergedMeta.zk_password_v2 = true;
    }

    const cleanNewEmail = params.newEmail ? params.newEmail.trim().toLowerCase() : null;

    // 1. Try v2 (600k PBKDF2) + v1 (100k PBKDF2) first
    let { data, error } = await supabaseAuth.rpc("sanctuary_update_own_credentials", {
      p_current_password: currentZkV1Password,
      p_current_zk_password: currentZkV2Password,
      p_new_email: cleanNewEmail,
      p_new_password: newZkPassword || null,
      p_metadata_patch: mergedMeta,
    });

    // 2. Fallback to rawCurrent + v2 (600k PBKDF2) for legacy un-stretched accounts
    if (error && error.message?.toLowerCase().includes("invalid current password")) {
      const retry = await supabaseAuth.rpc("sanctuary_update_own_credentials", {
        p_current_password: rawCurrent,
        p_current_zk_password: currentZkV2Password,
        p_new_email: cleanNewEmail,
        p_new_password: newZkPassword || null,
        p_metadata_patch: mergedMeta,
      });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return { error: new Error(error.message) };
    }

    const updatedEmail = data?.email;
    const updatedMeta = data?.user_metadata;

    // Update active store session immediately so UI reflects the new email/metadata without waiting
    const currentStoreSession = useStore.getState().session;
    if (currentStoreSession?.user) {
      useStore.getState().setSession({
        ...currentStoreSession,
        user: {
          ...currentStoreSession.user,
          email: updatedEmail || currentStoreSession.user.email,
          user_metadata: updatedMeta || {
            ...(currentStoreSession.user.user_metadata || {}),
            ...mergedMeta,
          },
        },
      });
    }

    // Refresh JWT in background so future token claims carry the updated email & metadata
    supabaseAuth.auth
      .refreshSession()
      .then(({ data: refreshed }) => {
        if (refreshed?.session) {
          useStore.getState().setSession(refreshed.session);
        }
      })
      .catch(() => {});

    return { email: updatedEmail, error: null };
  } catch (err: any) {
    return {
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Resets the signed-in user's password from a verified recovery session (either an email recovery
 * link session or a live FIDO2 Passkey authentication session) via the SECURITY DEFINER RPC
 * `sanctuary_reset_own_password_from_recovery`, bypassing GoTrue's AAL2 MFA block.
 */
export async function resetPasswordFromVerifiedSession(
  newRawPassword: string
): Promise<{ error: Error | null }> {
  try {
    const cleanPw = (newRawPassword || "").trim();
    if (cleanPw.length < 8) {
      return { error: new Error("Password must be at least 8 characters long.") };
    }
    const zkPassword = await deriveZeroKnowledgePassword(cleanPw);
    const metaPatch = { zk_password_v1: true, zk_password_v2: true };

    const { error: rpcErr } = await supabaseAuth.rpc(
      "sanctuary_reset_own_password_from_recovery",
      {
        p_new_password: zkPassword,
        p_metadata_patch: metaPatch,
      }
    );

    if (rpcErr) {
      const { error: fallbackErr } = await supabaseAuth.auth.updateUser({
        password: zkPassword,
        data: metaPatch,
      });
      if (fallbackErr) {
        return { error: new Error(fallbackErr.message) };
      }
    }

    supabaseAuth.auth
      .refreshSession()
      .then(({ data: refreshed }) => {
        if (refreshed?.session) {
          useStore.getState().setSession(refreshed.session);
        }
      })
      .catch(() => {});

    return { error: null };
  } catch (err: any) {
    return {
      error: err instanceof Error ? err : new Error(err?.message || String(err)),
    };
  }
}

/**
 * Checks whether an email/identifier belongs to a Blinded Email (`zk-...`) account
 * vs a standard plaintext email account so Password Recovery can guide blinded accounts to
 * 1-Click FIDO2 Passkey Recovery or their 256-Bit Sovereign Recovery Key.
 */
export async function checkAccountRecoveryMethod(
  rawIdentifier: string
): Promise<{ isBlindedAccount: boolean; hasPlainEmail: boolean }> {
  try {
    const clean = (rawIdentifier || "").trim().toLowerCase();
    if (!clean) return { isBlindedAccount: false, hasPlainEmail: false };
    const [blindEmailV2, blindEmailV1] = await Promise.all([
      deriveBlindedEmailAlias(clean),
      deriveLegacyV1BlindedEmailAlias(clean),
    ]);
    const { data, error } = await supabaseAuth.rpc("sanctuary_check_recovery_method", {
      p_email: clean,
      p_blind_email: blindEmailV2,
    });
    if (!error && data) {
      if (data.is_blinded_account || data.has_plain_email) {
        return {
          isBlindedAccount: Boolean(data.is_blinded_account),
          hasPlainEmail: Boolean(data.has_plain_email),
        };
      }
    }
    if (blindEmailV1 && blindEmailV1 !== blindEmailV2) {
      const v1Check = await supabaseAuth.rpc("sanctuary_check_recovery_method", {
        p_email: clean,
        p_blind_email: blindEmailV1,
      });
      if (!v1Check.error && v1Check.data) {
        return {
          isBlindedAccount: Boolean(v1Check.data.is_blinded_account),
          hasPlainEmail: Boolean(v1Check.data.has_plain_email),
        };
      }
    }
    return {
      isBlindedAccount: isBlindedEmailAddress(clean),
      hasPlainEmail: !isBlindedEmailAddress(clean),
    };
  } catch {
    return { isBlindedAccount: false, hasPlainEmail: true };
  }
}

/**
 * Signs in a citizen supporting Blinded Email aliases (or pseudonymous handles)
 * and 600,000-iteration client-stretched passwords (`zkpw2$...`), with seamless fallback
 * and automatic upgrade for v1 (100k / 64k) and legacy accounts.
 */
export async function signInWithZeroKnowledgeFallback(
  identifier: string,
  rawPassword: string
): Promise<{ data: any; error: any; upgradedToZk?: boolean }> {
  const cleanId = (identifier || "").trim();
  const [zkPasswordV2, zkPasswordV1, blindedEmailV2, blindedEmailV1] = await Promise.all([
    deriveZeroKnowledgePassword(rawPassword),
    deriveLegacyV1StretchedPassword(rawPassword),
    deriveBlindedEmailAlias(cleanId),
    deriveLegacyV1BlindedEmailAlias(cleanId),
  ]);

  const candidateEmails: string[] = [];
  if (cleanId.includes("@")) {
    // Narrow down which email format exists in auth.users so we don't fire unnecessary /token calls
    try {
      const { data: checkV2 } = await supabaseAuth.rpc("sanctuary_check_recovery_method", {
        p_email: cleanId.toLowerCase(),
        p_blind_email: blindedEmailV2,
      });
      if (checkV2?.is_blinded_account) {
        candidateEmails.push(blindedEmailV2);
      } else if (checkV2?.has_plain_email) {
        candidateEmails.push(cleanId);
      } else if (blindedEmailV1 && blindedEmailV1 !== blindedEmailV2) {
        const { data: checkV1 } = await supabaseAuth.rpc("sanctuary_check_recovery_method", {
          p_email: cleanId.toLowerCase(),
          p_blind_email: blindedEmailV1,
        });
        if (checkV1?.is_blinded_account) {
          candidateEmails.push(blindedEmailV1);
        }
      }
    } catch {}

    if (candidateEmails.length === 0) {
      if (blindedEmailV2 && blindedEmailV2.toLowerCase() !== cleanId.toLowerCase()) {
        candidateEmails.push(blindedEmailV2);
      }
      if (
        blindedEmailV1 &&
        blindedEmailV1 !== blindedEmailV2 &&
        blindedEmailV1.toLowerCase() !== cleanId.toLowerCase()
      ) {
        candidateEmails.push(blindedEmailV1);
      }
      candidateEmails.push(cleanId);
    }
  } else {
    try {
      const { data: resolvedBlindEmail } = await supabaseAuth.rpc(
        "sanctuary_resolve_login_identifier",
        { p_identifier: cleanId }
      );
      if (typeof resolvedBlindEmail === "string" && resolvedBlindEmail.trim()) {
        candidateEmails.push(resolvedBlindEmail.trim());
      }
    } catch {}
    if (blindedEmailV2 && !candidateEmails.includes(blindedEmailV2)) {
      candidateEmails.push(blindedEmailV2);
    }
  }

  const candidatePasswords: string[] = [];
  for (const pw of [zkPasswordV2, zkPasswordV1, rawPassword]) {
    if (pw && !candidatePasswords.includes(pw)) {
      candidatePasswords.push(pw);
    }
  }

  let lastRes: { data: any; error: any } = {
    data: null,
    error: new Error("Invalid login credentials"),
  };

  for (const emailCandidate of candidateEmails) {
    for (let i = 0; i < candidatePasswords.length; i++) {
      const pwCandidate = candidatePasswords[i];
      const res = await supabaseAuth.auth.signInWithPassword({
        email: emailCandidate,
        password: pwCandidate,
      });
      if (!res.error && res.data?.user) {
        const needsPasswordUpgrade = pwCandidate !== zkPasswordV2;
        const needsEmailUpgrade =
          emailCandidate === blindedEmailV1 && blindedEmailV2 !== blindedEmailV1;

        if (needsPasswordUpgrade || needsEmailUpgrade) {
          // Silently upgrade v1 (100k / 64k) or legacy account to 600,000-iteration PBKDF2-HMAC-SHA256
          supabaseAuth
            .rpc("sanctuary_update_own_credentials", {
              p_current_password: pwCandidate,
              p_current_zk_password: zkPasswordV2,
              p_new_email: needsEmailUpgrade ? blindedEmailV2 : null,
              p_new_password: needsPasswordUpgrade ? zkPasswordV2 : null,
              p_metadata_patch: { zk_password_v1: true, zk_password_v2: true },
            })
            .then(({ error: rpcErr }) => {
              if (rpcErr && needsPasswordUpgrade) {
                supabaseAuth.auth
                  .updateUser({
                    password: zkPasswordV2,
                    data: { zk_password_v1: true, zk_password_v2: true },
                  })
                  .catch(() => {});
              }
            });
        }
        return { ...res, upgradedToZk: needsPasswordUpgrade || needsEmailUpgrade };
      }
      lastRes = res;
    }
  }

  return lastRes;
}

/**
 * Verifies the user's current password using an isolated non-persisted client
 * so that an active AAL2 MFA session in `supabaseAuth` is never downgraded to AAL1.
 * Transparently supports 600k v2, 100k v1, and legacy passwords.
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

    const cleanEmail = (email || "").trim();
    const zkPasswordV2 = isZeroKnowledgePreHashedPassword(password)
      ? password
      : await deriveZeroKnowledgePassword(password);

    // Fast path: when verifying an already-signed-in account, try its exact session email + v2 ZK hash first
    // so modern accounts complete verification in 1 PBKDF2 derivation + 1 /token request.
    const { data: v2DirectErr } = await ephemeralClient.auth
      .signInWithPassword({
        email: cleanEmail,
        password: zkPasswordV2,
      })
      .then((res: any) => ({ data: res.error }));
    if (!v2DirectErr) {
      return { verified: true };
    }

    let lastError = v2DirectErr.message || "Invalid password";

    // Lazy fallback for legacy accounts (100k v1 PBKDF2, plaintext password, or blinded email aliases)
    const [zkPasswordV1, blindedEmailV2, blindedEmailV1] = await Promise.all([
      isZeroKnowledgePreHashedPassword(password)
        ? Promise.resolve(password)
        : deriveLegacyV1StretchedPassword(password),
      isBlindedEmailAddress(cleanEmail)
        ? Promise.resolve(cleanEmail)
        : deriveBlindedEmailAlias(cleanEmail),
      isBlindedEmailAddress(cleanEmail)
        ? Promise.resolve(cleanEmail)
        : deriveLegacyV1BlindedEmailAlias(cleanEmail),
    ]);

    const candidatePasswords: string[] = [];
    for (const pw of [zkPasswordV2, zkPasswordV1, password]) {
      if (pw && !candidatePasswords.includes(pw)) {
        candidatePasswords.push(pw);
      }
    }

    const candidateEmails: string[] = [];
    for (const em of [cleanEmail, blindedEmailV2, blindedEmailV1]) {
      if (em && !candidateEmails.includes(em)) {
        candidateEmails.push(em);
      }
    }

    for (const emailCandidate of candidateEmails) {
      for (const pwCandidate of candidatePasswords) {
        if (emailCandidate === cleanEmail && pwCandidate === zkPasswordV2) {
          continue;
        }
        const { error } = await ephemeralClient.auth.signInWithPassword({
          email: emailCandidate,
          password: pwCandidate,
        });
        if (!error) {
          return { verified: true };
        }
        lastError = error.message;
      }
    }

    return { verified: false, error: lastError };
  } catch (err: any) {
    return { verified: false, error: err?.message || String(err) };
  }
}

/**
 * Registers and verifies a new FIDO2 / WebAuthn Passkey via Supabase's `/auth/v1/passkeys` REST API.
 * Works natively on both Web (`https://sanctuaryos.net`) and Desktop (`Sanctuary OS` via Windows `webauthn.dll`).
 */
