import { invoke } from "@tauri-apps/api/core";
import { supabase, supabaseAuth } from "../supabase";
import { hashString } from "../lib/cryptoUtils";
import { isDesktop } from "./envUtils";
import {
  authenticateFidoPasskey,
  checkAccountRecoveryMethod,
  clearPasskeySessionVerified,
  fetchMfaSecurityState,
} from "./passkeyUtils";

export interface PreparedMfaChallenge {
  hasAny: boolean;
  passkeys: any[];
  totpFactors: any[];
  defaultMode: "passkey" | "totp";
  defaultPasskeyId: string;
  defaultTotpFactorId: string | null;
}

export async function prepareMfaChallengeData(
  strictPasskeyOnly = false
): Promise<PreparedMfaChallenge> {
  const state = await fetchMfaSecurityState();
  const { passkeys, totpFactors } = state;
  const effectiveTotp =
    strictPasskeyOnly && passkeys.length > 0 ? [] : totpFactors;

  if (passkeys.length === 0 && effectiveTotp.length === 0) {
    return {
      hasAny: false,
      passkeys: [],
      totpFactors: [],
      defaultMode: "passkey",
      defaultPasskeyId: "",
      defaultTotpFactorId: null,
    };
  }

  return {
    hasAny: true,
    passkeys,
    totpFactors: effectiveTotp,
    defaultMode: passkeys.length > 0 ? "passkey" : "totp",
    defaultPasskeyId: passkeys[0]?.id || "",
    defaultTotpFactorId: effectiveTotp[0]?.id || null,
  };
}

export async function checkDesktopHardwareBan(
  timeoutMs = 3000
): Promise<{ isBanned: boolean; hwidHash: string | null }> {
  if (!isDesktop()) {
    return { isBanned: false, hwidHash: null };
  }

  let rawHwid = "";
  try {
    rawHwid = await invoke<string>("get_hardware_id");
  } catch {
    return { isBanned: false, hwidHash: null };
  }

  if (
    !rawHwid ||
    rawHwid === "UNKNOWN_HWID" ||
    rawHwid === "WEB_BROWSER_HWID"
  ) {
    return { isBanned: false, hwidHash: null };
  }

  const hwidHash = await hashString(rawHwid);
  const fetchBanPromise = supabaseAuth
    .from("hardware_bans")
    .select("hwid_hash")
    .eq("hwid_hash", hwidHash)
    .limit(1);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), timeoutMs)
  );
  const res = (await Promise.race([fetchBanPromise, timeoutPromise])) as any;
  const isBanned = Boolean(res?.data && res.data.length > 0);
  return { isBanned, hwidHash };
}

export async function enforceLoginClearanceAndBanCheck(
  user: any,
  t: (key: string, fallback?: string) => any,
  onBlacklistedChange?: (banned: boolean) => void
): Promise<void> {
  try {
    const { isBanned } = await checkDesktopHardwareBan(3000);
    if (isBanned) {
      await supabaseAuth
        .from("profiles")
        .update({ is_banned: true })
        .eq("id", user.id);
      onBlacklistedChange?.(true);
      localStorage.setItem("sanctuary_blacklisted", "true");
      await supabase.auth.signOut();
      throw new Error(
        t(
          "err_hwid_blacklisted",
          "Hardware ban detected. Account has been permanently blacklisted."
        )
      );
    }
  } catch (e: any) {
    if (e?.message?.includes("blacklisted")) throw e;
  }

  let profile: any = null;
  try {
    const fetchPromise = supabaseAuth
      .from("profiles")
      .select("is_banned, role")
      .eq("id", user.id)
      .maybeSingle();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 3000)
    );
    const res = (await Promise.race([fetchPromise, timeoutPromise])) as any;
    profile = res?.data;
  } catch {
    // Non-blocking timeout fallback
  }

  if (profile?.is_banned || profile?.role === "blacklisted") {
    await supabase.auth.signOut();
    onBlacklistedChange?.(true);
    localStorage.setItem("sanctuary_blacklisted", "true");
    throw new Error(
      t("err_account_blacklisted", "Account has been permanently blacklisted.")
    );
  } else {
    localStorage.removeItem("sanctuary_blacklisted");
    onBlacklistedChange?.(false);
  }
}

export async function verifyPasskeyMfaAndFetchSession(targetFactorId?: string) {
  const { error } = await authenticateFidoPasskey(targetFactorId);
  if (error) throw error;
  const { data: userData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  return {
    user: userData?.user || null,
    session: sessionData?.session || null,
  };
}

export async function verifyTotpMfaAndFetchSession(
  factorId: string,
  code: string,
  onVerifyStage?: () => void
) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;

  onVerifyStage?.();
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) throw verify.error;

  clearPasskeySessionVerified();
  const { data: userData } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  return {
    user: userData?.user || null,
    session: sessionData?.session || null,
  };
}

export async function sendPasswordResetWithBlindGuard(
  email: string,
  t: (key: string, fallback?: string) => any,
  blindedNoticeFallback: string
): Promise<{ blindedBlocked: boolean; message: string }> {
  const recoveryCheck = await checkAccountRecoveryMethod(email);
  if (recoveryCheck.isBlindedAccount && !recoveryCheck.hasPlainEmail) {
    return {
      blindedBlocked: true,
      message: t("auth_reset_blinded_email_notice", blindedNoticeFallback),
    };
  }
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    redirectTo ? { redirectTo } : undefined
  );
  if (error) throw error;
  return {
    blindedBlocked: false,
    message: t("status_reset_sent", "Password reset email sent!"),
  };
}

export function classifyAuthStatusMessage(statusText: string): {
  isError: boolean;
  isSuccess: boolean;
} {
  if (!statusText) return { isError: false, isSuccess: false };
  const lower = statusText.toLowerCase();
  const isError =
    lower.includes("error") ||
    lower.includes("missing") ||
    lower.includes("not match") ||
    lower.includes("least 8") ||
    lower.includes("failed") ||
    lower.includes("invalid") ||
    lower.includes("requires") ||
    lower.includes("blinded");
  const isSuccess =
    lower.includes("sent") ||
    lower.includes("success") ||
    lower.includes("registered");
  return { isError, isSuccess };
}
