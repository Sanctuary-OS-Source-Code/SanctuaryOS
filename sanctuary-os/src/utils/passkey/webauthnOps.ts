import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../envUtils";
import { supabaseAuth, RESOLVED_SANCTUARY_CONFIG } from "../../supabase";
import { syncDevSessionToVite, restoreDevSessionFromVite, requestDevDesktopWebAuthn } from "./devBridge";
import { isLocalhostBrowser, isWebAuthnSupported, sanitizeFactorFriendlyName, deserializeCreationOptions, deserializeRequestOptions, serializeRegistrationCredential, serializeAuthenticationCredential, getFastActiveSession, getAuthHeaders, markPasskeySessionVerified, fetchMfaSecurityState, notifyMfaStateChanged, enrichAllowCredentialsFromCache, resolveOrFetchAuthOptions } from "./core";
import { verifyPasswordWithoutSessionDowngrade } from "./zeroKnowledge";

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
    const activeSession = await getFastActiveSession();

    if (isLocalhostBrowser() && !options?.forceFreshCeremony) {
      if (activeSession?.user?.id) {
        markPasskeySessionVerified(activeSession.user.id);
        await syncDevSessionToVite(activeSession);
        notifyMfaStateChanged();
        return {
          data: { verified: true, passkey_verified: true, user: activeSession.user },
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

    const resolvedOpt = await resolveOrFetchAuthOptions(activeSession, Boolean(options?.forceFreshCeremony));
    if (!resolvedOpt.data) {
      return {
        data: null,
        error: resolvedOpt.error || new Error("Failed to start Passkey authentication."),
      };
    }
    const optJson = resolvedOpt.data;
    const serverOptions = enrichAllowCredentialsFromCache(
      JSON.parse(JSON.stringify(optJson.options)),
      _factorId
    );
    const headers = await getAuthHeaders(false, activeSession?.access_token || null, false);
    if (!headers) {
      return { data: null, error: new Error("Failed to initialize authentication headers.") };
    }

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
    const existingSession = activeSession || (await getFastActiveSession());

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
    return {
      data: {
        ...(verifyJson || {}),
        credential: serializedCredential,
        challenge_id: optJson.challenge_id,
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

