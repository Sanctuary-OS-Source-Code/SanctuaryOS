import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  supabase,
  isStandaloneFork,
  getRuntimeUplinkBundle,
  parseUplinkBundle,
  setRuntimeUplinkBundle,
} from "./supabase";
import { parseSpokeRelinkToken } from "./utils/stagingCrypto";
import { useLexicon, CORE_GLOSSARY_TERMS } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
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
  markPasskeySessionVerified,
  maskEmailAddress,
  registerFidoPasskey,
  resetPasswordFromVerifiedSession,
  restoreDevSessionFromVite,
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

import { AuthPasswordRecoveryForm, AuthMfaChallengeView, AuthSignupSecurityView } from "./components/auth/AuthSecurityAndRecoveryViews";
import { AuthPasswordResetView, AuthLoginFormView, AuthOnboardingPersonalizeView, AuthOnboardingWelcomeView } from "./components/auth/AuthResetAndOnboardingViews";
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
  const [runtimeUplinkInput, setRuntimeUplinkInput] = useState("");
  const [showUplinkConnector, setShowUplinkConnector] = useState(false);
  const activeRuntimeUplink = parseUplinkBundle(getRuntimeUplinkBundle());
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
            ...(!blindSignupEmail
              ? {
                  emailRedirectTo: isDesktop()
                    ? "https://sanctuaryos.net"
                    : typeof window !== "undefined"
                      ? window.location.origin
                      : "https://sanctuaryos.net",
                }
              : {}),
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
            <AuthPasswordRecoveryForm t={t} setIsPasswordRecovery={setIsPasswordRecovery} recoveryNewPassword={recoveryNewPassword} setRecoveryNewPassword={setRecoveryNewPassword} recoveryConfirmPassword={recoveryConfirmPassword} setRecoveryConfirmPassword={setRecoveryConfirmPassword} generatedKeyPreview={generatedKeyPreview} setGeneratedKeyPreview={setGeneratedKeyPreview} isProcessing={isProcessing} handleGenerateSovereignPassword={handleGenerateSovereignPassword} handlePasswordRecoverySubmit={handlePasswordRecoverySubmit} />
          ) : showMfaChallenge ? (
            <AuthMfaChallengeView t={t} setShowMfaChallenge={setShowMfaChallenge} mfaPasskeys={mfaPasskeys} mfaTotpFactors={mfaTotpFactors} selectedPasskeyId={selectedPasskeyId} setSelectedPasskeyId={setSelectedPasskeyId} mfaMode={mfaMode} setMfaMode={setMfaMode} mfaCode={mfaCode} setMfaCode={setMfaCode} setStatus={setStatus} isProcessing={isProcessing} isAwaitingMfaRef={isAwaitingMfaRef} finalizeLogin={finalizeLogin} completeAuthenticatedTransition={completeAuthenticatedTransition} handlePasskeyMfaAuth={handlePasskeyMfaAuth} handleMfaAuth={handleMfaAuth} />
          ) : !isLogin && !isResetPassword && signupStep === "security" ? (
            <AuthSignupSecurityView t={t} email={email} password={password} generatedKeyPreview={generatedKeyPreview} username={username} blindSignupEmail={blindSignupEmail} setSignupLaunchTarget={setSignupLaunchTarget} signupLaunchTarget={signupLaunchTarget} signupPasskeyName={signupPasskeyName} setSignupPasskeyName={setSignupPasskeyName} signupPasskeyEnrolled={signupPasskeyEnrolled} signupCopiedKit={signupCopiedKit} isProcessing={isProcessing} handleSignupEnrollPasskey={handleSignupEnrollPasskey} handleCopyRecoveryKit={handleCopyRecoveryKit} handleCompleteSignupOnboarding={handleCompleteSignupOnboarding} />
          ) : isResetPassword ? (
            <AuthPasswordResetView t={t} setIsLogin={setIsLogin} isLogin={isLogin} setIsResetPassword={setIsResetPassword} email={email} setEmail={setEmail} password={password} setPassword={setPassword} recoveryMode={recoveryMode} setRecoveryMode={setRecoveryMode} sovereignRecoveryInput={sovereignRecoveryInput} setSovereignRecoveryInput={setSovereignRecoveryInput} setStatus={setStatus} isProcessing={isProcessing} handlePasskeyPasswordRecovery={handlePasskeyPasswordRecovery} handlePasskeyMfaAuth={handlePasskeyMfaAuth} handleAuth={handleAuth} />
          ) : isLogin ? (
            <AuthLoginFormView t={t} setIsLogin={setIsLogin} isLogin={isLogin} setIsResetPassword={setIsResetPassword} email={email} setEmail={setEmail} password={password} setPassword={setPassword} recoveryMode={recoveryMode} setRecoveryMode={setRecoveryMode} sovereignRecoveryInput={sovereignRecoveryInput} setSovereignRecoveryInput={setSovereignRecoveryInput} setStatus={setStatus} isProcessing={isProcessing} handlePasskeyPasswordRecovery={handlePasskeyPasswordRecovery} handlePasskeyMfaAuth={handlePasskeyMfaAuth} handleAuth={handleAuth} />
          ) : signupStep === "personalize" ? (
            <AuthOnboardingPersonalizeView t={t} activeLang={activeLang} setActiveLang={setActiveLang} useGlobalLexicon={useGlobalLexicon} setUseGlobalLexicon={setUseGlobalLexicon} setGlobalLexiconId={setGlobalLexiconId} currentTheme={currentTheme} activeThemeId={activeThemeId} setActiveThemeId={setActiveThemeId} useGlobalTheme={useGlobalTheme} setUseGlobalTheme={setUseGlobalTheme} setGlobalThemeId={setGlobalThemeId} setSignupStep={setSignupStep} setSignupStyleConfirmed={setSignupStyleConfirmed} setStatus={setStatus} onboardingLexiconOptions={onboardingLexiconOptions} onboardingThemeOptions={onboardingThemeOptions} currentThemeIsDark={currentThemeIsDark} />
          ) : signupStep === "welcome" ? (
            <AuthOnboardingWelcomeView t={t} currentTheme={currentTheme} activeThemeId={activeThemeId} setSignupStep={setSignupStep} signupLegalAccepted={signupLegalAccepted} setSignupLegalAccepted={setSignupLegalAccepted} signupAgeConfirmed={signupAgeConfirmed} setSignupAgeConfirmed={setSignupAgeConfirmed} reviewedUserDocs={reviewedUserDocs} setReviewedUserDocs={setReviewedUserDocs} setActiveOnboardingDrawerTab={setActiveOnboardingDrawerTab} setStatus={setStatus} activeLexiconDisplayName={activeLexiconDisplayName} />
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

          <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowUplinkConnector((v) => !v)}
                className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[var(--accent)] hover:opacity-85 transition-opacity"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_hub", "hub")}
                </span>
                <span>
                  {activeRuntimeUplink?.supabase_url
                    ? t("uplink_runtime_active_short", "Spoke Uplink Active")
                    : t("uplink_connect_spoke_btn", "Connect to Partner Spoke (SANCTUARY-UPLINK://)")}
                </span>
              </button>
              {activeRuntimeUplink?.supabase_url && (
                <button
                  type="button"
                  onClick={() => {
                    setRuntimeUplinkBundle(null);
                    window.location.reload();
                  }}
                  className="text-[10px] font-black uppercase tracking-wider text-[var(--danger)] hover:underline"
                >
                  {t("uplink_disconnect_btn", "Disconnect Uplink")}
                </button>
              )}
            </div>
            {(showUplinkConnector || Boolean(activeRuntimeUplink?.supabase_url)) && (
              <div className="flex flex-col gap-2">
                {activeRuntimeUplink?.supabase_url && (
                  <div className="text-[10px] font-mono text-[var(--subtext)] truncate">
                    {activeRuntimeUplink.supabase_url}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={runtimeUplinkInput}
                    onChange={(e) => setRuntimeUplinkInput(e.target.value)}
                    placeholder={t("uplink_input_placeholder", "SANCTUARY-UPLINK://...")}
                    className="flex-1 min-w-0 glass-surface rounded-xl px-3 py-2 text-[11px] font-mono text-[var(--text)] outline-none border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                  />
                  <ActionButton
                    variant="accent"
                    icon={t("icon_hub", "hub")}
                    label={t("btn_connect", "Connect")}
                    disabled={!runtimeUplinkInput.trim()}
                    onClick={() => {
                      const parsed = parseUplinkBundle(runtimeUplinkInput);
                      if (!parsed) {
                        setStatus(
                          t("uplink_invalid_bundle_err", "Invalid SANCTUARY-UPLINK:// bundle.")
                        );
                        return;
                      }
                      if (setRuntimeUplinkBundle(runtimeUplinkInput)) {
                        window.location.reload();
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
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
