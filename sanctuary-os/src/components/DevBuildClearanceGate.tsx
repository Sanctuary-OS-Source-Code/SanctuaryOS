import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useTooltipStore } from "../store/tooltipStore";
import { supabase, supabaseAuth } from "../supabase";
import { hashString } from "../lib/cryptoUtils";
import { isDesktop } from "../utils/envUtils";
import {
  authenticateFidoPasskey,
  clearPasskeySessionVerified,
  fetchMfaSecurityState,
  isLocalhostBrowser,
  markPasskeySessionVerified,
  sanitizeFactorFriendlyName,
  syncDevSessionToVite,
} from "../utils/passkeyUtils";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  SidePanel,
  handleOpenUrl,
} from "../shared";
import {
  verifyDevBuildClearance,
  DevBuildClearanceResult,
} from "../utils/supporterManager";
import { CommunitySupportSidePanel } from "../side-panels/CommunitySupportSidePanel";

export function DevBuildClearanceGate() {
  const { t, osLogoUrl } = useLexicon();
  const session = useStore((state) => state.session);
  const setSession = useStore((state) => state.setSession);
  const osRole = useStore((state) => state.osRole);
  const userRole = useStore((state) => state.userRole);
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);

  const [clearance, setClearance] = useState<DevBuildClearanceResult | null>(
    null,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Embedded Login Panel state (mirrors AuthWrapper so the Dev Build gate IS the locked Login SidePanel)
  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
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
  const [authStatus, setAuthStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const prevViewRef = useRef<string | null>(null);

  const runClearanceCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await verifyDevBuildClearance();
      setClearance(res);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    runClearanceCheck();
  }, [runClearanceCheck, session?.user?.id, osRole, userRole]);

  useEffect(() => {
    if (!clearance || !clearance.isDevBinary || clearance.isAuthorized) {
      return;
    }

    const interval = setInterval(() => {
      verifyDevBuildClearance()
        .then((res) => setClearance(res))
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [clearance]);

  const isLocked = Boolean(
    clearance && clearance.isDevBinary && !clearance.isAuthorized,
  );

  // Force Landing Page in the background while locked, and restore previous view on unlock
  useEffect(() => {
    if (isLocked) {
      if (view !== "landing") {
        if (!prevViewRef.current) {
          prevViewRef.current = view;
        }
        setView("landing");
      }
    } else if (prevViewRef.current) {
      const restoreTarget = prevViewRef.current;
      prevViewRef.current = null;
      if (useStore.getState().isConfigured && restoreTarget !== "landing") {
        setView(restoreTarget);
      }
    }
  }, [isLocked, view, setView]);

  // Apply Malware / Startup style OS lockdown while DevBuildClearanceGate is locked
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__sanctuaryDevGateLocked = isLocked;
      window.dispatchEvent(
        new CustomEvent("sanctuary-dev-gate-lock-changed", {
          detail: { locked: isLocked },
        }),
      );
    }

    if (!isLocked || typeof document === "undefined") {
      useTooltipStore.getState().clearTooltip();
      return;
    }

    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: "dev-gate-lockdown" }),
    );
    try {
      useModalStore.getState().setIsSideBrowserOpen(false);
    } catch (_) {}

    document.body.classList.add("sa-malware-lockdown");
    const osShell = document.getElementById("sanctuary-os-shell");
    if (osShell) {
      osShell.setAttribute("inert", "");
    }

    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      if (typeof window !== "undefined") {
        (window as any).__sanctuaryDevGateLocked = false;
        window.dispatchEvent(
          new CustomEvent("sanctuary-dev-gate-lock-changed", {
            detail: { locked: false },
          }),
        );
      }
      const otherLockdown = document.querySelector(
        '[data-sa-malware-active="true"]',
      );
      if (!otherLockdown) {
        document.body.classList.remove("sa-malware-lockdown");
        if (osShell) {
          osShell.removeAttribute("inert");
        }
      }
      useTooltipStore.getState().clearTooltip();
    };
  }, [isLocked]);

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

  const finalizeLogin = async (user: any) => {
    try {
      let rawHwid = "";
      if (isDesktop()) {
        try {
          rawHwid = await invoke<string>("get_hardware_id");
        } catch {}
      }
      if (
        rawHwid &&
        rawHwid !== "UNKNOWN_HWID" &&
        rawHwid !== "WEB_BROWSER_HWID"
      ) {
        const hwid = await hashString(rawHwid);
        const fetchBanPromise = supabaseAuth
          .from("hardware_bans")
          .select("hwid_hash")
          .eq("hwid_hash", hwid)
          .limit(1);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000),
        );
        const res = (await Promise.race([fetchBanPromise, timeoutPromise])) as any;

        if (res.data && res.data.length > 0) {
          await supabaseAuth
            .from("profiles")
            .update({ is_banned: true })
            .eq("id", user.id);
          localStorage.setItem("sanctuary_blacklisted", "true");
          await supabase.auth.signOut();
          throw new Error(
            t(
              "err_hwid_blacklisted",
              "Hardware ban detected. Account has been permanently blacklisted.",
            ),
          );
        }
      }
    } catch (e: any) {
      if (e.message?.includes("blacklisted")) throw e;
    }

    let profile = null;
    try {
      const fetchPromise = supabaseAuth
        .from("profiles")
        .select("is_banned, role")
        .eq("id", user.id)
        .maybeSingle();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000),
      );
      const res = (await Promise.race([fetchPromise, timeoutPromise])) as any;
      profile = res.data;
    } catch {}

    if (profile?.is_banned || profile?.role === "blacklisted") {
      await supabase.auth.signOut();
      localStorage.setItem("sanctuary_blacklisted", "true");
      throw new Error(
        t(
          "err_account_blacklisted",
          "Account has been permanently blacklisted.",
        ),
      );
    } else {
      localStorage.removeItem("sanctuary_blacklisted");
    }
  };

  const completeAuthenticatedTransition = async (newSession: any) => {
    localStorage.removeItem("sanctuary_show_login");
    localStorage.removeItem("sanctuary_login_bypassed");
    setShowMfaChallenge(false);
    setAuthStatus("");
    setPassword("");
    setSession(newSession);
    await runClearanceCheck();
  };

  const handlePasskeyMfaAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetFactorId = selectedPasskeyId || mfaPasskeys[0]?.id;

    setIsProcessing(true);
    setAuthStatus(
      t(
        "passkey_status_challenging",
        "Waiting for security key or biometric verification...",
      ),
    );
    try {
      const { error } = await authenticateFidoPasskey(targetFactorId);
      if (error) throw error;

      setAuthStatus(t("status_authenticating", "Authenticating..."));
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await finalizeLogin(userData.user);
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await completeAuthenticatedTransition(sessionData.session);
        }
      }
    } catch (err: any) {
      setAuthStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMfaAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || !mfaCode) return;
    setIsProcessing(true);
    setAuthStatus(
      t("auth_mfa_verifying_challenge", "Starting 2FA verification challenge..."),
    );
    try {
      const challenge = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });
      if (challenge.error) throw challenge.error;

      setAuthStatus(
        t("auth_mfa_verifying_code", "Verifying authenticator code..."),
      );
      const verify = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaCode,
      });
      if (verify.error) throw verify.error;

      clearPasskeySessionVerified();

      setAuthStatus(t("status_authenticating", "Authenticating..."));
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await finalizeLogin(userData.user);
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await completeAuthenticatedTransition(sessionData.session);
        }
      }
    } catch (err: any) {
      setAuthStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResetPassword) {
      if (!email) {
        setAuthStatus(t("err_missing", "Please fill in all fields."));
        return;
      }
      setIsProcessing(true);
      setAuthStatus(t("status_authenticating", "Authenticating..."));
      try {
        const redirectTo =
          typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          redirectTo ? { redirectTo } : undefined,
        );
        if (error) throw error;
        setAuthStatus(t("status_reset_sent", "Password reset email sent!"));
      } catch (err: any) {
        setAuthStatus(`${t("err_validation", "Error: ")}${err.message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!email || !password || (!isLogin && !username)) {
      setAuthStatus(t("err_missing", "Please fill in all fields."));
      return;
    }

    setIsProcessing(true);
    setAuthStatus(t("status_authenticating", "Authenticating..."));

    try {
      if (isLogin) {
        clearPasskeySessionVerified();
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data?.user) {
          if (isLocalhostBrowser()) {
            markPasskeySessionVerified(data.user.id);
            if (data.session) {
              syncDevSessionToVite(data.session).catch(() => {});
            }
          } else {
            const mfaState = await fetchMfaSecurityState();
            const needsTotpLoginChallenge =
              !mfaState.hasPasskey &&
              mfaState.hasTotp &&
              mfaState.nextLevel === "aal2" &&
              mfaState.currentLevel === "aal1";
            if (needsTotpLoginChallenge) {
              if (await prepareMfaChallengeFromState()) {
                setIsProcessing(false);
                setAuthStatus(
                  t(
                    "auth_mfa_required_title",
                    "Two-Factor Authentication Required",
                  ),
                );
                return;
              }
            }
          }
          await finalizeLogin(data.user);
          if (data.session) {
            await completeAuthenticatedTransition(data.session);
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
          await completeAuthenticatedTransition(data.session);
        } else {
          setAuthStatus(
            t(
              "status_signup_check_email",
              "Account registered! Please check your email to verify your account.",
            ),
          );
        }
      }
    } catch (err: any) {
      setAuthStatus(`${t("err_validation", "Error: ")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isLocked || !clearance) {
    return null;
  }

  const userEmail = session?.user?.email || "";
  const isUnauthenticated =
    clearance.reason === "unauthenticated" || !session?.user?.id;

  const isStatusError =
    Boolean(authStatus) &&
    (authStatus.toLowerCase().includes("error") ||
      authStatus.toLowerCase().includes("missing") ||
      authStatus.toLowerCase().includes("not match") ||
      authStatus.toLowerCase().includes("least 8") ||
      authStatus.toLowerCase().includes("failed") ||
      authStatus.toLowerCase().includes("invalid"));

  const isStatusSuccess =
    Boolean(authStatus) &&
    (authStatus.toLowerCase().includes("sent") ||
      authStatus.toLowerCase().includes("success") ||
      authStatus.toLowerCase().includes("registered"));

  const panelTitle = showMfaChallenge
    ? t("auth_mfa_required_title", "Two-Factor Verification")
    : isResetPassword
      ? t("auth_panel_reset_title", "Reset Password")
      : !isLogin
        ? t("auth_panel_signup_title", "Create Account")
        : t("dev_gate_title", "Supporter Dev Build Clearance Required");

  const panelIcon = showMfaChallenge
    ? t("icon_passkey", "passkey")
    : isResetPassword
      ? t("icon_vpn_key", "vpn_key")
      : !isLogin
        ? t("icon_person_add", "person_add")
        : t("icon_bolt", "bolt");

  const portalRoot =
    (typeof document !== "undefined" &&
      document.getElementById("sa-portals")) ||
    (typeof document !== "undefined" ? document.body : null);

  const lockShieldOverlay = (
    <div
      data-sa-malware-active="true"
      className="fixed inset-0 z-[59998] pointer-events-auto select-none cursor-passkey-locked"
      onMouseMove={(e) => {
        useTooltipStore.getState().setTooltip({
          title: t("dev_gate_title", "Supporter Dev Build Clearance Required"),
          subtitle: t(
            "dev_gate_desc",
            "You are running a Dev Build from the supporter preview channel. To unlock this build, sign in with an account that has active Global Dev Build time ($5 = +30 days via any Partner Community or Keepers Core), or download the free Public Stable release.",
          ),
          variant: "warning",
          icon: t("icon_block", "block"),
          x: e.clientX,
          y: e.clientY - 14,
          align: "center",
          vAlign: "top",
        });
      }}
      onMouseLeave={() => {
        useTooltipStore.getState().clearTooltip();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  );

  return (
    <>
      {portalRoot
        ? createPortal(lockShieldOverlay, portalRoot)
        : lockShieldOverlay}

      <SidePanel
        isOpen={!isSupportOpen}
        onClose={() => {}}
        hideCloseButton={true}
        passthroughBackdrop={true}
        noBackdropDim={true}
        backdropZ="z-[60000]"
        panelZ="z-[60001]"
        panelClass="sa-malware-lockdown-panel"
        widthClass="w-full md:w-[620px]"
        title={panelTitle}
        subtitle={t("dev_gate_badge", "DEV BUILD • SUPPORTER STREAM")}
        icon={panelIcon}
        iconColorClass="theme-text-accent"
        badgeText={clearance.appVersion ? `v${clearance.appVersion}` : undefined}
      >
        <div
          className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8"
          onMouseEnter={() => useTooltipStore.getState().clearTooltip()}
        >
          {/* 1. Top Dev Build Clearance Policy Card (matches AuthWrapper & ElevatedPasskeyGate) */}
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 p-1.5">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS")}
                className="w-full h-full object-contain drop-shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                  {t("dev_gate_badge", "DEV BUILD • SUPPORTER STREAM")}
                </span>
                {clearance.appVersion && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)]">
                    {`v${clearance.appVersion}`}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "dev_gate_desc",
                  "You are running a Dev Build from the supporter preview channel. To unlock this build, sign in with an account that has active Global Dev Build time ($5 = +30 days via any Partner Community or Keepers Core), or download the free Public Stable release.",
                )}
              </p>
            </div>
          </div>

          {/* 2. Clearance Status & Stream Actions Card */}
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[20px]">
                    {isUnauthenticated
                      ? t("icon_lock", "lock")
                      : t("icon_account_circle", "account_circle")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-75">
                    {t("dev_gate_status_label", "Account Status")}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)] leading-snug break-words">
                    {isChecking
                      ? t(
                          "dev_gate_checking",
                          "Verifying Cloud Supporter Clearance...",
                        )
                      : isUnauthenticated
                        ? t(
                            "dev_gate_status_unauthenticated",
                            "Not Signed In — Sign in to verify your Supporter timer",
                          )
                        : `${userEmail ? `${userEmail} • ` : ""}${t("dev_gate_status_expired", "No Active Dev Build Time Found on Account")}`}
                  </span>
                </div>
              </div>

              <ActionButton
                variant="glass"
                icon={t("icon_sync", "sync")}
                label={t("dev_gate_btn_recheck", "Re-Check Clearance")}
                onClick={runClearanceCheck}
                disabled={isChecking}
                className="shrink-0"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                label={t(
                  "dev_gate_btn_unlock",
                  "Unlock Dev Builds ($5 = +30 Days)",
                )}
                onClick={() => setIsSupportOpen(true)}
                className="w-full justify-center"
              />

              <ActionButton
                variant="glass"
                icon={t("icon_download", "download")}
                label={`${t("dev_gate_btn_download_stable", "Download Free Stable Release")}${clearance.stableVersion ? ` (v${clearance.stableVersion})` : ""}`}
                onClick={() => {
                  if (clearance.stableDownloadUrl) {
                    handleOpenUrl(clearance.stableDownloadUrl);
                  }
                }}
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* 3. Primary Mode Switcher Tiles (Sign In vs Create Account) */}
          {!showMfaChallenge && (
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
                  setAuthStatus("");
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
                  setAuthStatus("");
                }}
              />
            </div>
          )}

          {/* 4. Status / Error Feedback Banner */}
          {authStatus && (
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
              <span className="flex-1 min-w-0 break-words">{authStatus}</span>
            </div>
          )}

          {/* 5. Login / 2FA Form Cards (matches AuthWrapper) */}
          {showMfaChallenge ? (
            <>
              {mfaPasskeys.length > 0 && mfaTotpFactors.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_passkey", "passkey")}
                    label={t("auth_passkey_badge_fido", "FIDO2 Passkey")}
                    value={t(
                      "passkey_stat_enrolled_count",
                      "{0} Enrolled",
                    ).replace("{0}", String(mfaPasskeys.length))}
                    isActive={mfaMode === "passkey"}
                    onClick={() => {
                      setMfaMode("passkey");
                      setAuthStatus("");
                    }}
                  />
                  <DashboardStatTile
                    variant="filter"
                    className="!w-full"
                    icon={t("icon_qr_code_scanner", "qr_code_scanner")}
                    label={t("passkey_tile_totp_title", "Authenticator App")}
                    value={t(
                      "passkey_stat_enrolled_count",
                      "{0} Enrolled",
                    ).replace("{0}", String(mfaTotpFactors.length))}
                    isActive={mfaMode === "totp"}
                    onClick={() => {
                      setMfaMode("totp");
                      setAuthStatus("");
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
                        {t(
                          "auth_mfa_passkey_required_title",
                          "Passkey Verification Required",
                        )}
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
                        "Verify your identity using your enrolled FIDO2 Passkey or hardware security key.",
                      )}
                    </p>

                    {mfaPasskeys.length > 1 && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t(
                            "auth_mfa_select_passkey_label",
                            "Select Enrolled Passkey",
                          )}
                        </label>
                        <CustomDropdown
                          value={selectedPasskeyId}
                          onChange={(vals: any) =>
                            setSelectedPasskeyId(
                              Array.isArray(vals) ? vals[0] : vals,
                            )
                          }
                          options={mfaPasskeys.map((pk) => ({
                            id: pk.id,
                            label: sanitizeFactorFriendlyName(
                              pk.friendly_name,
                              t("passkey_unnamed_device", "FIDO2 Passkey"),
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
                        label={t(
                          "auth_mfa_passkey_btn",
                          "Authenticate with Passkey",
                        )}
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
                        {t(
                          "auth_mfa_code_label",
                          "6-Digit Authenticator Code",
                        )}
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
                        placeholder={t(
                          "auth_mfa_code_label",
                          "6-Digit Authenticator Code",
                        )}
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
                          ? t(
                              "auth_card_credentials_title",
                              "Account Credentials",
                            )
                          : t("auth_panel_signup_title", "Create Account")}
                    </span>
                  </div>

                  {!isResetPassword ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true);
                        setAuthStatus("");
                      }}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_vpn_key", "vpn_key")}
                      </span>
                      <span>
                        {t("toggle_to_reset", "Forgot Password? Reset it")}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(false);
                        setIsLogin(true);
                        setAuthStatus("");
                      }}
                      className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {t("icon_arrow_back", "arrow_back")}
                      </span>
                      <span>
                        {t("toggle_to_login_from_reset", "Back to Login")}
                      </span>
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
                        "Verify your session using Windows Hello, Touch ID, 1Password, Bitwarden, or a hardware security key.",
                      )}
                    </p>
                    <ActionButton
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handlePasskeyMfaAuth()}
                      variant="glass"
                      icon={t("icon_passkey", "passkey")}
                      label={t(
                        "btn_verify_with_passkey",
                        "Authenticate with Passkey",
                      )}
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
                        {t(
                          "network_access_guidelines_header",
                          "Network & Privacy Guidelines",
                        )}
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
                            "Your personal folders and machine paths are scrubbed locally before any diagnostic log leaves your device.",
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
                            "Only your chosen handle is visible on community blueprints, comments, and reports.",
                          )}
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

      <CommunitySupportSidePanel
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        panelClass="sa-malware-lockdown-panel"
        backdropZ="z-[60002]"
        panelZ="z-[60003]"
        onSuccess={() => {
          setIsSupportOpen(false);
          runClearanceCheck();
        }}
      />
    </>
  );
}
