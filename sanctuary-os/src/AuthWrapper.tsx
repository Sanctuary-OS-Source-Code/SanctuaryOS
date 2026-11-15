import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isStandaloneFork } from "./supabase";
import { parseSpokeRelinkToken } from "./utils/stagingCrypto";
import { useLexicon, CORE_GLOSSARY_TERMS } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import { DynamicThemePreviewBanner } from "./chameleon-components/ThemeCard";
import { getLuminance } from "./chameleon-components/ChameleonShared";
import { useStore } from "./store";
import {
  authenticateFidoPasskey,
  clearDevSessionOnVite,
  clearPasskeySessionVerified,
  deriveBlindedEmailAlias,
  deriveZeroKnowledgePassword,
  fetchMfaSecurityState,
  generateSovereignRecoveryKey,
  getCitizenSecurityPolicy,
  initDevPasskeyBridge,
  isLocalhostBrowser,
  isNativeLocalPasskeySupported,
  markPasskeySessionVerified,
  maskEmailAddress,
  registerFidoPasskey,
  resetPasswordFromVerifiedSession,
  restoreDevSessionFromVite,
  sanitizeFactorFriendlyName,
  signInWithZeroKnowledgeFallback,
  syncDevSessionToVite,
} from "./utils/passkeyUtils";
import {
  checkDesktopHardwareBan,
  classifyAuthStatusMessage,
  enforceLoginClearanceAndBanCheck,
  prepareMfaChallengeData,
  sendPasswordResetWithBlindGuard,
  verifyPasskeyMfaAndFetchSession,
  verifyTotpMfaAndFetchSession,
} from "./utils/authHelpers";
import { CompanionPasskeyHandshakeRequester } from "./components/ElevatedPasskeyGate";
import { SidePanelPillToggle } from "./components/universal/UniversalLayout";
import { isDesktop } from "./utils/envUtils";
import type { CitizenOnboardingDrawerTab } from "./side-panels/CitizenOnboardingCovenantsSidePanel";
import {
  ActionButton,
  DashboardStatTile,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
} from "./shared";

const CitizenOnboardingCovenantsSidePanel = React.lazy(
  () => import("./side-panels/CitizenOnboardingCovenantsSidePanel")
);

export function openSanctuaryLogin() {
  if (typeof window !== "undefined") {
    localStorage.setItem("sanctuary_show_login", "true");
    localStorage.removeItem("sanctuary_login_bypassed");
    window.dispatchEvent(new CustomEvent("sanctuary-open-login"));
  }
}

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const {
    t,
    osLogoUrl,
    activeLang,
    setActiveLang,
    registry,
    lexiconMeta,
    useGlobalLexicon,
    setUseGlobalLexicon,
    setGlobalLexiconId,
    activeSpaceKey: activeLexSpaceKey,
  } = useLexicon();
  const {
    currentTheme,
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    customThemes,
    gameThemes,
    useGlobalTheme,
    setUseGlobalTheme,
    setGlobalThemeId,
    activeSpaceKey: activeThemeSpaceKey,
  } = useTheme();
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [generatedKeyPreview, setGeneratedKeyPreview] = useState("");
  const [username, setUsername] = useState("");
  const [spokeRelinkToken, setSpokeRelinkToken] = useState("");
  const [blindSignupEmail, setBlindSignupEmail] = useState(true);
  const [blindSignupPreview, setBlindSignupPreview] = useState("");
  const [recoveryMode, setRecoveryMode] = useState<"passkey" | "sovereign" | "email">("sovereign");
  const [sovereignRecoveryInput, setSovereignRecoveryInput] = useState("");
  const [signupStep, setSignupStep] = useState<
    "personalize" | "welcome" | "credentials" | "security"
  >("personalize");
  const [signupStyleConfirmed, setSignupStyleConfirmed] = useState(false);
  const [signupLegalAccepted, setSignupLegalAccepted] = useState(false);
  const [signupAgeConfirmed, setSignupAgeConfirmed] = useState(false);
  const [reviewedUserDocs, setReviewedUserDocs] = useState<
    Record<"Terms" | "Privacy" | "EULA" | "ComplianceProtocol", boolean>
  >({
    Terms: false,
    Privacy: false,
    EULA: false,
    ComplianceProtocol: false,
  });
  const [activeOnboardingDrawerTab, setActiveOnboardingDrawerTab] =
    useState<CitizenOnboardingDrawerTab | null>(null);
  const [signupLaunchTarget, setSignupLaunchTarget] = useState<
    "workspaces" | "guide" | "download"
  >("workspaces");
  const [pendingSignupSession, setPendingSignupSession] = useState<any>(null);
  const [signupPasskeyName, setSignupPasskeyName] = useState("");
  const [signupPasskeyEnrolled, setSignupPasskeyEnrolled] = useState(false);
  const [signupCopiedKit, setSignupCopiedKit] = useState(false);
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHwidBanned, setIsHwidBanned] = useState(false);
  const [sandboxAccepted, setSandboxAccepted] = useState(false);
  const isAwaitingMfaRef = React.useRef(false);

  const rawOnboardingSpace = String(
    activeThemeSpaceKey || activeLexSpaceKey || "default_workspace"
  )
    .trim()
    .toLowerCase();
  const isHubOnboardingSpace =
    !rawOnboardingSpace ||
    rawOnboardingSpace === "default_workspace" ||
    rawOnboardingSpace === "default" ||
    rawOnboardingSpace === "web";

  const cleanLexLabel = (val: string) =>
    val.includes(":") ? val.split(":")[1].trim() : val;

  const onboardingLexiconOptions = useMemo(() => {
    const sampleKeys = [
      "term_mods",
      "term_vault",
      "term_blueprints",
      "term_masons",
      "term_lab",
    ];
    const buildGlossarySample = (code: string) =>
      sampleKeys
        .map((termKey) => {
          const def = CORE_GLOSSARY_TERMS.find((item) => item.key === termKey);
          if (!def) return "";
          if (code === "en-default") return def.defaults["en-default"];
          if (code === "en-sanctuary") return def.defaults["en-sanctuary"];
          const customVal = registry?.[code]?.[termKey];
          return typeof customVal === "string" && customVal.trim()
            ? customVal.trim()
            : def.defaults["en-default"];
        })
        .filter(Boolean)
        .join(" • ");

    const items: Array<{
      id: string;
      name: string;
      badge: string;
      desc: string;
      icon: string;
      sample: string;
    }> = [
      {
        id: "en-default",
        name: cleanLexLabel(t("lang_standard", "Standard English")),
        badge: t("auth_lex_standard_badge", "Everyday Terms"),
        desc: t(
          "auth_lex_standard_desc",
          "Clear everyday software terms across the entire interface."
        ),
        icon: t("icon_menu_book", "menu_book"),
        sample: buildGlossarySample("en-default"),
      },
      {
        id: "en-sanctuary",
        name: cleanLexLabel(t("lang_sanctuary", "Sanctuary")),
        badge: t("auth_lex_sanctuary_badge", "Sci-Fi Lore"),
        desc: t(
          "auth_lex_sanctuary_desc",
          "Signature sci-fi lore and immersive Sanctuary terminology."
        ),
        icon: t("icon_auto_awesome", "auto_awesome"),
        sample: buildGlossarySample("en-sanctuary"),
      },
    ];

    const seenIds = new Set(items.map((item) => item.id));
    const spokeMetaIds = new Set(
      (Array.isArray(lexiconMeta) ? lexiconMeta : [])
        .map((m: any) => m?.id)
        .filter(Boolean)
    );

    if (!isHubOnboardingSpace && Array.isArray(lexiconMeta)) {
      for (const m of lexiconMeta) {
        if (!m?.id || seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        items.push({
          id: m.id,
          name: cleanLexLabel(String(m.name || m.id)),
          badge: m.badge || t("badge_community", "Community"),
          desc: t(
            "auth_lex_community_desc",
            "Community {Lexicon} pack configured for this workspace."
          ),
          icon: t("icon_translate", "translate"),
          sample: buildGlossarySample(m.id),
        });
      }
    }

    if (registry && typeof registry === "object") {
      for (const [id, dict] of Object.entries(registry)) {
        if (!id || seenIds.has(id)) continue;
        if (isHubOnboardingSpace && spokeMetaIds.has(id)) continue;
        seenIds.add(id);
        const metaName = (dict as any)?._meta_name || id;
        const metaBadge =
          (dict as any)?._meta_badge || t("badge_custom", "Custom");
        items.push({
          id,
          name: cleanLexLabel(String(metaName)),
          badge: String(metaBadge),
          desc: t(
            "auth_lex_community_desc",
            "Community {Lexicon} pack configured for this workspace."
          ),
          icon: t("icon_translate", "translate"),
          sample: buildGlossarySample(id),
        });
      }
    }

    return items;
  }, [t, isHubOnboardingSpace, lexiconMeta, registry]);

  const onboardingThemeOptions = useMemo(() => {
    const merged: Record<string, any> = {
      ...(CORE_THEMES || {}),
      ...(isHubOnboardingSpace ? {} : gameThemes || {}),
      ...(customThemes || {}),
    };
    return Object.entries(merged)
      .filter(
        ([, th]) =>
          Boolean(th) &&
          !String(th?.name || "")
            .toLowerCase()
            .includes("performance")
      )
      .map(([id, th]) => {
        const safeBg =
          th?.bg && th.bg !== "transparent" ? th.bg : "#060b14";
        return {
          id,
          data: th,
          name: th?.name || id,
          isDark: getLuminance(safeBg) < 0.5,
          swatches: [
            safeBg,
            th?.sidebar || "#050914",
            th?.accent || "#38bdf8",
            th?.success || "#10b981",
          ],
        };
      });
  }, [CORE_THEMES, gameThemes, customThemes, isHubOnboardingSpace]);

  const activeLexiconDisplayName = useMemo(() => {
    const matched = onboardingLexiconOptions.find(
      (opt) => opt.id === activeLang
    );
    return (
      matched?.name || cleanLexLabel(t("lang_sanctuary", "Sanctuary"))
    );
  }, [onboardingLexiconOptions, activeLang, t]);

  const currentThemeIsDark =
    getLuminance(
      currentTheme?.bg && currentTheme.bg !== "transparent"
        ? currentTheme.bg
        : "#060b14"
    ) < 0.5;

  const handleGenerateSovereignPassword = (target: "recovery" | "signup" = "recovery") => {
    const generated = generateSovereignRecoveryKey();
    setGeneratedKeyPreview(generated);
    if (target === "signup") {
      setPassword(generated);
      setConfirmPassword(generated);
    } else {
      setRecoveryNewPassword(generated);
      setRecoveryConfirmPassword(generated);
    }
    try {
      navigator.clipboard.writeText(generated);
    } catch { }
    useStore.getState().pushStatus(
      t(
        "auth_sovereign_key_generated_toast",
        "256-bit Sovereign Key generated and copied to clipboard! Click Update to save."
      ),
      "success"
    );
  };

  useEffect(() => {
    let cancelled = false;
    if (!isLogin && blindSignupEmail && email.trim()) {
      deriveBlindedEmailAlias(email).then((alias) => {
        if (!cancelled) setBlindSignupPreview(alias);
      });
    } else {
      setBlindSignupPreview("");
    }
    return () => {
      cancelled = true;
    };
  }, [email, blindSignupEmail, isLogin]);

  const [showLoginUI, setShowLoginUI] = useState(
    () => localStorage.getItem("sanctuary_show_login") === "true"
  );
  const [isDevGateLocked, setIsDevGateLocked] = useState(
    () => typeof window !== "undefined" && Boolean((window as any).__sanctuaryDevGateLocked)
  );

  useEffect(() => {
    const handleDevGateLockChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setIsDevGateLocked(Boolean(detail?.locked));
    };
    window.addEventListener("sanctuary-dev-gate-lock-changed", handleDevGateLockChanged);
    return () =>
      window.removeEventListener("sanctuary-dev-gate-lock-changed", handleDevGateLockChanged);
  }, []);

  const prepareMfaChallengeFromState = async (
    strictPasskeyOnly = false
  ): Promise<boolean> => {
    const prepared = await prepareMfaChallengeData(strictPasskeyOnly);
    if (!prepared.hasAny) {
      return false;
    }

    setMfaPasskeys(prepared.passkeys);
    setMfaTotpFactors(prepared.totpFactors);
    setSelectedPasskeyId(prepared.defaultPasskeyId);
    setMfaMode(prepared.defaultMode);
    if (prepared.defaultTotpFactorId) {
      setMfaFactorId(prepared.defaultTotpFactorId);
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
    initDevPasskeyBridge();

    const handleSessionUpdate = async (newSession: any, isInitialBoot = false) => {
      if (newSession) {
        if (isLocalhostBrowser()) {
          markPasskeySessionVerified(newSession.user?.id);
        }
        syncDevSessionToVite(newSession).catch(() => { });
        // Keep the account signed in across restarts; FIDO2 Passkey verification
        // is enforced per-session when entering Elevated Hubs (ElevatedPasskeyGate)
        // or modifying security credentials (CoreTab).
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
          const { isBanned } = await checkDesktopHardwareBan(5000);
          if (isBanned) {
            setIsHwidBanned(true);
            localStorage.setItem("sanctuary_blacklisted", "true");
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
            } catch (e) { }
          }
        }

        if (!isOfflineMode) {
          if (localStorage.getItem("sanctuary_mfa_pending") === "true") {
            localStorage.removeItem("sanctuary_mfa_pending");
            localStorage.setItem("sanctuary_show_login", "true");
            localStorage.removeItem("sanctuary_login_bypassed");
            await supabase.auth.signOut().catch(() => { });
          }
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000)
          );
          let {
            data: { session: fetchedSession },
          } = (await Promise.race([sessionPromise, timeoutPromise])) as any;
          if (
            !fetchedSession &&
            isLocalhostBrowser() &&
            (typeof sessionStorage === "undefined" ||
              sessionStorage.getItem("sanctuary_dev_signed_out") !== "true")
          ) {
            fetchedSession = await restoreDevSessionFromVite();
          }
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
        isAwaitingMfaRef.current = false;
        clearPasskeySessionVerified();
        clearDevSessionOnVite().catch(() => { });
      }
      if (event === "PASSWORD_RECOVERY") {
        isAwaitingMfaRef.current = false;
        setIsPasswordRecovery(true);
        setShowLoginUI(true);
        setStatus("");
      }
      if (isAwaitingMfaRef.current && newSession) {
        return;
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
      const { error } = await resetPasswordFromVerifiedSession(recoveryNewPassword);
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

  const handlePasskeyPasswordRecovery = async () => {
    setIsProcessing(true);
    setStatus(
      t(
        "passkey_status_challenging",
        "Waiting for security key or biometric verification..."
      )
    );
    try {
      const { error } = await authenticateFidoPasskey();
      if (error) throw error;
      setStatus("");
      setIsResetPassword(false);
      setIsPasswordRecovery(true);
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSovereignKeyRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !sovereignRecoveryInput.trim()) {
      setStatus(t("err_missing", "Please fill in all fields."));
      return;
    }
    setIsProcessing(true);
    setStatus(t("status_authenticating", "Authenticating..."));
    try {
      const { data, error } = await signInWithZeroKnowledgeFallback(
        email.trim(),
        sovereignRecoveryInput.trim()
      );
      if (error) throw error;
      if (data?.user) {
        setStatus("");
        setSovereignRecoveryInput("");
        setIsResetPassword(false);
        setIsPasswordRecovery(true);
      }
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignupEnrollPasskey = async () => {
    if (!password) return;
    setIsProcessing(true);
    setStatus(
      t(
        "passkey_status_challenging",
        "Waiting for security key or biometric verification..."
      )
    );
    try {
      const label =
        signupPasskeyName.trim() ||
        t("passkey_unnamed_device", "FIDO2 Passkey");
      const { error } = await registerFidoPasskey(label, {
        currentPassword: password,
      });
      if (error) throw error;
      setSignupPasskeyEnrolled(true);
      const okMsg = t(
        "auth_signup_passkey_bound_toast",
        "FIDO2 Passkey bound to your new Sanctuary identity!"
      );
      setStatus(okMsg);
      useStore.getState().pushStatus(okMsg, "success");
    } catch (err: any) {
      setStatus(`${t("err_validation", "Error: ")}${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyRecoveryKit = () => {
    const kitLines = [
      `=== ${t("sidebar_app_title", "Sanctuary OS")} • ${t("auth_signup_recovery_kit_title", "Emergency Recovery Kit")} ===`,
      `${t("auth_label_username", "Username")}: ${username.trim()}`,
      `${t("auth_label_email", "Email Address")}: ${email.trim()}`,
      ...(blindSignupEmail && blindSignupPreview
        ? [`${t("auth_blind_email_active_badge", "Blinded Email Alias")}: ${blindSignupPreview}`]
        : []),
      `${t("auth_login_password_or_key_label", "Passcode or 256-Bit Sovereign Key")}: ${generatedKeyPreview || password}`,
    ];
    try {
      navigator.clipboard.writeText(kitLines.join("\n"));
      setSignupCopiedKit(true);
      useStore
        .getState()
        .pushStatus(
          t("auto_copied_to_clipboard_45", "Copied to clipboard!"),
          "success"
        );
    } catch { }
  };

  const handleCompleteSignupOnboarding = () => {
    if (blindSignupEmail && !signupPasskeyEnrolled) {
      setStatus(
        t(
          "auth_signup_zero_pii_passkey_gate_err",
          "Blinded Email Alias requires binding at least one FIDO2 Passkey before entering Sanctuary OS so you can always recover your account."
        )
      );
      return;
    }
    const chosenTarget = signupLaunchTarget;
    const sess = pendingSignupSession;
    setPendingSignupSession(null);
    setSignupStep("personalize");
    setSignupStyleConfirmed(false);
    setSignupLegalAccepted(false);
    setSignupAgeConfirmed(false);
    setReviewedUserDocs({
      Terms: false,
      Privacy: false,
      EULA: false,
      ComplianceProtocol: false,
    });
    setSignupLaunchTarget("workspaces");
    setSignupPasskeyName("");
    setSignupPasskeyEnrolled(false);
    setSignupCopiedKit(false);
    setPassword("");
    setConfirmPassword("");
    setGeneratedKeyPreview("");
    if (sess) {
      completeAuthenticatedTransition(sess);
    }
    if (chosenTarget === "guide") {
      setActiveOnboardingDrawerTab("intro");
    } else if (chosenTarget === "download" && !isDesktop()) {
      useStore.getState().setView("landing");
      if (typeof window !== "undefined") {
        window.location.hash = "download";
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("sanctuary-landing-tab", { detail: "download" })
          );
        }, 60);
      }
    }
  };

  const finalizeLogin = async (user: any) => {
    await enforceLoginClearanceAndBanCheck(user, t, setIsHwidBanned);
  };

  const completeAuthenticatedTransition = (newSession: any) => {
    isAwaitingMfaRef.current = false;
    localStorage.removeItem("sanctuary_mfa_pending");
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
      const { user, session: verifiedSession } =
        await verifyPasskeyMfaAndFetchSession(targetFactorId);
      setStatus(t("status_authenticating", "Authenticating..."));
      if (user) {
        await finalizeLogin(user);
        if (verifiedSession) {
          completeAuthenticatedTransition(verifiedSession);
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
      const { user, session: verifiedSession } =
        await verifyTotpMfaAndFetchSession(mfaFactorId, mfaCode, () =>
          setStatus(t("auth_mfa_verifying_code", "Verifying authenticator code..."))
        );

      setStatus(t("status_authenticating", "Authenticating..."));
      if (user) {
        await finalizeLogin(user);
        if (verifiedSession) {
          completeAuthenticatedTransition(verifiedSession);
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
      if (recoveryMode === "sovereign") {
        await handleSovereignKeyRecovery(e);
        return;
      }
      if (recoveryMode === "passkey") {
        await handlePasskeyPasswordRecovery();
        return;
      }
      if (!email) {
        setStatus(t("err_missing", "Please fill in all fields."));
        return;
      }
      setIsProcessing(true);
      setStatus(t("status_authenticating", "Authenticating..."));
      try {
        const res = await sendPasswordResetWithBlindGuard(
          email,
          t,
          "This account uses a Blinded Email Alias, so no plaintext email is stored on the server to send a reset link. Use FIDO2 Passkey Recovery above or sign in with your 256-Bit Sovereign Recovery Key."
        );
        setStatus(res.message);
      } catch (err: any) {
        setStatus(`${t("err_validation", "Error: ")}${err.message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!isLogin && (!signupLegalAccepted || !signupAgeConfirmed)) {
      setStatus(
        t(
          "auth_err_legal_age_required",
          "Please review and accept the User Legal Covenants and 13+ age confirmation before creating an account."
        )
      );
      setSignupStep("welcome");
      return;
    }

    if (!email || !password || (!isLogin && (!username || !confirmPassword))) {
      setStatus(t("err_missing", "Please fill in all fields."));
      return;
    }

    if (!isLogin) {
      if (password.length < 8) {
        setStatus(
          t("auth_recovery_min_length_err", "Password must be at least 8 characters long.")
        );
        return;
      }
      if (password !== confirmPassword) {
        setStatus(t("auth_recovery_mismatch_err", "Passwords do not match."));
        return;
      }
      if (isStandaloneFork && spokeRelinkToken.trim() && !parseSpokeRelinkToken(spokeRelinkToken)) {
        setStatus(
          t(
            "auth_relink_token_invalid",
            "Invalid Spoke Relink Token format. Expected SRK1.<uuid>.<secret>."
          )
        );
        return;
      }
    }

    setIsProcessing(true);
    setStatus(t("status_authenticating", "Authenticating..."));

    try {
      if (isLogin) {
        clearPasskeySessionVerified();
        isAwaitingMfaRef.current = !isLocalhostBrowser();
        if (!isLocalhostBrowser()) {
          localStorage.setItem("sanctuary_mfa_pending", "true");
        }
        const { data, error } = await signInWithZeroKnowledgeFallback(email, password);
        if (error) {
          isAwaitingMfaRef.current = false;
          localStorage.removeItem("sanctuary_mfa_pending");
          throw error;
        }

        if (data?.user) {
          if (isLocalhostBrowser()) {
            isAwaitingMfaRef.current = false;
            markPasskeySessionVerified(data.user.id);
            if (data.session) {
              syncDevSessionToVite(data.session).catch(() => { });
            }
          } else {
            const mfaState = await fetchMfaSecurityState();
            const hasAnyFactor = mfaState.hasPasskey || mfaState.hasTotp;
            const citizenPolicy = getCitizenSecurityPolicy(
              data.session,
              hasAnyFactor,
              mfaState.hasPasskey
            );
            // Whenever an account has a Passkey or 2FA enrolled, step up directly in
            // the Login UX flow so the session is verified right away.
            if (hasAnyFactor) {
              if (await prepareMfaChallengeFromState(citizenPolicy.strictPasskeyOnly)) {
                setIsProcessing(false);
                setStatus("");
                return;
              }
            }
          }
          await finalizeLogin(data.user);
          if (data.session) {
            completeAuthenticatedTransition(data.session);
          }
        } else {
          isAwaitingMfaRef.current = false;
        }
      } else {
        isAwaitingMfaRef.current = true;
        const signupEmail = blindSignupEmail
          ? await deriveBlindedEmailAlias(email)
          : email.trim();
        const zkSignupPassword = await deriveZeroKnowledgePassword(password);
        const { data, error } = await supabase.auth.signUp({
          email: signupEmail,
          password: zkSignupPassword,
          options: {
            data: {
              username,
              zk_password_v2: true,
              zk_password_v1: true,
              email_blinded_v2: blindSignupEmail,
              email_blinded_v1: blindSignupEmail,
              email_blinded: blindSignupEmail,
              legal_accepted_at: new Date().toISOString(),
              legal_covenants_version: "V6.2",
              accepted_covenants: [
                "Terms",
                "Privacy",
                "EULA",
                "ComplianceProtocol",
              ],
              age_eligibility_confirmed: true,
              ...(isStandaloneFork && spokeRelinkToken.trim()
                ? { relink_token: spokeRelinkToken.trim() }
                : {}),
            },
          },
        });
        if (error) {
          isAwaitingMfaRef.current = false;
          throw error;
        }
        if (data?.session) {
          setPendingSignupSession(data.session);
          setSignupStep("security");
          setStatus("");
        } else {
          isAwaitingMfaRef.current = false;
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
          onClose={() => { }}
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
    !isDevGateLocked &&
    (isPasswordRecovery ||
      showMfaChallenge ||
      Boolean(pendingSignupSession) ||
      (!session && showLoginUI && isOnline));

  const { isError: isStatusError, isSuccess: isStatusSuccess } =
    classifyAuthStatusMessage(status);

  const panelTitle = isPasswordRecovery
    ? t("auth_recovery_title", "Set New Password")
    : showMfaChallenge
      ? t("auth_mfa_required_title", "Two-Factor Verification")
      : isResetPassword
        ? t("auth_panel_reset_title", "Reset Password")
        : isLogin
          ? t("auth_tile_signin_val", "Sign In")
          : signupStep === "security"
            ? t("auth_signup_step2_title", "Lock Down Your Account")
            : t("auth_panel_signup_title", "Create Account");

  const panelSubtitle = isPasswordRecovery
    ? t(
      "auth_recovery_subtitle",
      "Enter and confirm a new password to complete your account recovery."
    )
    : !isLogin && !isResetPassword && !showMfaChallenge
      ? signupStep === "security"
        ? t("auth_signup_step4_subtitle", "Step 4 of 4 • Passkey & Quick Start")
        : signupStep === "credentials"
          ? t("auth_signup_step3_cred_subtitle", "Step 3 of 4 • Account Credentials")
          : signupStep === "welcome"
            ? t(
              "auth_signup_step2_welcome_subtitle",
              "Step 2 of 4 • Orientation & Legal Covenants"
            )
            : t(
              "auth_signup_step1_personalize_subtitle",
              "Step 1 of 4 • {Chameleon} & {Lexicon}"
            )
      : t("subtitle", "Secure Network Access");

  const panelIcon = isPasswordRecovery
    ? t("icon_lock_reset", "lock_reset")
    : showMfaChallenge
      ? t("icon_passkey", "passkey")
      : isResetPassword
        ? t("icon_vpn_key", "vpn_key")
        : isLogin
          ? t("icon_key", "key")
          : signupStep === "security"
            ? t("icon_shield_lock", "shield_lock")
            : signupStep === "personalize"
              ? t("icon_palette", "palette")
              : t("icon_person_add", "person_add");

  return (
    <>
      {children}

      <SidePanel
        isOpen={isLoginPanelOpen}
        hideCloseButton={
          !isLogin &&
          !isResetPassword &&
          signupStep === "security" &&
          blindSignupEmail &&
          !signupPasskeyEnrolled
        }
        onClose={() => {
          if (isPasswordRecovery) {
            setIsPasswordRecovery(false);
            setRecoveryNewPassword("");
            setRecoveryConfirmPassword("");
            setGeneratedKeyPreview("");
            if (typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } else if (showMfaChallenge) {
            isAwaitingMfaRef.current = false;
            localStorage.removeItem("sanctuary_mfa_pending");
            setShowMfaChallenge(false);
            supabase.auth.signOut();
          } else if (!isLogin && signupStep === "security" && pendingSignupSession) {
            handleCompleteSignupOnboarding();
          } else {
            handleDismissLogin();
          }
        }}
        widthClass="w-[94vw] md:w-[680px]"
        title={panelTitle}
        subtitle={panelSubtitle}
        icon={panelIcon}
        iconColorClass="theme-text-accent"
        headerActions={
          showMfaChallenge ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_arrow_back", "arrow_back")}
                tooltip={t("toggle_to_login_from_reset", "Back to Login")}
                onClick={() => {
                  isAwaitingMfaRef.current = false;
                  localStorage.removeItem("sanctuary_mfa_pending");
                  setShowMfaChallenge(false);
                  setStatus("");
                  supabase.auth.signOut();
                }}
              />
            </PanelHeaderGroup>
          ) : !isPasswordRecovery && signupStep !== "security" ? (
            <PanelHeaderGroup>
              {isResetPassword && (
                <PanelHeaderButton
                  icon={t("icon_arrow_back", "arrow_back")}
                  tooltip={t("toggle_to_login_from_reset", "Back to Login")}
                  onClick={() => {
                    setIsResetPassword(false);
                    setIsLogin(true);
                    setStatus("");
                  }}
                />
              )}
              {!isLogin && !isResetPassword && signupStep !== "personalize" && (
                <PanelHeaderButton
                  icon={t("icon_palette", "palette")}
                  tooltip={t(
                    "auth_personalize_header_tooltip",
                    "{Chameleon} & {Lexicon} Setup"
                  )}
                  onClick={() => {
                    setSignupStep("personalize");
                    setStatus("");
                  }}
                />
              )}
              {!isLogin && !isResetPassword && (
                <PanelHeaderButton
                  icon={t("icon_explore", "explore")}
                  tooltip={t(
                    "auth_tour_drawer_title",
                    "Sanctuary OS Tour & {Citizen} Guide"
                  )}
                  onClick={() => setActiveOnboardingDrawerTab("intro")}
                />
              )}
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
          {/* Top Hero Card */}
          <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5 shrink-0">
            <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 p-1.5">
              <img
                src={osLogoUrl || "/icon.png"}
                alt={t("sidebar_app_title", "Sanctuary OS")}
                className="w-full h-full object-contain drop-shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                  {t("sidebar_app_title", "Sanctuary OS")}
                </span>
                {!isLogin && !isResetPassword && !showMfaChallenge && !isPasswordRecovery ? (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                      {t("icon_verified_user", "verified_user")}
                    </span>
                    <span>
                      {`${t("step", "Step")} ${
                        signupStep === "security"
                          ? "4"
                          : signupStep === "credentials"
                            ? "3"
                            : signupStep === "welcome"
                              ? "2"
                              : "1"
                      } / 4`}
                    </span>
                  </span>
                ) : (
                  <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--success)]">
                      {t("icon_shield_lock", "shield_lock")}
                    </span>
                    <span>
                      {t("auth_hero_security_badge", "Blinded Email • 600k PBKDF2 • FIDO2")}
                    </span>
                  </span>
                )}
              </div>
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
                        "Select your recovery method below: FIDO2 Passkey, 256-Bit Sovereign Recovery Key, or Standard Email Link."
                      )
                      : isLogin
                        ? t(
                          "auth_panel_signin_desc",
                          "Sign in with a FIDO2 Passkey or your account credentials to sync cloud {blueprints}, diagnostic reports, and supporter perks."
                        )
                        : signupStep === "security"
                          ? t(
                            "auth_signup_step2_hero_desc",
                            "Your Sanctuary identity is active! Before entering the OS, bind a FIDO2 Passkey for 1-click sign-in and save your Emergency Recovery Kit."
                          )
                          : signupStep === "credentials"
                            ? t(
                              "network_access_guidelines_desc",
                              "Zero-PII identity protection and encrypted cloud sync across all Sanctuary workspaces."
                            )
                            : signupStep === "welcome"
                              ? t(
                                "auth_signup_step1_hero_desc",
                                "Welcome to Sanctuary OS! Explore our local-first architecture and accept the User Legal Covenants & 13+ eligibility requirements to begin."
                              )
                              : t(
                                "auth_signup_personalize_hero_desc",
                                "Set your mood first! Choose everyday Standard English or Sanctuary's sci-fi terminology and pick a visual {Chameleon} before reviewing OS covenants and creating your account."
                              )}
              </p>
            </div>
          </div>

          {/* Primary Mode Switcher Tiles (Sign In vs Create Account) */}
          {!isPasswordRecovery && !showMfaChallenge && signupStep !== "security" && (
            <SidePanelFilterBar className="sm:grid-cols-2 gap-3 shrink-0">
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
                  setSignupStep("personalize");
                  setGeneratedKeyPreview("");
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
                  setSignupStep(
                    signupLegalAccepted && signupAgeConfirmed
                      ? "credentials"
                      : signupStyleConfirmed
                        ? "welcome"
                        : "personalize"
                  );
                  setGeneratedKeyPreview("");
                  setStatus("");
                }}
              />
            </SidePanelFilterBar>
          )}

          {/* Status / Error Feedback Banner */}
          {status && (
            <div
              className={`px-4 py-3 rounded-2xl bg-transparent border text-xs font-bold leading-relaxed flex items-start gap-2.5 shrink-0 ${isStatusError
                ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                : isStatusSuccess
                  ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                  : "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]"
                }`}
            >
              <span
                className={`material-symbols-outlined !text-[17px] shrink-0 mt-0.5 ${isProcessing ? "animate-spin" : ""
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
              className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
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

                <ActionButton
                  type="button"
                  variant="glass"
                  icon={t("icon_vpn_key", "vpn_key")}
                  label={t(
                    "auth_sovereign_key_btn_generate",
                    "Generate 256-Bit Key & Copy"
                  )}
                  onClick={() => handleGenerateSovereignPassword("recovery")}
                  className="!px-3.5 !py-2 !text-[10px] shrink-0"
                />
              </div>

              <div className="p-4 flex flex-col gap-4">
                {generatedKeyPreview && (
                  <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                        {t("auth_sovereign_key_title", "256-Bit Sovereign Recovery Key")}
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--text)] truncate select-all">
                        {generatedKeyPreview}
                      </span>
                    </div>
                    <ActionButton
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedKeyPreview);
                        useStore
                          .getState()
                          .pushStatus(
                            t("auto_copied_to_clipboard_45", "Copied to clipboard!"),
                            "success"
                          );
                      }}
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      label={t("btn_copy_key", "Copy Key")}
                      className="!px-3 !py-1.5 !text-[10px] shrink-0"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        onChange={(e) => {
                          setRecoveryNewPassword(e.target.value);
                          if (
                            generatedKeyPreview &&
                            e.target.value !== generatedKeyPreview
                          ) {
                            setGeneratedKeyPreview("");
                          }
                        }}
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <ActionButton
                    type="button"
                    onClick={() => {
                      setIsPasswordRecovery(false);
                      setRecoveryNewPassword("");
                      setRecoveryConfirmPassword("");
                      setGeneratedKeyPreview("");
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
                <SidePanelFilterBar className="sm:grid-cols-2 gap-3 shrink-0">
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
                </SidePanelFilterBar>
              )}

              {mfaMode === "passkey" && mfaPasskeys.length > 0 ? (
                <div className="flex flex-col gap-3.5 shrink-0">
                  <form
                    onSubmit={handlePasskeyMfaAuth}
                    className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
                    noValidate
                  >
                    <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_passkey", "passkey")}
                          </span>
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                          {t("auth_mfa_passkey_required_title", "Passkey Verification Required")}
                        </span>
                      </div>
                      <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {t("icon_verified_user", "verified_user")}
                        </span>
                        <span>{t("auth_passkey_badge_fido", "FIDO2 Passkey")}</span>
                      </span>
                    </div>

                    <div className="p-4 flex flex-col gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t("auth_mfa_select_passkey_label", "Select Enrolled Passkey")}
                        </label>
                        <div
                          className={`grid grid-cols-1 ${mfaPasskeys.length > 1 ? "sm:grid-cols-2" : ""
                            } gap-2.5`}
                        >
                          {mfaPasskeys.map((pk) => {
                            const isSelected =
                              (selectedPasskeyId || mfaPasskeys[0]?.id) === pk.id;
                            return (
                              <button
                                key={pk.id}
                                type="button"
                                onClick={() => setSelectedPasskeyId(pk.id)}
                                className={`glass-surface rounded-xl p-3 flex items-center justify-between gap-2.5 text-left border transition-all cursor-pointer ${isSelected
                                  ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                  }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 ${isSelected
                                      ? "text-[var(--accent)]"
                                      : "text-[var(--subtext)]"
                                      }`}
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">
                                      {t("icon_passkey", "passkey")}
                                    </span>
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black text-[var(--text)] truncate">
                                      {sanitizeFactorFriendlyName(
                                        pk.friendly_name,
                                        t("passkey_unnamed_device", "FIDO2 Passkey")
                                      )}
                                    </span>
                                    {pk.created_at && (
                                      <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80 truncate">
                                        {`${t("auth_2fa_enrolled_date", "Enrolled:")} ${new Date(
                                          pk.created_at
                                        ).toLocaleDateString()}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`material-symbols-outlined !text-[16px] shrink-0 ${isSelected
                                    ? "text-[var(--accent)]"
                                    : "text-[var(--subtext)] opacity-40"
                                    }`}
                                >
                                  {isSelected
                                    ? t("icon_check_circle", "check_circle")
                                    : t(
                                      "icon_radio_button_unchecked",
                                      "radio_button_unchecked"
                                    )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <ActionButton
                          type="button"
                          onClick={() => {
                            isAwaitingMfaRef.current = false;
                            localStorage.removeItem("sanctuary_mfa_pending");
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
                          label={t("btn_verify_with_passkey", "Authenticate with Passkey")}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </form>

                  <CompanionPasskeyHandshakeRequester
                    targetScope={t("auth_tile_signin_val", "Sign In")}
                    autoStart={!isNativeLocalPasskeySupported()}
                    onVerified={async () => {
                      const { data: userData } = await supabase.auth.getUser();
                      if (userData?.user) {
                        await finalizeLogin(userData.user);
                        const { data: sessionData } = await supabase.auth.getSession();
                        if (sessionData.session) {
                          completeAuthenticatedTransition(sessionData.session);
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <form
                  onSubmit={handleMfaAuth}
                  className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
                  noValidate
                >
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_qr_code_scanner", "qr_code_scanner")}
                        </span>
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                        {t("auth_mfa_code_label", "6-Digit Authenticator Code")}
                      </span>
                    </div>
                    <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                      <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                        {t("icon_qr_code_scanner", "qr_code_scanner")}
                      </span>
                      <span>{t("auth_passkey_badge_totp", "Authenticator App")}</span>
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-3.5">
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_mfa_totp_prompt_desc",
                        "Open your authenticator app (Google Authenticator, Authy, 1Password, or Bitwarden) and enter the 6-digit verification code for your account."
                      )}
                    </p>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_mfa_code_label", "6-Digit Authenticator Code")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[18px]">
                          {t("icon_pin", "pin")}
                        </span>
                        <input
                          type="text"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value)}
                          autoComplete="one-time-code"
                          spellCheck="false"
                          maxLength={6}
                          placeholder={t("auth_2fa_placeholder_code", "000000")}
                          className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-base font-mono font-black tracking-[0.35em] text-center text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <ActionButton
                        type="button"
                        onClick={() => {
                          isAwaitingMfaRef.current = false;
                          localStorage.removeItem("sanctuary_mfa_pending");
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
                        label={t("btn_verify_2fa", "Verify")}
                        className="w-full"
                      />
                    </div>
                  </div>
                </form>
              )}
            </>
          ) : !isLogin && !isResetPassword && signupStep === "security" ? (
            /* STEP 2 OF 2: POST-SIGNUP SECURITY & RECOVERY KIT ONBOARDING */
            <div className="flex flex-col gap-4 shrink-0">
              {/* 1. Immediate 1-Click FIDO2 Passkey Binding (Mandatory for Zero-PII Blinded Email) */}
              <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_passkey", "passkey")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("passkey_card_enroll_title", "Enroll FIDO2 Passkey")}
                    </span>
                  </div>
                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[12px] ${signupPasskeyEnrolled
                        ? "text-[var(--success)]"
                        : blindSignupEmail
                          ? "text-[var(--warning)]"
                          : "text-[var(--accent)]"
                        }`}
                    >
                      {signupPasskeyEnrolled
                        ? t("icon_check_circle", "check_circle")
                        : blindSignupEmail
                          ? t("icon_warning", "warning")
                          : t("icon_verified_user", "verified_user")}
                    </span>
                    <span>
                      {signupPasskeyEnrolled
                        ? t("enabled", "Enabled")
                        : blindSignupEmail
                          ? t("auth_signup_passkey_required_badge", "Required for Blinded Email")
                          : t("auth_passkey_badge_fido", "FIDO2 Passkey")}
                    </span>
                  </span>
                </div>

                <div className="p-5 flex flex-col gap-3.5">
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "auth_signup_passkey_step_desc",
                      "Bind Windows Hello, Touch ID, 1Password, Bitwarden, or a hardware security key right now. FIDO2 Passkeys use public-key cryptography (zero shared secrets transmitted) and let you recover your account in one click."
                    )}
                  </p>

                  {!signupPasskeyEnrolled ? (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-center">
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                          {t("icon_devices", "devices")}
                        </span>
                        <input
                          type="text"
                          value={signupPasskeyName}
                          onChange={(e) => setSignupPasskeyName(e.target.value)}
                          placeholder={t(
                            "passkey_enroll_placeholder",
                            "e.g. Windows Hello, MacBook Touch ID, YubiKey 5..."
                          )}
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                      <ActionButton
                        type="button"
                        disabled={isProcessing}
                        onClick={handleSignupEnrollPasskey}
                        variant="accent"
                        icon={t("icon_passkey", "passkey")}
                        label={t("passkey_btn_bind", "Bind Passkey")}
                        className="shrink-0"
                      />
                    </div>
                  ) : (
                    <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--success)_35%,transparent)] flex items-center gap-2.5 text-xs font-bold text-[var(--success)]">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      <span>
                        {t(
                          "auth_signup_passkey_bound_toast",
                          "FIDO2 Passkey bound to your new Sanctuary identity!"
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Emergency Recovery Kit (Especially Critical for Zero-PII Blinded Email) */}
              <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--warning)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_vpn_key", "vpn_key")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("auth_signup_recovery_kit_title", "Emergency Recovery Kit")}
                    </span>
                  </div>
                  <ActionButton
                    type="button"
                    onClick={handleCopyRecoveryKit}
                    variant="glass"
                    icon={
                      signupCopiedKit
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_content_copy", "content_copy")
                    }
                    label={
                      signupCopiedKit
                        ? t("auto_copied_to_clipboard_45", "Copied to clipboard!")
                        : t("auth_signup_copy_kit_btn", "Copy Recovery Kit")
                    }
                    className="!px-3.5 !py-2 !text-[10px] shrink-0"
                  />
                </div>

                <div className="p-5 flex flex-col gap-3">
                  {blindSignupEmail && (
                    <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] flex items-start gap-2.5">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0 mt-0.5">
                        {t("icon_warning", "warning")}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "auth_blind_email_no_recovery_warn",
                          "Important: Because your real email is shredded and never stored on the server, automated password reset emails cannot be sent. Keep your password or 256-Bit Sovereign Key saved, and continue typing your normal email address when signing in."
                        )}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("auth_label_username", "Username")}
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--text)] truncate select-all">
                        {username}
                      </span>
                    </div>

                    <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("auth_label_email", "Email Address")}
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--text)] truncate select-all">
                        {email}
                      </span>
                    </div>
                  </div>

                  <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-1 min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)]">
                      {generatedKeyPreview
                        ? t("auth_sovereign_key_title", "256-Bit Sovereign Recovery Key")
                        : t("auth_label_password", "Password")}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text)] break-all select-all">
                      {generatedKeyPreview || password}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Where Would You Like to Start? (Quick-Start Destination Picker) */}
              <div className="glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_rocket_launch", "rocket_launch")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t(
                        "auth_signup_start_where_title",
                        "Where Would You Like to Start?"
                      )}
                    </span>
                  </div>
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    <span>{t("auth_signup_quickstart_badge", "Quick Start")}</span>
                  </span>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSignupLaunchTarget("workspaces")}
                    className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex items-start justify-between gap-3 ${signupLaunchTarget === "workspaces"
                        ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                        {t("icon_account_balance", "account_balance")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black text-[var(--text)]">
                          {t(
                            "auth_signup_dest_workspaces",
                            "Active Workspaces & {Vault}"
                          )}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_signup_dest_workspaces_desc",
                            "Jump straight into the OS workspace hub to mount your local {Vault}."
                          )}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`material-symbols-outlined !text-[18px] shrink-0 ${signupLaunchTarget === "workspaces"
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)] opacity-40"
                        }`}
                    >
                      {signupLaunchTarget === "workspaces"
                        ? t("icon_check_circle", "check_circle")
                        : t(
                          "icon_radio_button_unchecked",
                          "radio_button_unchecked"
                        )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSignupLaunchTarget("guide")}
                    className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex items-start justify-between gap-3 ${signupLaunchTarget === "guide"
                        ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                        {t("icon_explore", "explore")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-black text-[var(--text)]">
                          {t(
                            "auth_signup_dest_guide",
                            "Interactive OS Tour & {Citizen} Guide"
                          )}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_signup_dest_guide_desc",
                            "Open the 6-stage interactive walkthrough over your new session."
                          )}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`material-symbols-outlined !text-[18px] shrink-0 ${signupLaunchTarget === "guide"
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)] opacity-40"
                        }`}
                    >
                      {signupLaunchTarget === "guide"
                        ? t("icon_check_circle", "check_circle")
                        : t(
                          "icon_radio_button_unchecked",
                          "radio_button_unchecked"
                        )}
                    </span>
                  </button>

                  {!isDesktop() && (
                    <button
                      type="button"
                      onClick={() => setSignupLaunchTarget("download")}
                      className={`sm:col-span-2 glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex items-start justify-between gap-3 ${signupLaunchTarget === "download"
                          ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                        }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5">
                          {t("icon_download", "download")}
                        </span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-black text-[var(--text)]">
                            {t(
                              "auth_signup_dest_download",
                              "Download Desktop App"
                            )}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                            {t(
                              "auth_signup_dest_download_desc",
                              "Get Windows, macOS, or Linux/SteamOS desktop builds for local Symlink Airgap."
                            )}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`material-symbols-outlined !text-[18px] shrink-0 ${signupLaunchTarget === "download"
                            ? "text-[var(--accent)]"
                            : "text-[var(--subtext)] opacity-40"
                          }`}
                      >
                        {signupLaunchTarget === "download"
                          ? t("icon_check_circle", "check_circle")
                          : t(
                            "icon_radio_button_unchecked",
                            "radio_button_unchecked"
                          )}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <ActionButton
                type="button"
                disabled={blindSignupEmail && !signupPasskeyEnrolled}
                onClick={handleCompleteSignupOnboarding}
                variant={
                  !blindSignupEmail || signupPasskeyEnrolled ? "accent" : "glass"
                }
                icon={
                  blindSignupEmail && !signupPasskeyEnrolled
                    ? t("icon_lock", "lock")
                    : t("icon_arrow_forward", "arrow_forward")
                }
                label={
                  blindSignupEmail && !signupPasskeyEnrolled
                    ? t(
                      "auth_signup_finish_btn_locked",
                      "Bind a FIDO2 Passkey Above to Continue"
                    )
                    : t(
                      "auth_signup_finish_btn",
                      "Complete Setup & Enter Sanctuary OS"
                    )
                }
                className="w-full"
              />
            </div>
          ) : isResetPassword ? (
            /* ACCOUNT RECOVERY FLOW: FRONT-AND-CENTER PASSKEY CARD + SOVEREIGN KEY / EMAIL LINK CARD */
            <div className="flex flex-col gap-3.5 shrink-0">
              {/* Card 1: Front & Center FIDO2 Passkey Account Recovery */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col shrink-0">
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_passkey", "passkey")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                      {t(
                        "auth_reset_passkey_recovery_title",
                        "FIDO2 Passkey Account Recovery"
                      )}
                    </span>
                  </div>
                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_verified_user", "verified_user")}
                    </span>
                    <span>
                      {t("auth_recovery_tab_passkey_sub", "Blinded Email Compatible")}
                    </span>
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.22))] bg-[color-mix(in_srgb,var(--accent)_12%,rgba(255,255,255,0.06))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_passkey", "passkey")}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0 pt-0.5">
                      {t(
                        "auth_reset_passkey_recovery_desc",
                        "Have an enrolled FIDO2 Passkey? Authenticate with your Passkey right now to set a new password—even if your account uses a Blinded Email Alias."
                      )}
                    </p>
                  </div>
                  <ActionButton
                    type="button"
                    disabled={isProcessing}
                    onClick={handlePasskeyPasswordRecovery}
                    variant="accent"
                    icon={t("icon_passkey", "passkey")}
                    label={t(
                      "auth_reset_passkey_recovery_btn",
                      "Recover & Reset with Passkey"
                    )}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Card 2: Sovereign Key & Email Recovery */}
              <form
                onSubmit={handleAuth}
                className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
                noValidate
              >
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[15px]">
                        {recoveryMode === "email"
                          ? t("icon_mail", "mail")
                          : t("icon_vpn_key", "vpn_key")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                      {t(
                        "auth_recovery_other_methods_title",
                        "Sovereign Key & Email Recovery"
                      )}
                    </span>
                  </div>

                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {recoveryMode === "email"
                        ? t("icon_mail", "mail")
                        : t("icon_vpn_key", "vpn_key")}
                    </span>
                    <span>
                      {recoveryMode === "email"
                        ? t("auth_recovery_tab_email_sub", "Standard Email Only")
                        : t("auth_recovery_tab_sovereign_sub", "Blinded Email Compatible")}
                    </span>
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3.5">
                  {/* 2-Column Method Selector (Sovereign Key vs Email Link) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode("sovereign");
                        setStatus("");
                      }}
                      className={`glass-surface rounded-xl p-3 flex items-center justify-between gap-2.5 text-left border transition-all cursor-pointer ${recoveryMode !== "email"
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 ${recoveryMode !== "email"
                            ? "text-[var(--accent)]"
                            : "text-[var(--subtext)]"
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_vpn_key", "vpn_key")}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {t("auth_recovery_tab_sovereign_val", "Sovereign Key")}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80 truncate">
                            {t("auth_recovery_tab_sovereign_sub", "Blinded Email Compatible")}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`material-symbols-outlined !text-[16px] shrink-0 ${recoveryMode !== "email"
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)] opacity-40"
                          }`}
                      >
                        {recoveryMode !== "email"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode("email");
                        setStatus("");
                      }}
                      className={`glass-surface rounded-xl p-3 flex items-center justify-between gap-2.5 text-left border transition-all cursor-pointer ${recoveryMode === "email"
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 ${recoveryMode === "email"
                            ? "text-[var(--accent)]"
                            : "text-[var(--subtext)]"
                            }`}
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_mail", "mail")}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {t("auth_recovery_tab_email_val", "Email Link")}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80 truncate">
                            {t("auth_recovery_tab_email_sub", "Standard Email Only")}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`material-symbols-outlined !text-[16px] shrink-0 ${recoveryMode === "email"
                          ? "text-[var(--accent)]"
                          : "text-[var(--subtext)] opacity-40"
                          }`}
                      >
                        {recoveryMode === "email"
                          ? t("icon_check_circle", "check_circle")
                          : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                      </span>
                    </button>
                  </div>

                  {recoveryMode !== "email" ? (
                    <>
                      <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                        {t(
                          "auth_recovery_sovereign_desc",
                          "Enter your normal email address and your saved 256-Bit Sovereign Recovery Key (SOVK-...) to unlock your account and set a new password."
                        )}
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t("auth_label_email", "Email Address")}
                        </label>
                        <div className="relative group/input">
                          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                            {t("icon_alternate_email", "alternate_email")}
                          </span>
                          <input
                            type="text"
                            inputMode="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                            spellCheck="false"
                            placeholder={t("auth_label_email", "Email Address")}
                            className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t("auth_sovereign_key_title", "256-Bit Sovereign Recovery Key")}
                        </label>
                        <div className="relative group/input">
                          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                            {t("icon_vpn_key", "vpn_key")}
                          </span>
                          <input
                            type="text"
                            value={sovereignRecoveryInput}
                            onChange={(e) => setSovereignRecoveryInput(e.target.value)}
                            autoComplete="off"
                            spellCheck="false"
                            placeholder={t(
                              "auth_sovereign_key_placeholder",
                              "SOVK-XXXX-XXXX-XXXX-XXXX..."
                            )}
                            className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--warning)_38%,transparent)] flex items-start gap-2.5">
                        <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0 mt-0.5">
                          {t("icon_warning", "warning")}
                        </span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[11px] font-black text-[var(--warning)] leading-snug">
                            {t(
                              "auth_reset_blind_warn_title",
                              "Blinded Email Accounts Cannot Receive Reset Emails"
                            )}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                            {t(
                              "auth_reset_blind_warn_desc",
                              "If your account uses a Blinded Email Alias, Sanctuary OS stores no plaintext email address and cannot send reset links. Use FIDO2 Passkey Recovery above or select Sovereign Key."
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                          {t("auth_label_email", "Email Address")}
                        </label>
                        <div className="relative group/input">
                          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                            {t("icon_alternate_email", "alternate_email")}
                          </span>
                          <input
                            type="text"
                            inputMode="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                            spellCheck="false"
                            placeholder={t("auth_label_email", "Email Address")}
                            className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <ActionButton
                      type="button"
                      onClick={() => {
                        setIsResetPassword(false);
                        setIsLogin(true);
                        setStatus("");
                      }}
                      variant="glass"
                      icon={t("icon_arrow_back", "arrow_back")}
                      label={t("toggle_to_login_from_reset", "Back to Login")}
                      className="w-full"
                    />
                    <ActionButton
                      type="submit"
                      disabled={isProcessing}
                      variant="glass"
                      icon={
                        recoveryMode === "email"
                          ? t("icon_send", "send")
                          : t("icon_lock_open", "lock_open")
                      }
                      label={
                        recoveryMode === "email"
                          ? t("btn_send_reset", "Send Reset Link")
                          : t(
                            "auth_recovery_sovereign_btn",
                            "Verify Key & Set New Password"
                          )
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </form>
            </div>
          ) : isLogin ? (
            /* UNIFIED SIGN-IN FLOW: FRONT-AND-CENTER PASSKEY CARD + CREDENTIALS FORM */
            <div className="flex flex-col gap-3.5 shrink-0">
              {/* Card 1: Front & Center FIDO2 Passkey Authentication */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col shrink-0">
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_passkey", "passkey")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                      {t("auth_passkey_hero_title", "1-Click FIDO2 Passkey")}
                    </span>
                  </div>

                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_verified_user", "verified_user")}
                    </span>
                    <span>
                      {t("auth_login_passkey_chip", "Zero Shared Secret • FIDO2")}
                    </span>
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.22))] bg-[color-mix(in_srgb,var(--accent)_12%,rgba(255,255,255,0.06))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_passkey", "passkey")}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0 pt-0.5">
                      {t(
                        "auth_passkey_hero_sub",
                        "Phishing-resistant public-key sign-in via Windows Hello, Touch ID, 1Password, Bitwarden, or YubiKey—zero shared secrets transmitted."
                      )}
                    </p>
                  </div>

                  <ActionButton
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handlePasskeyMfaAuth()}
                    variant="accent"
                    icon={t("icon_passkey", "passkey")}
                    label={t("btn_verify_with_passkey", "Authenticate with Passkey")}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Card 2: Account Credentials Form */}
              <form
                onSubmit={handleAuth}
                className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
                noValidate
              >
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[15px]">
                        {t("icon_lock", "lock")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("auth_card_credentials_title", "Account Credentials")}
                    </span>
                  </div>

                  <span className={`${VAULT_CHIP_CLASS} shrink-0`}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_shield_lock", "shield_lock")}
                    </span>
                    <span>
                      {t("auth_zk_password_badge", "600k PBKDF2 + Bcrypt")}
                    </span>
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                      {t("auth_label_email", "Email Address")}
                    </label>
                    <div className="relative group/input">
                      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                        {t("icon_alternate_email", "alternate_email")}
                      </span>
                      <input
                        type="text"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        data-1p-ignore
                        placeholder={t("auth_label_email", "Email Address")}
                        className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80 px-1 leading-snug">
                      {t(
                        "auth_login_blind_email_hint",
                        "Blinded Email Alias active? Enter your normal email address—Sanctuary OS derives your alias locally on-device (600k PBKDF2) before signing in."
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                      {t(
                        "auth_login_password_or_key_label",
                        "Passcode or 256-Bit Sovereign Key"
                      )}
                    </label>
                    <div className="relative group/input">
                      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                        {t("icon_lock", "lock")}
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        spellCheck="false"
                        data-1p-ignore
                        placeholder={t(
                          "auth_login_password_or_key_label",
                          "Passcode or 256-Bit Sovereign Key"
                        )}
                        className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <ActionButton
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true);
                        setRecoveryMode("sovereign");
                        setStatus("");
                      }}
                      variant="glass"
                      icon={t("icon_lock_reset", "lock_reset")}
                      label={t("auth_btn_recover_account", "Forgot Password?")}
                      className="w-full"
                    />
                    <ActionButton
                      type="submit"
                      disabled={isProcessing}
                      variant="glass"
                      icon={t("icon_login", "login")}
                      label={
                        isProcessing
                          ? t("status_authenticating", "Authenticating...")
                          : t("btn_login", "Login to Network")
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </form>
            </div>
          ) : signupStep === "personalize" ? (
            /* STEP 1 OF 4: VISUAL THEME (CHAMELEON) & TERMINOLOGY (LEXICON) SETUP */
            <div className="flex flex-col gap-4 shrink-0">
              {/* Card 1: Terminology & Lexicon Style */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_translate", "translate")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t(
                        "auth_personalize_lexicon_title",
                        "Terminology & {Lexicon} Style"
                      )}
                    </span>
                  </div>

                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_bolt", "bolt")}
                    </span>
                    <span>
                      {t("auth_personalize_live_chip", "Live Instant Preview")}
                    </span>
                  </span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "auth_personalize_lexicon_desc",
                      "Sanctuary's default sci-fi terminology can feel dense at first—switch to Standard English anytime for everyday terms, or keep the signature Sanctuary style. Every screen updates live."
                    )}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {onboardingLexiconOptions.map((opt) => {
                      const isSelected = activeLang === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setActiveLang(opt.id);
                            setGlobalLexiconId(opt.id);
                          }}
                          className={`glass-surface rounded-2xl p-4 text-left border transition-all cursor-pointer flex flex-col justify-between gap-3 ${isSelected
                              ? "border-[color-mix(in_srgb,var(--text)_26%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                            }`}
                        >
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center justify-between gap-2 w-full">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                  {opt.icon}
                                </span>
                                <span className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
                                  {opt.name}
                                </span>
                              </div>
                              <span
                                className={`material-symbols-outlined !text-[17px] shrink-0 ${isSelected
                                    ? "text-[var(--accent)]"
                                    : "text-[var(--subtext)] opacity-40"
                                  }`}
                              >
                                {isSelected
                                  ? t("icon_check_circle", "check_circle")
                                  : t(
                                    "icon_radio_button_unchecked",
                                    "radio_button_unchecked"
                                  )}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                              {opt.desc}
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-0.5 w-full">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                              {opt.badge}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--accent)] truncate">
                              {opt.sample}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <SidePanelPillToggle
                    label={t(
                      "auth_personalize_global_lexicon_label",
                      "Keep selected {Lexicon} across all game workspaces"
                    )}
                    description={t(
                      "auth_personalize_global_lexicon_desc",
                      "Keep your chosen terminology everywhere, or leave off so game workspaces can load their own community {Lexicon} packs."
                    )}
                    icon={t("icon_public", "public")}
                    checked={useGlobalLexicon}
                    onChange={(nextVal: boolean) => {
                      setUseGlobalLexicon(nextVal);
                      if (nextVal) {
                        setGlobalLexiconId(activeLang || "en-default");
                      }
                    }}
                  />
                </div>
              </div>

              {/* Card 2: Visual Mood & Chameleon Theme */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_palette", "palette")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t(
                        "auth_personalize_theme_title",
                        "Visual Mood & {Chameleon}"
                      )}
                    </span>
                  </div>

                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {currentThemeIsDark
                        ? t("icon_dark_mode", "dark_mode")
                        : t("icon_light_mode", "light_mode")}
                    </span>
                    <span>
                      {`${currentTheme?.name || activeThemeId} • ${
                        currentThemeIsDark
                          ? t("mode_dark", "Dark")
                          : t("mode_light", "Light")
                      }`}
                    </span>
                  </span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "auth_personalize_theme_desc",
                      "Choose a dark, light, or translucent glass {Chameleon} to set the mood. You can customize or craft more anytime in {Settings}."
                    )}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {onboardingThemeOptions.map((th) => {
                      const isSelected = activeThemeId === th.id;
                      return (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => {
                            setActiveThemeId(th.id);
                            setGlobalThemeId(th.id);
                          }}
                          className={`glass-surface rounded-2xl overflow-hidden text-left border transition-all cursor-pointer flex flex-col group ${isSelected
                              ? "border-[color-mix(in_srgb,var(--text)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                            }`}
                        >
                          <DynamicThemePreviewBanner
                            data={th.data}
                            heightClass="h-28"
                            insetTopClass="top-2.5"
                          />
                          <div className="px-3.5 py-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                                {th.isDark
                                  ? t("icon_dark_mode", "dark_mode")
                                  : t("icon_light_mode", "light_mode")}
                              </span>
                              <span className="text-xs font-black text-[var(--text)] truncate">
                                {th.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                {th.swatches.map((hex: string, sIdx: number) => (
                                  <span
                                    key={sIdx}
                                    className="w-2.5 h-2.5 rounded-full border border-white/30 shadow-xs"
                                    style={{ backgroundColor: hex }}
                                  />
                                ))}
                              </div>
                              <span
                                className={`material-symbols-outlined !text-[17px] shrink-0 ${isSelected
                                    ? "text-[var(--accent)]"
                                    : "text-[var(--subtext)] opacity-40"
                                  }`}
                              >
                                {isSelected
                                  ? t("icon_check_circle", "check_circle")
                                  : t(
                                    "icon_radio_button_unchecked",
                                    "radio_button_unchecked"
                                  )}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <SidePanelPillToggle
                    label={t(
                      "auth_personalize_global_theme_label",
                      "Keep selected {Chameleon} across all game workspaces"
                    )}
                    description={t(
                      "auth_personalize_global_theme_desc",
                      "Lock one visual {Chameleon} everywhere, or leave off to assign distinct {Chameleons} per workspace."
                    )}
                    icon={t("icon_workspaces", "workspaces")}
                    checked={useGlobalTheme}
                    onChange={(nextVal: boolean) => {
                      setUseGlobalTheme(nextVal);
                      if (nextVal) {
                        setGlobalThemeId(activeThemeId || "architect");
                      }
                    }}
                  />

                  <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      type="button"
                      variant="accent"
                      icon={t("icon_arrow_forward", "arrow_forward")}
                      label={t(
                        "auth_personalize_continue_btn",
                        "Continue to Orientation & Covenants"
                      )}
                      onClick={() => {
                        setSignupStyleConfirmed(true);
                        setSignupStep("welcome");
                        setStatus("");
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : signupStep === "welcome" ? (
            /* STEP 2 OF 4: SANCTUARY OS ORIENTATION & LEGAL COVENANTS CLICKWRAP */
            <div className="flex flex-col gap-4 shrink-0">
              {/* Completed Step 1 Summary Card */}
              <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{t("step_completed", "Step Completed")}</span>
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate m-0">
                    {t(
                      "auth_personalize_confirmed_strip",
                      "{Chameleon} & {Lexicon} Configured"
                    )}
                  </h4>
                  <p className="text-[11px] text-[var(--subtext)] opacity-80 truncate m-0">
                    {`${currentTheme?.name || activeThemeId} • ${activeLexiconDisplayName}`}
                  </p>
                </div>
                <ActionButton
                  type="button"
                  variant="glass"
                  icon={t("icon_tune", "tune")}
                  label={t("edit", "Edit")}
                  onClick={() => {
                    setSignupStep("personalize");
                    setStatus("");
                  }}
                  className="!px-3.5 !py-2 shrink-0"
                />
              </div>

              {/* Card 1: Meet Sanctuary OS (OS Introduction) */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_explore", "explore")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("auth_welcome_card_title", "Welcome to Sanctuary OS")}
                    </span>
                  </div>

                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                      {t("icon_offline_bolt", "offline_bolt")}
                    </span>
                    <span>
                      {t("auth_offline_ready_chip", "100% Offline Capable")}
                    </span>
                  </span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "auth_welcome_card_desc",
                      "Sanctuary OS is local-first technical middleware and developer tooling built for independent game communities. Isolate files inside your own {Vault}, run Rust malware heuristics before launch, sync hash-only {Blueprints}, and use everything 100% offline anytime."
                    )}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3">
                      <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] shrink-0 mt-0.5">
                        {t("icon_account_balance", "account_balance")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                          {t("auth_intro_pill1_title", "{Vault} & Symlink Airgap")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_intro_pill1_desc",
                            "Airgapped local storage, load-order compiler, and reversible OS symlinks."
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3">
                      <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] shrink-0 mt-0.5">
                        {t("icon_map", "map")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                          {t("auth_intro_pill2_title", "{Blueprints} & AES-256 Sync")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_intro_pill2_desc",
                            "Hash-only JSON loadouts, Patch Fire Drill checks, and E2EE rig transfer."
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3">
                      <span className="material-symbols-outlined !text-[17px] text-[var(--success)] shrink-0 mt-0.5">
                        {t("icon_biotech", "biotech")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                          {t("auth_intro_pill3_title", "{Lab} & Bytecode Hound")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_intro_pill3_desc",
                            "Dual-Tier Rust malware shield, save rewind, and auto PII log scrubbing."
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3">
                      <span className="material-symbols-outlined !text-[17px] text-[var(--accent)] shrink-0 mt-0.5">
                        {t("icon_offline_bolt", "offline_bolt")}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                          {t("auth_intro_pill4_title", "Verified {Mason} Feeds & Offline")}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                          {t(
                            "auth_intro_pill4_desc",
                            "Release dispatches only (no user social profiles/DMs), 0% cut, 100% offline."
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ActionButton
                    type="button"
                    variant="glass"
                    icon={t("icon_explore", "explore")}
                    label={t(
                      "auth_welcome_tour_btn",
                      "Open Interactive OS Tour & {Citizen} Guide"
                    )}
                    onClick={() => setActiveOnboardingDrawerTab("intro")}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Card 2: User Legal Covenants & Age Eligibility (Mandatory Clickwrap) */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_gavel", "gavel")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t(
                        "auth_legal_card_title",
                        "User Legal Covenants & Eligibility"
                      )}
                    </span>
                  </div>

                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[11px] ${signupLegalAccepted && signupAgeConfirmed
                        ? "text-[var(--success)]"
                        : "text-[var(--accent)]"
                        }`}
                    >
                      {signupLegalAccepted && signupAgeConfirmed
                        ? t("icon_check_circle", "check_circle")
                        : t("icon_verified", "verified")}
                    </span>
                    <span>
                      {signupLegalAccepted && signupAgeConfirmed
                        ? t("partner_covenants_agreed_badge", "Agreed & Verified")
                        : t("partner_covenants_review_badge", "Review Required")}
                    </span>
                  </span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {t(
                      "auth_legal_card_desc",
                      "Inspect the synced Sanctuary OS user covenants below and affirm your consent and minimum age eligibility before creating a network account."
                    )}
                  </p>

                  {/* 2x2 User Legal Covenant Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        {
                          key: "Terms" as const,
                          icon: t("icon_description", "description"),
                          badge: t("auth_covenant_terms_badge", "User Rules & Clearances"),
                          title: t("landing_terms", "Terms of Service"),
                          desc: t(
                            "auth_covenant_terms_short",
                            "6-tier clearances, Platform Classification & Minor Safety, and 0%-cut terms."
                          ),
                        },
                        {
                          key: "Privacy" as const,
                          icon: t("icon_shield", "shield"),
                          badge: t("auth_covenant_privacy_badge", "Zero-PII & Age Privacy"),
                          title: t("landing_privacy", "Privacy Protocol"),
                          desc: t(
                            "auth_covenant_privacy_short",
                            "Blinded emails, 600k PBKDF2, PII scrubbing, and zero ID-scan privacy."
                          ),
                        },
                        {
                          key: "EULA" as const,
                          icon: t("icon_gavel", "gavel"),
                          badge: t("auth_covenant_eula_badge", "Software License"),
                          title: t("landing_eula", "System EULA"),
                          desc: t(
                            "auth_covenant_eula_short",
                            "Desktop/PWA middleware license, Symlink Airgap, and cross-platform parity."
                          ),
                        },
                        {
                          key: "ComplianceProtocol" as const,
                          icon: t("icon_verified_user", "verified_user"),
                          badge: t("compliance_protocol_badge", "Safety & Privacy"),
                          title: t("compliance_protocol_title", "Compliance Protocol"),
                          desc: t(
                            "auth_covenant_compliance_short",
                            "Tier-0 public safety, Verified {Mason} hardgates, and Rust malware enforcement."
                          ),
                        },
                      ] as const
                    ).map((doc) => {
                      const isDocReviewed =
                        reviewedUserDocs[doc.key] || signupLegalAccepted;
                      return (
                        <button
                          key={doc.key}
                          type="button"
                          onClick={() => {
                            setReviewedUserDocs((prev) => ({
                              ...prev,
                              [doc.key]: true,
                            }));
                            setActiveOnboardingDrawerTab(doc.key);
                          }}
                          className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-left flex flex-col justify-between gap-3 cursor-pointer transition-all group"
                        >
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-start justify-between gap-2 w-full">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                                  {doc.icon}
                                </span>
                                <span className="text-xs sm:text-sm font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                                  {doc.title}
                                </span>
                              </div>
                              {isDocReviewed && (
                                <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0">
                                  {t("icon_check_circle", "check_circle")}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-medium text-[var(--subtext)] opacity-85 leading-relaxed m-0">
                              {doc.desc}
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 w-full">
                            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-70 truncate">
                              {doc.badge}
                            </span>
                            <span className="text-[10px] font-black capitalize tracking-wider text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                              <span>{t("btn_view", "View")}</span>
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_arrow_forward", "arrow_forward")}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Two Unchecked-by-Default Clickwrap Toggles */}
                  <div className="flex flex-col gap-2.5">
                    <SidePanelPillToggle
                      label={t(
                        "auth_clickwrap_covenants_label",
                        "I have read and agree to the Terms of Service, Privacy Policy, EULA, and Compliance Protocol"
                      )}
                      description={t(
                        "auth_clickwrap_covenants_desc",
                        "Required: Binding covenants governing {Citizen} cloud access, Zero-PII security, Verified {Mason} hardgates, and Compliance Tier 0 public discovery."
                      )}
                      icon={t("icon_gavel", "gavel")}
                      checked={signupLegalAccepted}
                      onChange={(nextVal: boolean) => {
                        setSignupLegalAccepted(nextVal);
                        if (nextVal) {
                          setReviewedUserDocs({
                            Terms: true,
                            Privacy: true,
                            EULA: true,
                            ComplianceProtocol: true,
                          });
                        }
                        setStatus("");
                      }}
                    />

                    <SidePanelPillToggle
                      label={t(
                        "auth_clickwrap_age_label",
                        "I confirm that I am 13+ years old (or my jurisdiction's digital-consent age)"
                      )}
                      description={t(
                        "auth_clickwrap_age_desc",
                        "Required: Minimum 13+ eligibility (13–16 under GDPR) applies to {Citizen} accounts. Verified {Mason} and Staff clearances additionally require 18+ adult majority and FIDO2 Passkey enrollment."
                      )}
                      icon={t("icon_verified_user", "verified_user")}
                      checked={signupAgeConfirmed}
                      onChange={(nextVal: boolean) => {
                        setSignupAgeConfirmed(nextVal);
                        setStatus("");
                      }}
                    />
                  </div>

                  <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      type="button"
                      variant={
                        signupLegalAccepted && signupAgeConfirmed
                          ? "accent"
                          : "glass"
                      }
                      disabled={!signupLegalAccepted || !signupAgeConfirmed}
                      icon={
                        signupLegalAccepted && signupAgeConfirmed
                          ? t("icon_arrow_forward", "arrow_forward")
                          : t("icon_lock", "lock")
                      }
                      label={
                        signupLegalAccepted && signupAgeConfirmed
                          ? t(
                            "auth_signup_to_step2_btn",
                            "Continue to Identity & Credentials"
                          )
                          : t(
                            "auth_signup_accept_required_btn",
                            "Accept Covenants & Age Above"
                          )
                      }
                      onClick={() => {
                        setSignupStep("credentials");
                        setStatus("");
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 3 OF 4: CREATE ACCOUNT CREDENTIALS (REGISTER IDENTITY) */
            <div className="flex flex-col gap-4 shrink-0">
              {/* Completed Steps Summary Card */}
              <div className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    <span>{t("step_completed", "Step Completed")}</span>
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate m-0">
                    {t(
                      "auth_covenants_confirmed_strip",
                      "User Legal Covenants & 13+ Eligibility Confirmed"
                    )}
                  </h4>
                  <p className="text-[11px] text-[var(--subtext)] opacity-80 truncate m-0">
                    {`${currentTheme?.name || activeThemeId} • ${activeLexiconDisplayName} • ${t("landing_terms", "Terms of Service")} & ${t("landing_privacy", "Privacy Protocol")}`}
                  </p>
                </div>
                <ActionButton
                  type="button"
                  variant="glass"
                  icon={t("icon_arrow_back", "arrow_back")}
                  label={t("back", "Back")}
                  onClick={() => {
                    setSignupStep("welcome");
                    setStatus("");
                  }}
                  className="!px-3.5 !py-2 shrink-0"
                />
              </div>

              <form
                onSubmit={handleAuth}
                className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0"
                noValidate
              >
                <div className="px-5 py-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_person_add", "person_add")}
                      </span>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("auth_card_credentials_security_title", "Account Credentials & Security")}
                    </span>
                  </div>

                  <ActionButton
                    type="button"
                    variant="glass"
                    icon={t("icon_vpn_key", "vpn_key")}
                    label={t(
                      "auth_sovereign_key_btn_generate",
                      "Generate 256-Bit Key & Copy"
                    )}
                    onClick={() => handleGenerateSovereignPassword("signup")}
                    className="!px-3.5 !py-2 !text-[10px] shrink-0"
                  />
                </div>

                <div className="p-5 flex flex-col gap-4">
                  {generatedKeyPreview && (
                    <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
                          {t("auth_sovereign_key_title", "256-Bit Sovereign Recovery Key")}
                        </span>
                        <span className="text-xs font-mono font-bold text-[var(--text)] truncate select-all">
                          {generatedKeyPreview}
                        </span>
                      </div>
                      <ActionButton
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKeyPreview);
                          useStore
                            .getState()
                            .pushStatus(
                              t("auto_copied_to_clipboard_45", "Copied to clipboard!"),
                              "success"
                            );
                        }}
                        variant="glass"
                        icon={t("icon_content_copy", "content_copy")}
                        label={t("btn_copy_key", "Copy Key")}
                        className="!px-3 !py-1.5 !text-[10px] shrink-0"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_label_username", "Username")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
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
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_label_email", "Email Address")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                          {t("icon_alternate_email", "alternate_email")}
                        </span>
                        <input
                          type="text"
                          inputMode="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="off"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t("auth_label_email", "Email Address")}
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_signup_password_label", "Password (Min. 8 Characters)")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                          {t("icon_lock", "lock")}
                        </span>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (
                              generatedKeyPreview &&
                              e.target.value !== generatedKeyPreview
                            ) {
                              setGeneratedKeyPreview("");
                            }
                          }}
                          autoComplete="new-password"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t("auth_label_password", "Password")}
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_confirm_new_password_label", "Confirm New Password")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                          {t("icon_verified_user", "verified_user")}
                        </span>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t(
                            "auth_confirm_new_password_ph",
                            "Re-enter new password..."
                          )}
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {isStandaloneFork && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                        {t("auth_relink_token_optional_label", "Legacy Spoke Relink Token (Optional)")}
                      </label>
                      <div className="relative group/input">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 group-focus-within/input:text-[var(--accent)] group-focus-within/input:opacity-100 transition-all !text-[17px]">
                          {t("icon_vpn_key", "vpn_key")}
                        </span>
                        <input
                          type="text"
                          value={spokeRelinkToken}
                          onChange={(e) => setSpokeRelinkToken(e.target.value)}
                          autoComplete="off"
                          spellCheck="false"
                          data-1p-ignore
                          placeholder={t("spoke_relink_token_ph", "SRK1.<uuid>.<secret>")}
                          className="w-full glass-surface rounded-xl pl-10 pr-3.5 py-3 text-sm font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                        />
                      </div>
                      <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80 px-1 leading-snug">
                        {t(
                          "auth_relink_token_optional_hint",
                          "Returning from a formerly federated Spoke? Paste your Spoke Relink Token to cryptographically reclaim your {Citizen} profile, {Mason} studio, and {Blueprints}."
                        )}
                      </span>
                    </div>
                  )}

                  {/* Zero-PII Blinded Email Toggle + Recovery Warning */}
                  <div
                    onClick={() => setBlindSignupEmail((v) => !v)}
                    className={`glass-surface rounded-2xl p-4 flex flex-col gap-2.5 text-left border transition-all cursor-pointer ${blindSignupEmail
                      ? "border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2.5 w-full">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[17px]">
                            {t("icon_visibility_off", "visibility_off")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-black text-[var(--text)] leading-snug">
                            {t(
                              "auth_blind_email_toggle_title",
                              "Blinded Email Alias (No Plaintext Email Stored)"
                            )}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--subtext)] leading-snug">
                            {t(
                              "auth_blind_email_toggle_desc",
                              "Deterministically derives a blinded alias on-device (600,000-iteration PBKDF2-HMAC-SHA256) before transmission so no plaintext email is stored in the database."
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={blindSignupEmail}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBlindSignupEmail((v) => !v);
                        }}
                        className={`sa-glass-toggle shrink-0 ${blindSignupEmail ? "is-on" : ""
                          }`}
                      >
                        <span className="sa-glass-toggle-thumb" />
                      </button>
                    </div>

                    {blindSignupEmail && blindSignupPreview && (
                      <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t(
                            "auth_blind_email_active_badge",
                            "Blinded Email Alias"
                          )}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-[var(--accent)] truncate">
                          {maskEmailAddress(blindSignupPreview)}
                        </span>
                      </div>
                    )}

                    <div
                      className={`pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-start gap-2 text-[11px] font-medium leading-relaxed ${blindSignupEmail ? "text-[var(--warning)]" : "text-[var(--subtext)]"
                        }`}
                    >
                      <span className="material-symbols-outlined !text-[15px] shrink-0 mt-0.5">
                        {blindSignupEmail
                          ? t("icon_warning", "warning")
                          : t("icon_info", "info")}
                      </span>
                      <span>
                        {blindSignupEmail
                          ? t(
                            "auth_blind_email_no_recovery_warn",
                            "Important: Because no plaintext email is stored on the server, automated password reset emails cannot be sent. Keep your password or 256-Bit Sovereign Key saved, or bind a FIDO2 Passkey for recovery."
                          )
                          : t(
                            "auth_blind_email_plaintext_warn",
                            "Standard Email Mode: Your plaintext email address will be stored on the authentication server to allow traditional password reset emails."
                          )}
                      </span>
                    </div>
                  </div>

                  <ActionButton
                    type="submit"
                    disabled={isProcessing}
                    variant="glass"
                    icon={t("icon_arrow_forward", "arrow_forward")}
                    label={
                      isProcessing
                        ? t("status_authenticating", "Authenticating...")
                        : t("auth_signup_continue_btn", "Create Identity & Continue")
                    }
                    className="w-full"
                  />
                </div>
              </form>

              {/* Restored Network & Privacy Guidelines (Security Protocols) Info Card */}
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                      {t("icon_verified_user", "verified_user")}
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                      {t("network_access_guidelines", "Network & Privacy Guidelines")}
                    </span>
                  </div>
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[11px] text-[var(--success)]">
                      {t("icon_shield_lock", "shield_lock")}
                    </span>
                    <span>
                      {t("auth_hero_security_badge", "Blinded Email • 600k PBKDF2 • FIDO2")}
                    </span>
                  </span>
                </div>

                <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                      {t("icon_visibility_off", "visibility_off")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                        {t("auth_guideline_blind_title", "Blinded Email Alias")}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "auth_guideline_blind_desc",
                          "Your email is deterministically derived on-device (600k PBKDF2-SHA256) before transmission so no plaintext email is stored in the Hub database."
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0 mt-0.5">
                      {t("icon_enhanced_encryption", "enhanced_encryption")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                        {t("auth_guideline_pbkdf2_title", "600k PBKDF2 + Bcrypt")}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "auth_guideline_pbkdf2_desc",
                          "Your password is stretched 600,000 times on your client before uplink and bcrypt-hashed by the server—your plaintext password is never transmitted."
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--warning)] shrink-0 mt-0.5">
                      {t("icon_vpn_key", "vpn_key")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                        {t("auth_guideline_recovery_title", "Sovereign Keys & Recovery")}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "auth_guideline_recovery_desc",
                          "Blinded accounts cannot receive reset emails. Save your 256-Bit Sovereign Key or enroll a FIDO2 Passkey for instant recovery."
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0 mt-0.5">
                      {t("icon_passkey", "passkey")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-black text-[var(--text)] leading-tight">
                        {t("auth_guideline_lockdown_title", "FIDO2 Public-Key & Scrubbing")}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--subtext)] leading-relaxed">
                        {t(
                          "auth_guideline_lockdown_desc",
                          "FIDO2 Passkeys authenticate via phishing-resistant public-key cryptography (no shared secret transmitted), and machine paths are scrubbed locally."
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidePanel>

      {activeOnboardingDrawerTab && (
        <React.Suspense fallback={null}>
          <CitizenOnboardingCovenantsSidePanel
            activeTab={activeOnboardingDrawerTab}
            onSelectTab={(tab) => {
              if (tab !== "intro") {
                setReviewedUserDocs((prev) => ({ ...prev, [tab]: true }));
              }
              setActiveOnboardingDrawerTab(tab);
            }}
            onClose={() => setActiveOnboardingDrawerTab(null)}
            legalAccepted={signupLegalAccepted}
            onAcceptAllCovenants={
              !session
                ? () => {
                  setReviewedUserDocs({
                    Terms: true,
                    Privacy: true,
                    EULA: true,
                    ComplianceProtocol: true,
                  });
                  setSignupLegalAccepted(true);
                  setActiveOnboardingDrawerTab(null);
                }
                : undefined
            }
          />
        </React.Suspense>
      )}
    </>
  );
}
