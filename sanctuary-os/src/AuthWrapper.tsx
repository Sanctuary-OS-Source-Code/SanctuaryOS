import React, { useState, useEffect, useCallback } from "react";
import { supabase, supabaseAuth } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { invoke } from "@tauri-apps/api/core";
import { hashString } from "./lib/cryptoUtils";
import { isDesktop } from "./utils/envUtils";
import {
  authenticateFidoPasskey,
  clearPasskeySessionVerified,
  fetchMfaSecurityState,
  isPasskeySessionVerified,
  sanitizeFactorFriendlyName,
} from "./utils/passkeyUtils";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
} from "./shared";

export function openSanctuaryLogin() {
  if (typeof window !== "undefined") {
    localStorage.setItem("sanctuary_show_login", "true");
    localStorage.removeItem("sanctuary_login_bypassed");
    window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
  }
}

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { t, osLogoUrl } = useLexicon();
  const session = useStore((state) => state.session);
  const setSession = useStore((state) => state.setSession);
  const [loadingSession, setLoadingSession] = useState(true);

  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") ||
        window.location.search.includes("type=recovery"))
  );
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaPasskeys, setMfaPasskeys] = useState<any[]>([]);
  const [mfaTotpFactors, setMfaTotpFactors] = useState<any[]>([]);
  const [selectedPasskeyId, setSelectedPasskeyId] = useState<string>("");
  const [mfaMode, setMfaMode] = useState<"passkey" | "totp">("passkey");
  const [mfaCode, setMfaCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHwidBanned, setIsHwidBanned] = useState(false);
  const [sandboxAccepted, setSandboxAccepted] = useState(false);

  const [showLoginUI, setShowLoginUI] = useState(
    () => localStorage.getItem("sanctuary_show_login") === "true"
  );

  const prepareMfaChallengeFromState = async (): Promise<boolean> => {
    const state = await fetchMfaSecurityState();
    const { passkeys, totpFactors } = state;

    if (passkeys.length === 0 && totpFactors.length === 0) {
      return false;
    }

    setMfaPasskeys(passkeys);
    setMfaTotpFactors(totpFactors);

    if (passkeys.length > 0) {
      setSelectedPasskeyId(passkeys[0].id);
      setMfaMode("passkey");
    } else {
      setMfaMode("totp");
    }

    if (totpFactors.length > 0) {
      setMfaFactorId(totpFactors[0].id);
    }

    setShowMfaChallenge(true);
    return true;
  };

  const handleDismissLogin = useCallback(() => {
    localStorage.removeItem("sanctuary_show_login");
    localStorage.setItem("sanctuary_login_bypassed", "true");
    setShowLoginUI(false);
    setIsResetPassword(false);
    setStatus("");
  }, []);

  useEffect(() => {
    const handleOpenLoginEvent = () => {
      localStorage.setItem("sanctuary_show_login", "true");
      localStorage.removeItem("sanctuary_login_bypassed");
      setIsLogin(true);
      setIsResetPassword(false);
      setStatus("");
      setShowLoginUI(true);
    };
    window.addEventListener("sanctuary-open-login", handleOpenLoginEvent);
    return () => window.removeEventListener("sanctuary-open-login", handleOpenLoginEvent);
  }, []);

  useEffect(() => {
    const handleSessionUpdate = async (newSession: any, isInitialBoot = false) => {
      if (newSession) {
        try {
          if (!isPasskeySessionVerified(newSession)) {
            const mfaStatus = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (mfaStatus.data?.nextLevel === "aal2" && mfaStatus.data?.currentLevel === "aal1") {
              if (await prepareMfaChallengeFromState()) {
                setSession(null);
                return;
              }
            }
          }
        } catch (e) {
          console.error("MFA check failed", e);
        }
        localStorage.removeItem("sanctuary_show_login");
        localStorage.removeItem("sanctuary_login_bypassed");
        setShowLoginUI(false);
      } else if (isInitialBoot) {
        const isOffline =
          !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";
        const forceLogin = localStorage.getItem("sanctuary_show_login") === "true";
        const isBypassed = localStorage.getItem("sanctuary_login_bypassed") === "true";
        if (!isOffline && (forceLogin || !isBypassed)) {
          useStore.getState().setView("landing");
          setShowLoginUI(true);
        }
      }
      setSession(newSession);
    };

    const checkBanStatus = async () => {
      const isOfflineMode =
        !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";
      try {
        if (!isOfflineMode) {
          let rawHwid = "WEB_BROWSER_HWID";
          if (isDesktop()) {
            try {
              rawHwid = await invoke<string>("get_hardware_id");
            } catch {}
          }
          if (rawHwid && rawHwid !== "UNKNOWN_HWID") {
            const hwid = await hashString(rawHwid);
            const fetchPromise = supabaseAuth
              .from("hardware_bans")
              .select("hwid_hash")
              .eq("hwid_hash", hwid)
              .limit(1);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 5000)
            );
            const { data } = (await Promise.race([fetchPromise, timeoutPromise])) as any;
            if (data && data.length > 0) {
              setIsHwidBanned(true);
              localStorage.setItem("sanctuary_blacklisted", "true");
            }
          }
        }
      } catch (e) {
        console.error("HWID check failed", e);
      }

      if (localStorage.getItem("sanctuary_blacklisted") === "true") {
        setIsHwidBanned(true);
      }

      try {
        if (isOfflineMode) {
          const cachedToken =
            localStorage.getItem("sanctuary-os-auth-token") ||
            localStorage.getItem("sb-chphhvpcgcpnyvshsudh-auth-token");
          if (cachedToken) {
            try {
              const parsed = JSON.parse(cachedToken);
              setSession(parsed.session || parsed);
            } catch (e) {}
          }
        }

        if (!isOfflineMode) {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000)
          );
          const {
            data: { session: fetchedSession },
          } = (await Promise.race([sessionPromise, timeoutPromise])) as any;
          await handleSessionUpdate(fetchedSession, true);
        }
      } catch (e) {
        console.error("Session fetch failed", e);
      } finally {
        setLoadingSession(false);
      }
    };

    checkBanStatus();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_OUT") {
        clearPasskeySessionVerified();
      }
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setShowLoginUI(true);
        setStatus("");
      }
      handleSessionUpdate(newSession, false).catch(console.error);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handlePasswordRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryNewPassword || !recoveryConfirmPassword) {
      setStatus(t("err_missing", "Please fill in all fields."));
      return;
    }
    if (recoveryNewPassword.length < 8) {
      setStatus(
        t("auth_recovery_min_length_err", "Password must be at least 8 characters long.")
      );
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setStatus(t("auth_recovery_mismatch_err", "Passwords do not match."));
      return;
    }
    setIsProcessing(true);
    setStatus(t("status_authenticating", "Authenticating..."));
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryNewPassword });
      if (error) throw error;
      const successMsg = t(
        "auth_recovery_success",
        "Password updated successfully! Your account is now secured."
      );
      setStatus(successMsg);
      useStore.getState().pushStatus(successMsg, "success");
      setRecoveryNewPassword("");
      setRecoveryConfirmPassword("");
      setIsPasswordRecovery(false);
      setIsResetPassword(false);
      if (
        typeof window !== "undefined" &&
        (window.location.hash.includes("type=recovery") ||
          window.location.search.includes("type=recovery"))
      ) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const finalizeLogin = async (user: any) => {
    try {
      let rawHwid = "WEB_BROWSER_HWID";
      if (isDesktop()) {
        try {
          rawHwid = await invoke<string>("get_hardware_id");
        } catch {}
      }
      const hwid = await hashString(rawHwid);
      const fetchBanPromise = supabaseAuth
        .from("hardware_bans")
        .select("hwid_hash")
        .eq("hwid_hash", hwid)
        .limit(1);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );
      const res = (await Promise.race([fetchBanPromise, timeoutPromise])) as any;

      if (res.data && res.data.length > 0) {
        await supabaseAuth.from("profiles").update({ is_banned: true }).eq("id", user.id);
        setIsHwidBanned(true);
        localStorage.setItem("sanctuary_blacklisted", "true");
        await supabase.auth.signOut();
        throw new Error(
          t("err_hwid_blacklisted", "Hardware ban detected. Account has been permanently blacklisted.")
        );
      }
    } catch (e: any) {
      if (e.message?.includes("blacklisted")) throw e;
      console.error("Failed to check HWID ban status on login", e);
    }

    let profile = null;
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
      profile = res.data;
    } catch (e) {
      console.error("Failed to fetch profile on login", e);
    }
    if (profile?.is_banned || profile?.role === "blacklisted") {
      await supabase.auth.signOut();
      setIsHwidBanned(true);
      localStorage.setItem("sanctuary_blacklisted", "true");
      throw new Error(t("err_account_blacklisted", "Account has been permanently blacklisted."));
    } else {
      localStorage.removeItem("sanctuary_blacklisted");
      setIsHwidBanned(false);
    }
  };

  const completeAuthenticatedTransition = (newSession: any) => {
    localStorage.removeItem("sanctuary_show_login");
    localStorage.removeItem("sanctuary_login_bypassed");
    setShowMfaChallenge(false);
    setShowLoginUI(false);
    setStatus("");
    setSession(newSession);
  };

  const handlePasskeyMfaAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetFactorId = selectedPasskeyId || mfaPasskeys[0]?.id;

    setIsProcessing(true);
    setStatus(
      t(
        "passkey_status_challenging",
        "Waiting for security key or biometric verification..."
      )
    );
    try {
      const { error } = await authenticateFidoPasskey(targetFactorId);
      if (error) throw error;

      setStatus(t("status_authenticating", "Authenticating..."));
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await finalizeLogin(userData.user);
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          completeAuthenticatedTransition(sessionData.session);
        }
      }
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMfaAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || !mfaCode) return;
    setIsProcessing(true);
    setStatus(t("auth_mfa_verifying_challenge", "Starting 2FA verification challenge..."));
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) throw challenge.error;

      setStatus(t("auth_mfa_verifying_code", "Verifying authenticator code..."));
      const verify = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaCode,
      });
      if (verify.error) throw verify.error;

      // Logged in via 6-digit TOTP only: allow account access, but require Passkey step-up for Elevated Hubs
      clearPasskeySessionVerified();

      setStatus(t("status_authenticating", "Authenticating..."));
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await finalizeLogin(userData.user);
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          completeAuthenticatedTransition(sessionData.session);
        }
      }
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResetPassword) {
      if (!email) {
        setStatus(t("err_missing", "Please fill in all fields."));
        return;
      }
      setIsProcessing(true);
      setStatus(t("status_authenticating", "Authenticating..."));
      try {
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          redirectTo ? { redirectTo } : undefined
        );
        if (error) throw error;
        setStatus(t("status_reset_sent", "Password reset email sent!"));
      } catch (err: any) {
        setStatus(`${t("err_validation", "Error: ")}${err.message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!email || !password || (!isLogin && !username)) {
      setStatus(t("err_missing", "Please fill in all fields."));
      return;
    }

    setIsProcessing(true);
    setStatus(t("status_authenticating", "Authenticating..."));

    try {
      if (isLogin) {
        clearPasskeySessionVerified();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data?.user) {
          const mfaStatus = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (
            mfaStatus.data?.nextLevel === "aal2" &&
            mfaStatus.data?.currentLevel === "aal1"
          ) {
            if (await prepareMfaChallengeFromState()) {
              setIsProcessing(false);
              setStatus(t("auth_mfa_required_title", "Two-Factor Authentication Required"));
              return;
            }
          }
          await finalizeLogin(data.user);
          if (data.session) {
            completeAuthenticatedTransition(data.session);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (error) throw error;
        if (data?.session) {
          completeAuthenticatedTransition(data.session);
        } else {
          setStatus(
            t(
              "status_signup_check_email",
              "Account registered! Please check your email to verify your account."
            )
          );
        }
      }
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isHwidBanned && !sandboxAccepted) {
    return (
      <>
        <div className="w-full h-full pointer-events-none select-none opacity-40 blur-[2px] transition-all duration-300" inert>
          {children}
        </div>
        <SidePanel
          isOpen={true}
          onClose={() => {}}
          hideCloseButton={true}
          passthroughBackdrop={false}
          noBackdropDim={false}
          widthClass="w-full md:w-[640px]"
          title={t("quarantine_active", "Network Quarantine Active")}
          subtitle={`${t("err_sys_prefix", "SYS_ERR:")} ${t("auto_0xdeadbeef", "0xDEADBEEF")} • ${t("err_sys_severed", "UPLINK SEVERED")}`}
          icon={t("icon_skull", "skull")}
          iconColorClass="text-[var(--danger)]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--danger)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[26px]">
                  {t("icon_skull", "skull")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--danger)]">
                    {`${t("tab_network", "Network")} ${t("err_severed", "Severed")}`}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--danger)]">
                    {t("offline_mode", "LOCAL SANDBOX ONLY")}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--text)] leading-relaxed m-0">
                  {t(
                    "quarantine_desc1",
                    "This hardware signature has been permanently restricted from Sanctuary Network cloud services."
                  )}
                </p>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t("quarantine_desc2", "Online connectivity, {Mod} Syncing, and {Blueprint} Sharing privileges have been revoked. You are restricted to local environment operations only.")}
                </p>
              </div>
            </div>

            <ActionButton
              onClick={() => {
                setShowLoginUI(false);
                setSandboxAccepted(true);
              }}
              variant="danger"
              icon={t("icon_terminal", "terminal")}
              label={t("btn_sandbox", "Continue in Local Sandbox")}
              className="w-full"
            />
          </div>
        </SidePanel>
      </>
    );
  }

  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  const isLoginPanelOpen =
    !loadingSession &&
    (isPasswordRecovery ||
      showMfaChallenge ||
      (!session && showLoginUI && isOnline));

  const isStatusError =
    Boolean(status) &&
    (status.toLowerCase().includes("error") ||
      status.toLowerCase().includes("missing") ||
      status.toLowerCase().includes("not match") ||
      status.toLowerCase().includes("least 8") ||
      status.toLowerCase().includes("failed") ||
      status.toLowerCase().includes("invalid"));

  const isStatusSuccess =
    Boolean(status) &&
    (status.toLowerCase().includes("sent") ||
      status.toLowerCase().includes("success") ||
      status.toLowerCase().includes("registered"));

  const panelTitle = isPasswordRecovery
    ? t("auth_recovery_title", "Set New Password")
    : showMfaChallenge
      ? t("auth_mfa_required_title", "Two-Factor Verification")
      : isResetPassword
        ? t("auth_panel_reset_title", "Reset Password")
        : isLogin
          ? t("auth_tile_signin_val", "Sign In")
          : t("auth_panel_signup_title", "Create Account");

  const panelSubtitle = isPasswordRecovery
    ? t(
        "auth_recovery_subtitle",
        "Enter and confirm a new password to complete your account recovery."
      )
    : showMfaChallenge
      ? t("auth_passkey_2fa_subtitle", "Manage FIDO2 Passkeys and Authenticator Apps")
      : t("subtitle", "Secure Network Access");

  const panelIcon = isPasswordRecovery
    ? t("icon_lock_reset", "lock_reset")
    : showMfaChallenge
      ? t("icon_passkey", "passkey")
      : isResetPassword
        ? t("icon_vpn_key", "vpn_key")
        : isLogin
          ? t("icon_key", "key")
          : t("icon_person_add", "person_add");

  return (
    <>
      {children}

      <SidePanel
        isOpen={isLoginPanelOpen}
        onClose={() => {
          if (isPasswordRecovery) {
            setIsPasswordRecovery(false);
            setRecoveryNewPassword("");
            setRecoveryConfirmPassword("");
            if (typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } else if (showMfaChallenge) {
            setShowMfaChallenge(false);
            supabase.auth.signOut();
          } else {
            handleDismissLogin();
          }
        }}
        widthClass="w-full md:w-[620px]"
        title={panelTitle}
        subtitle={panelSubtitle}
        icon={panelIcon}
        iconColorClass="theme-text-accent"
        headerActions={
          !isPasswordRecovery && !showMfaChallenge ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_explore_off", "explore_off")}
                tooltip={t("btn_skip", "Bypass Login")}
                onClick={handleDismissLogin}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          {/* Clean Top Info Card (matches CoreTab & ElevatedPasskeyGate) */}
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 p-1.5">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS")}
                className="w-full h-full object-contain drop-shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t("sidebar_app_title", "Sanctuary OS")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {isPasswordRecovery
                  ? t(
                      "auth_recovery_subtitle",
                      "Enter and confirm a new password to complete your account recovery."
                    )
                  : showMfaChallenge
                    ? t(
                        "auth_mfa_passkey_prompt_desc",
                        "Verify your identity using your enrolled FIDO2 Passkey or authenticator code."
                      )
                    : isResetPassword
                      ? t(
                          "auth_panel_reset_desc",
                          "Enter your registered email address and we will send a secure link to reset your password."
                        )
                      : isLogin
                        ? t("auth_panel_signin_desc", "Sign in to sync cloud {blueprints}, diagnostic reports, {mason} workshops, and supporter perks across devices.")
                        : t(
                            "network_access_guidelines_desc",
                            "Zero-knowledge identity protection and encrypted cloud sync across all Sanctuary workspaces."
                          )}
              </p>
            </div>
          </div>

          {/* Primary Mode Switcher Tiles (Sign In vs Create Account) */}
          {!isPasswordRecovery && !showMfaChallenge && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_key", "key")}
                label={t("auth_tile_signin_label", "Existing Account")}
                value={t("auth_tile_signin_val", "Sign In")}
                isActive={isLogin && !isResetPassword}
                onClick={() => {
                  setIsLogin(true);
                  setIsResetPassword(false);
                  setStatus("");
                }}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                icon={t("icon_person_add", "person_add")}
                label={t("auth_tile_signup_label", "New Account")}
                value={t("auth_tile_signup_val", "Register")}
                isActive={!isLogin && !isResetPassword}
                onClick={() => {
                  setIsLogin(false);
                  setIsResetPassword(false);
                  setStatus("");
                }}
              />
            </div>
          )}

          {/* Status / Error Feedback Banner */}
          {status && (
            <div
              className={`px-4 py-3 rounded-2xl bg-transparent border text-xs font-bold leading-relaxed flex items-start gap-2.5 ${
                isStatusError
                  ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                  : isStatusSuccess
                    ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                    : "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
              }`}
            >
              <span
                className={`material-symbols-outlined !text-[17px] shrink-0 mt-0.5 ${
                  isProcessing ? "animate-spin" : ""
                }`}
              >
                {isStatusError
                  ? t("icon_error", "error")
                  : isStatusSuccess
                    ? t("icon_check_circle", "check_circle")
                    : t("icon_sync", "sync")}
              </span>
              <span className="flex-1 min-w-0 break-words">{status}</span>
            </div>
          )}

          {/* BODY CONTENT BY MODE */}
          {isPasswordRecovery ? (
            <form
              onSubmit={handlePasswordRecoverySubmit}
              className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
              noValidate
            >
              <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                    {t("icon_lock_reset", "lock_reset")}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                    {t("auth_recovery_title", "Set New Password")}
                  </span>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t(
                      "auth_recovery_new_password_label",
                      "New Password (Min. 8 Characters)"
                    )}
                  </label>
                  <div className="relative group/input">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                      {t("icon_lock", "lock")}
                    </span>
                    <input
                      type="password"
                      value={recoveryNewPassword}
                      onChange={(e) => setRecoveryNewPassword(e.target.value)}
                      autoComplete="new-password"
                      spellCheck="false"
                      minLength={8}
                      placeholder={t(
                        "auth_recovery_new_password_label",
                        "New Password (Min. 8 Characters)"
                      )}
                      className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("auth_confirm_new_password_label", "Confirm New Password")}
                  </label>
                  <div className="relative group/input">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                      {t("icon_verified_user", "verified_user")}
                    </span>
                    <input
                      type="password"
                      value={recoveryConfirmPassword}
                      onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      spellCheck="false"
                      minLength={8}
                      placeholder={t(
                        "auth_confirm_new_password_label",
                        "Confirm New Password"
                      )}
                      className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <ActionButton
                    type="button"
                    onClick={() => {
                      setIsPasswordRecovery(false);
                      setRecoveryNewPassword("");
                      setRecoveryConfirmPassword("");
                      if (typeof window !== "undefined") {
                        window.history.replaceState(
                          {},
                          document.title,
                          window.location.pathname
                        );
                      }
                    }}
                    variant="glass"
                    icon={t("icon_close", "close")}
                    label={t("auth_recovery_cancel_btn", "Cancel Recovery")}
                    className="w-full"
                  />
                  <ActionButton
                    type="submit"
                    disabled={isProcessing || recoveryNewPassword.length < 8}
                    variant="glass"
                    icon={t("icon_save", "save")}
                    label={t("auth_recovery_submit_btn", "Save New Password")}
                    className="w-full"
                  />
                </div>
              </div>
            </form>
          ) : showMfaChallenge ? (
            <>
              {mfaPasskeys.length > 0 && mfaTotpFactors.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_passkey", "passkey")}
                    label={t("auth_passkey_badge_fido", "FIDO2 Passkey")}
                    value={t("passkey_stat_enrolled_count", "{0} Enrolled").replace(
                      "{0}",
                      String(mfaPasskeys.length)
                    )}
                    isActive={mfaMode === "passkey"}
                    onClick={() => {
                      setMfaMode("passkey");
                      setStatus("");
                    }}
                  />
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_qr_code_scanner", "qr_code_scanner")}
                    label={t("passkey_tile_totp_title", "Authenticator App")}
                    value={t("passkey_stat_enrolled_count", "{0} Enrolled").replace(
                      "{0}",
                      String(mfaTotpFactors.length)
                    )}
                    isActive={mfaMode === "totp"}
                    onClick={() => {
                      setMfaMode("totp");
                      setStatus("");
                    }}
                  />
                </div>
              )}

              {mfaMode === "passkey" && mfaPasskeys.length > 0 ? (
                <form
                  onSubmit={handlePasskeyMfaAuth}
                  className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
                  noValidate
                >
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_passkey", "passkey")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("auth_mfa_passkey_required_title", "Passkey Verification Required")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)]">
                      {t("auth_passkey_badge_fido", "FIDO2 PASSKEY")}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-4">
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_mfa_passkey_prompt_desc",
                        "Verify your identity using your enrolled FIDO2 Passkey or hardware security key."
                      )}
                    </p>

                    {mfaPasskeys.length > 1 && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t("auth_mfa_select_passkey_label", "Select Enrolled Passkey")}
                        </label>
                        <CustomDropdown
                          value={selectedPasskeyId}
                          onChange={(vals: any) =>
                            setSelectedPasskeyId(Array.isArray(vals) ? vals[0] : vals)
                          }
                          options={mfaPasskeys.map((pk) => ({
                            id: pk.id,
                            label: sanitizeFactorFriendlyName(
                              pk.friendly_name,
                              t("passkey_unnamed_device", "FIDO2 Passkey")
                            ),
                            icon: t("icon_passkey", "passkey"),
                          }))}
                          disableTint={true}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <ActionButton
                        type="button"
                        onClick={() => {
                          setShowMfaChallenge(false);
                          supabase.auth.signOut();
                        }}
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        className="w-full"
                      />
                      <ActionButton
                        type="submit"
                        disabled={isProcessing}
                        variant="glass"
                        icon={t("icon_passkey", "passkey")}
                        label={t("auth_mfa_passkey_btn", "Authenticate with Passkey")}
                        className="w-full"
                      />
                    </div>
                  </div>
                </form>
              ) : (
                <form
                  onSubmit={handleMfaAuth}
                  className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
                  noValidate
                >
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_qr_code_scanner", "qr_code_scanner")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("auth_mfa_code_label", "6-Digit Authenticator Code")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[var(--subtext)]">
                      {t("auth_passkey_badge_totp", "AUTHENTICATOR APP")}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-4">
                    <div className="relative group/input">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                        {t("icon_pin", "pin")}
                      </span>
                      <input
                        type="text"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        maxLength={6}
                        placeholder={t("auth_mfa_code_label", "6-Digit Authenticator Code")}
                        className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-mono font-black tracking-[0.25em] text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <ActionButton
                        type="button"
                        onClick={() => {
                          setShowMfaChallenge(false);
                          supabase.auth.signOut();
                        }}
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        className="w-full"
                      />
                      <ActionButton
                        type="submit"
                        disabled={isProcessing || mfaCode.length < 6}
                        variant="glass"
                        icon={t("icon_check", "check")}
                        label={t("auth_mfa_verify_btn", "Verify 2FA")}
                        className="w-full"
                      />
                    </div>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              {/* Main Auth Form Card (Sign In / Create Account / Reset Password) */}
              <form
                onSubmit={handleAuth}
                className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
                noValidate
              >
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {isResetPassword
                        ? t("icon_vpn_key", "vpn_key")
                        : isLogin
                          ? t("icon_lock", "lock")
                          : t("icon_person_add", "person_add")}
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {isResetPassword
                        ? t("auth_panel_reset_title", "Reset Password")
                        : isLogin
                          ? t("auth_card_credentials_title", "Account Credentials")
                          : t("auth_panel_signup_title", "Create Account")}
                    </span>
                  </div>

                  {!isResetPassword ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true);
                        setStatus("");
                      }}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_vpn_key", "vpn_key")}
                      </span>
                      <span>{t("toggle_to_reset", "Forgot Password? Reset it")}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(false);
                        setIsLogin(true);
                        setStatus("");
                      }}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_arrow_back", "arrow_back")}
                      </span>
                      <span>{t("toggle_to_login_from_reset", "Back to Login")}</span>
                    </button>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-4">
                  {!isLogin && !isResetPassword && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_label_username", "Username")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                          {t("icon_person", "person")}
                        </span>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          autoComplete="off"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t("placeholder_username", "Username")}
                          className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                      {t("auth_label_email", "Email Address")}
                    </label>
                    <div className="relative group/input">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                        {t("icon_alternate_email", "alternate_email")}
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        data-1p-ignore
                        placeholder={t("auth_label_email", "Email Address")}
                        className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>
                  </div>

                  {!isResetPassword && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_label_password", "Password")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                          {t("icon_lock", "lock")}
                        </span>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t("auth_label_password", "Password")}
                          className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <ActionButton
                    type="submit"
                    disabled={isProcessing}
                    variant="glass"
                    icon={
                      isResetPassword
                        ? t("icon_send", "send")
                        : isLogin
                          ? t("icon_login", "login")
                          : t("icon_person_add", "person_add")
                    }
                    label={
                      isProcessing
                        ? t("status_authenticating", "Authenticating...")
                        : isResetPassword
                          ? t("btn_send_reset", "Send Reset Link")
                          : isLogin
                            ? t("btn_login", "Login to Network")
                            : t("btn_signup", "Register Username")
                    }
                    className="w-full"
                  />
                </div>
              </form>

              {/* FIDO2 Passkey Verification Card (Sign In Mode) */}
              {isLogin && !isResetPassword && (
                <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col">
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_passkey", "passkey")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("auth_passkey_badge_fido", "FIDO2 Passkey")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)]">
                      {t("auth_passkey_badge_fido", "FIDO2 PASSKEY")}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-3.5">
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_passkey_login_card_desc",
                        "Verify your session using Windows Hello, Touch ID, 1Password, Bitwarden, or a hardware security key."
                      )}
                    </p>
                    <ActionButton
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handlePasskeyMfaAuth()}
                      variant="glass"
                      icon={t("icon_passkey", "passkey")}
                      label={t("btn_verify_with_passkey", "Authenticate with Passkey")}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* Network & Privacy Guidelines Card (Create Account Mode) */}
              {!isLogin && !isResetPassword && (
                <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col">
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_shield", "shield")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("network_access_guidelines_header", "Network & Privacy Guidelines")}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                    <div className="px-4 py-3.5 flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--success)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_shield", "shield")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black tracking-wide text-[var(--text)]">
                          {t("auth_privacy_title", "Zero-Knowledge Privacy")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                          {t(
                            "auth_privacy_desc",
                            "Your personal folders and machine paths are scrubbed locally before any diagnostic log leaves your device."
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 py-3.5 flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_visibility_off", "visibility_off")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black tracking-wide text-[var(--text)]">
                          {t("auth_anon_title", "Pseudonymous Identity")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                          {t(
                            "auth_anon_desc",
                            "Only your chosen handle is visible on community blueprints, comments, and reports."
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 py-3.5 flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_mark_email_read", "mark_email_read")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black tracking-wide text-[var(--text)]">
                          {t("auth_masked_title", "Masked Email Protection")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                          {t(
                            "auth_masked_desc",
                            "Your email address is used strictly for authentication and recovery, and is masked across all UI surfaces."
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 py-3.5 flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_cloud_done", "cloud_done")}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black tracking-wide text-[var(--text)]">
                          {t("auth_cloud_title", "Encrypted Cloud Sync")}
                        </span>
                        <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                          {t("auth_cloud_desc", "Sanctuary does not monitor your local {Vault}. Metadata you explicitly upload to the network is associated with your account. You do not need to upload anything for the application to function properly.")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SidePanel>
    </>
  );
}
