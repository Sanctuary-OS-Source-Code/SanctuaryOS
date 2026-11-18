import { useState, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import {
  supabase,
  supabaseAuth,
  getActiveGameClient,
  getBrandConfig,
} from "../supabase";
import { buildSpokeRelinkToken, parseSpokeRelinkToken } from "../utils/stagingCrypto";
import { TabContainer, SettingsGrid, SettingsToggle } from "./shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { LiquidGlassAlertCard } from "../components/BlueprintPatchReadiness";
import { ActionButton, HoverTooltip } from "../shared";
import { openSanctuaryLogin } from "../AuthWrapper";
import {
  fetchMfaSecurityState,
  getCachedMfaSecurityState,
  prewarmPasskeyAuthenticationOptions,
  registerFidoPasskey,
  authenticateFidoPasskey,
  deleteSecurityFactor,
  verifyPasswordWithoutSessionDowngrade,
  isElevatedRoleRequiringPasskey,
  isNativeLocalPasskeySupported,
  notifyMfaStateChanged,
  maskEmailAddress,
  isBlindedEmailAddress,
  deriveBlindedEmailAlias,
  generateSovereignRecoveryKey,
  getCitizenSecurityPolicy,
  updateCitizenSecurityPolicy,
  updateUserCredentialsZeroKnowledge,
  CitizenSecurityPolicy,
} from "../utils/passkeyUtils";

import { CoreSecuritySidePanels } from "./core/CoreSecuritySidePanels";
export default function CoreTab() {
  const { t } = useLexicon();
  const { session, userRole, osRole, activeWorkspaceId, localOnly, setLocalOnly } = useStore(
    useShallow((s) => ({
      session: s.session,
      userRole: s.userRole,
      osRole: s.osRole,
      activeWorkspaceId: s.activeWorkspaceId,
      localOnly: s.localOnly,
      setLocalOnly: s.setLocalOnly,
    }))
  );
  const [shareMalwareReports, setShareMalwareReports] = useState(
    () => localStorage.getItem("sanctuary_share_malware_reports") === "true"
  );
  const [companionSyncEnabled, setCompanionSyncEnabled] = useState(
    () => localStorage.getItem("sanctuary_cloud_companion_sync") === "true"
  );
  const useInternalBrowser = useModalStore((state) => state.useInternalBrowser);
  const setUseInternalBrowser = useModalStore((state) => state.setUseInternalBrowser);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [blindEmailOnSave, setBlindEmailOnSave] = useState<boolean>(() =>
    Boolean(session?.user?.email && isBlindedEmailAddress(session.user.email))
  );
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [pendingUnenrollFactorId, setPendingUnenrollFactorId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [relinkTokenInput, setRelinkTokenInput] = useState("");
  const [claimingRelink, setClaimingRelink] = useState(false);
  const [activePanel, setActivePanel] = useState<"email" | "password" | "system_id" | "2fa" | null>(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sanctuary_open_2fa_panel") === "true") {
      localStorage.removeItem("sanctuary_open_2fa_panel");
      return "2fa";
    }
    return null;
  });

  const initialMfa = getCachedMfaSecurityState(session?.user?.id);
  const [factors, setFactors] = useState<any[]>(() => initialMfa?.allVerifiedFactors || []);
  const [passkeys, setPasskeys] = useState<any[]>(() => initialMfa?.passkeys || []);
  const [totpFactors, setTotpFactors] = useState<any[]>(() => initialMfa?.totpFactors || []);
  const [isPasskeyVerified, setIsPasskeyVerified] = useState<boolean>(() =>
    Boolean(initialMfa?.isPasskeyVerified)
  );
  const [isVerifiedMason, setIsVerifiedMason] = useState(false);
  const [loading2FA, setLoading2FA] = useState<boolean>(() => !initialMfa);
  const [mfaEnrollTab, setMfaEnrollTab] = useState<"passkey" | "totp">("passkey");
  const [showAddPasskeyForm, setShowAddPasskeyForm] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [passkeyNameInput, setPasskeyNameInput] = useState("");
  const [enrollPasswordInput, setEnrollPasswordInput] = useState("");
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [verifyingStepUp, setVerifyingStepUp] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [citizenPolicy, setCitizenPolicy] = useState<CitizenSecurityPolicy>(() =>
    getCitizenSecurityPolicy(
      session,
      Boolean(initialMfa?.hasPasskey || initialMfa?.hasTotp),
      Boolean(initialMfa?.hasPasskey)
    )
  );
  const [savingPolicy, setSavingPolicy] = useState(false);

  const isElevatedRole = isElevatedRoleRequiringPasskey({
    userRole,
    osRole,
    isVerifiedMason,
  });

  const requiresPasskeyStepUp = passkeys.length > 0 && !isPasskeyVerified;
  const isCurrentEmailBlinded = isBlindedEmailAddress(session?.user?.email);
  const [blindEmailPreview, setBlindEmailPreview] = useState("");
  const [generatedKeyPreview, setGeneratedKeyPreview] = useState("");

  useEffect(() => {
    setBlindEmailOnSave(isCurrentEmailBlinded);
  }, [isCurrentEmailBlinded]);

  useEffect(() => {
    let cancelled = false;
    const candidateEmail =
      emailInput.trim() || (!isCurrentEmailBlinded ? session?.user?.email || "" : "");
    if (blindEmailOnSave && candidateEmail) {
      deriveBlindedEmailAlias(candidateEmail).then((alias) => {
        if (!cancelled) setBlindEmailPreview(alias);
      });
    } else {
      setBlindEmailPreview("");
    }
    return () => {
      cancelled = true;
    };
  }, [emailInput, blindEmailOnSave, isCurrentEmailBlinded, session?.user?.email]);

  const resetSecurityInputs = () => {
    setEmailInput("");
    setBlindEmailOnSave(isCurrentEmailBlinded);
    setCurrentPasswordInput("");
    setPasswordInput("");
    setConfirmPasswordInput("");
    setGeneratedKeyPreview("");
    setEnrollPasswordInput("");
    setPendingUnenrollFactorId(null);
    setPasskeyError("");
    setEnrollError("");
    setShowAddPasskeyForm(false);
  };

  const handleClosePanel = () => {
    resetSecurityInputs();
    setActivePanel(null);
  };

  const loadFactors = async () => {
    setLoading2FA(true);
    const state = await fetchMfaSecurityState();
    setPasskeys(state.passkeys);
    setTotpFactors(state.totpFactors);
    setFactors(state.allVerifiedFactors);
    setIsPasskeyVerified(Boolean(state.isPasskeyVerified));
    setCitizenPolicy(
      getCitizenSecurityPolicy(
        useStore.getState().session || session,
        state.hasPasskey || state.hasTotp,
        state.hasPasskey
      )
    );
    setLoading2FA(false);
  };

  useEffect(() => {
    loadFactors();
    const handleMfaUpdated = () => {
      loadFactors();
    };
    window.addEventListener("sanctuary-mfa-updated", handleMfaUpdated);
    return () => window.removeEventListener("sanctuary-mfa-updated", handleMfaUpdated);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsVerifiedMason(false);
      return;
    }
    Promise.resolve(
      supabase
        .from("masons")
        .select("id, is_verified")
        .eq("profile_id", session.user.id)
        .maybeSingle()
    )
      .then(({ data }) => {
        setIsVerifiedMason(Boolean(data?.is_verified));
      })
      .catch(() => { });
  }, [session?.user?.id, activeWorkspaceId]);

  const verifyCurrentPassword = async (): Promise<boolean> => {
    const activeEmail = session?.user?.email;
    if (!activeEmail) return false;
    if (!currentPasswordInput) {
      useStore.getState().pushStatus(
        t("auth_current_password_required_err", "Please enter your current password to authorize this security change."),
        "error"
      );
      return false;
    }
    const { verified } = await verifyPasswordWithoutSessionDowngrade(activeEmail, currentPasswordInput);
    if (!verified) {
      useStore.getState().pushStatus(
        t("auth_current_password_invalid_err", "Current password verification failed. Please check your password and try again."),
        "error"
      );
      return false;
    }
    return true;
  };

  const formatPasskeyError = (rawMessage: string): string => {
    const lower = rawMessage.toLowerCase();
    if (lower.includes("mfa enroll is disabled") || lower.includes("passkey is disabled")) {
      return t(
        "passkey_err_supabase_mfa_disabled",
        "Passkey authentication is disabled on the Hub database. Enable 'Passkeys' under Supabase Dashboard → Authentication → Passkeys (/auth/passkeys)."
      );
    }
    if (
      lower.includes("relying party") ||
      lower.includes("registrable domain") ||
      lower.includes("securityerror")
    ) {
      const origin = typeof window !== "undefined" ? window.location.origin : "localhost";
      return t(
        "passkey_err_rp_domain_mismatch",
        "Passkey domain mismatch: The current app origin ({0}) does not match the Relying Party ID configured in Supabase → Authentication → Passkeys. Set Relying Party ID to 'localhost' (and Relying Party Origins to 'http://localhost:1420,http://tauri.localhost') when using the Desktop client."
      ).replace("{0}", origin);
    }
    return rawMessage;
  };

  useEffect(() => {
    if (
      activePanel === "2fa" &&
      requiresPasskeyStepUp &&
      isNativeLocalPasskeySupported()
    ) {
      void prewarmPasskeyAuthenticationOptions();
    }
  }, [activePanel, requiresPasskeyStepUp]);

  const handlePasskeyStepUp = async () => {
    setVerifyingStepUp(true);
    setPasskeyError("");
    const { error } = await authenticateFidoPasskey(passkeys[0]?.id);
    if (error) {
      setPasskeyError(formatPasskeyError(error.message));
      setVerifyingStepUp(false);
      return;
    }
    const optimistic = getCachedMfaSecurityState(session?.user?.id);
    if (optimistic) {
      setPasskeys(optimistic.passkeys);
      setTotpFactors(optimistic.totpFactors);
      setFactors(optimistic.allVerifiedFactors);
      setIsPasskeyVerified(Boolean(optimistic.isPasskeyVerified));
      setLoading2FA(false);
      setVerifyingStepUp(false);
      void loadFactors();
      return;
    }
    await loadFactors();
    setVerifyingStepUp(false);
  };

  const handleRegisterPasskey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (requiresPasskeyStepUp) {
      setPasskeyError(
        t(
          "auth_passkey_stepup_required_desc",
          "Your account already has an active FIDO2 Passkey. To prevent unauthorized credential enrollment from stolen sessions or passwords, you must authenticate with an existing Passkey on this device before adding or modifying security factors."
        )
      );
      return;
    }
    if (!enrollPasswordInput.trim()) {
      setPasskeyError(
        t(
          "auth_current_password_required_err",
          "Please enter your current password to authorize this security change."
        )
      );
      return;
    }
    setRegisteringPasskey(true);
    setPasskeyError("");
    const basePasskeyName = t("auth_passkey_badge_fido", "FIDO2 Passkey");
    const defaultLabel =
      passkeyNameInput.trim() ||
      (passkeys.length > 0 ? `${basePasskeyName} (${passkeys.length + 1})` : basePasskeyName);

    const { error } = await registerFidoPasskey(defaultLabel, {
      currentPassword: enrollPasswordInput,
    });
    if (error) {
      setPasskeyError(formatPasskeyError(error.message));
      setRegisteringPasskey(false);
      return;
    }

    setPasskeyNameInput("");
    setEnrollPasswordInput("");
    setShowAddPasskeyForm(false);
    setRegisteringPasskey(false);
    useStore.getState().pushStatus(
      t("auth_passkey_enrolled_toast", "FIDO2 Passkey registered and verified!"),
      "success"
    );
    await loadFactors();
  };

  const startEnrollment = async () => {
    if (requiresPasskeyStepUp) {
      setEnrollError(
        t(
          "auth_passkey_stepup_required_desc",
          "Your account already has an active FIDO2 Passkey. To prevent unauthorized credential enrollment from stolen sessions or passwords, you must authenticate with an existing Passkey on this device before adding or modifying security factors."
        )
      );
      return;
    }
    setEnrolling(true);
    setEnrollError("");

    try {
      const { data: existingFactors } = await supabaseAuth.auth.mfa.listFactors();
      if (existingFactors && existingFactors.all) {
        for (const f of existingFactors.all) {
          if (f.status === "unverified") {
            await supabaseAuth.auth.mfa.unenroll({ factorId: f.id });
          }
        }
      }

      const verifiedCount =
        existingFactors && existingFactors.all
          ? existingFactors.all.filter((f) => f.status === "verified" && f.factor_type === "totp").length
          : 0;
      const baseTotpLabel = t("auth_passkey_badge_totp", "Authenticator App");
      const fName =
        verifiedCount > 0 ? `${baseTotpLabel} (${verifiedCount + 1})` : baseTotpLabel;

      const { data, error } = await supabaseAuth.auth.mfa.enroll({
        factorType: "totp",
        issuer: getBrandConfig().appTitle || "Sanctuary OS",
        friendlyName: fName,
      });
      if (error) {
        setEnrollError(error.message);
        setEnrolling(false);
        return;
      }
      if (data) {
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setTotpSecret(data.totp.secret);
      }
    } catch (err: any) {
      setEnrollError(err.message || "An error occurred during enrollment.");
      console.error(err);
    } finally {
      setEnrolling(false);
    }
  };

  const cancelEnrollment = async () => {
    if (factorId) {
      try {
        await supabaseAuth.auth.mfa.unenroll({ factorId });
      } catch (err) {
        console.error("Failed to unenroll on cancel:", err);
      }
    }
    setFactorId(null);
    setQrCode(null);
    setTotpSecret(null);
    setVerifyCode("");
    setEnrollError("");
  };

  const verifyEnrollment = async () => {
    if (!factorId) return;
    setEnrolling(true);
    setEnrollError("");
    const { error } = await supabaseAuth.auth.mfa.challengeAndVerify({
      factorId,
      code: verifyCode,
    });

    if (error) {
      setEnrollError(error.message);
      setEnrolling(false);
      return;
    }

    setFactorId(null);
    setQrCode(null);
    setTotpSecret(null);
    setVerifyCode("");
    setEnrolling(false);
    notifyMfaStateChanged();
    loadFactors();
  };

  const confirmUnenrollFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUnenrollFactorId) return;
    const targetFactor = factors.find((f) => f.id === pendingUnenrollFactorId);
    if (isElevatedRole && targetFactor?.factor_type === "webauthn" && passkeys.length <= 1) {
      useStore.getState().pushStatus(
        t(
          "auth_passkey_last_required_err",
          "Elevated roles must keep at least one active FIDO2 Passkey. Register a backup Passkey before removing this one."
        ),
        "error"
      );
      return;
    }

    setAuthLoading(true);
    try {
      const verified = await verifyCurrentPassword();
      if (!verified) {
        setAuthLoading(false);
        return;
      }
      const { error } = await deleteSecurityFactor(
        targetFactor || { id: pendingUnenrollFactorId, factor_type: "totp" }
      );
      if (error) throw error;
      setPendingUnenrollFactorId(null);
      setCurrentPasswordInput("");
      useStore.getState().pushStatus(
        t("auth_passkey_removed_toast", "Security credential removed."),
        "success"
      );
      notifyMfaStateChanged();
      await loadFactors();
    } catch (err: any) {
      useStore.getState().pushStatus(err.message || String(err), "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleCitizenPolicy = async (key: keyof CitizenSecurityPolicy, nextVal: boolean) => {
    if (requiresPasskeyStepUp) {
      useStore.getState().pushStatus(
        t(
          "auth_passkey_stepup_required_desc",
          "Your account already has an active FIDO2 Passkey. To prevent unauthorized credential enrollment from stolen sessions or passwords, you must authenticate with an existing Passkey on this device before adding or modifying security factors."
        ),
        "error"
      );
      return;
    }
    setSavingPolicy(true);
    const patch: Partial<CitizenSecurityPolicy> =
      key === "enforceSessionLock"
        ? {
          enforceSessionLock: nextVal,
          strictPasskeyOnly: nextVal,
          ...(nextVal ? { enforceLoginMfa: true } : {}),
        }
        : { [key]: nextVal };
    setCitizenPolicy((prev) => ({ ...prev, ...patch }));
    const { policy, error } = await updateCitizenSecurityPolicy(patch);
    setSavingPolicy(false);
    if (error) {
      useStore.getState().pushStatus(error.message, "error");
      await loadFactors();
      return;
    }
    setCitizenPolicy(policy);
    useStore.getState().pushStatus(
      t("auth_policy_saved_toast", "Account security lockdown policy updated."),
      "success"
    );
  };

  const handleGenerateSovereignKey = () => {
    const generated = generateSovereignRecoveryKey();
    setPasswordInput(generated);
    setConfirmPasswordInput(generated);
    setGeneratedKeyPreview(generated);
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

  const updateAuth = async (type: "email" | "password") => {
    setAuthLoading(true);
    try {
      if (passkeys.length > 0 && !isPasskeyVerified) {
        const { error: stepUpErr } = await authenticateFidoPasskey(passkeys[0]?.id);
        if (stepUpErr) {
          useStore.getState().pushStatus(formatPasskeyError(stepUpErr.message), "error");
          setAuthLoading(false);
          return;
        }
        await loadFactors();
      }
      if (type === "email") {
        const typedEmail = emailInput.trim();
        const fallbackCurrentEmail =
          !typedEmail && !isCurrentEmailBlinded && blindEmailOnSave
            ? (session?.user?.email || "").trim()
            : "";
        const sourceEmail = typedEmail || fallbackCurrentEmail;

        if (!sourceEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sourceEmail)) {
          useStore.getState().pushStatus(
            t("auth_email_invalid_err", "Please enter a valid email address."),
            "error"
          );
          setAuthLoading(false);
          return;
        }
        if (!currentPasswordInput.trim()) {
          useStore.getState().pushStatus(
            t("err_enter_current_password", "Please enter your current password to verify."),
            "error"
          );
          setAuthLoading(false);
          return;
        }

        const targetEmail = blindEmailOnSave
          ? await deriveBlindedEmailAlias(sourceEmail)
          : sourceEmail.toLowerCase();

        const { error } = await updateUserCredentialsZeroKnowledge({
          currentPassword: currentPasswordInput,
          newEmail: targetEmail,
          metadataPatch: {
            email_blinded_v2: blindEmailOnSave,
            email_blinded_v1: blindEmailOnSave,
            email_blinded: blindEmailOnSave,
          },
        });
        if (error) throw error;

        useStore.getState().pushStatus(
          blindEmailOnSave
            ? t(
              "auth_blind_email_converted_toast",
              "Personal email shredded! Account converted to Blinded Email Alias."
            )
            : t("auto_email_update_initiated_45", "Email update initiated."),
          "success"
        );
        handleClosePanel();
      }
      if (type === "password") {
        if (passwordInput.length < 8) {
          useStore.getState().pushStatus(
            t("auth_recovery_min_length_err", "Password must be at least 8 characters long."),
            "error"
          );
          setAuthLoading(false);
          return;
        }
        if (passwordInput !== confirmPasswordInput) {
          useStore.getState().pushStatus(
            t("auth_recovery_mismatch_err", "Passwords do not match."),
            "error"
          );
          setAuthLoading(false);
          return;
        }
        if (!currentPasswordInput.trim()) {
          useStore.getState().pushStatus(
            t("err_enter_current_password", "Please enter your current password to verify."),
            "error"
          );
          setAuthLoading(false);
          return;
        }

        const { error } = await updateUserCredentialsZeroKnowledge({
          currentPassword: currentPasswordInput,
          newPassword: passwordInput,
          metadataPatch: { zk_password_v2: true, zk_password_v1: true },
        });
        if (error) throw error;

        useStore.getState().pushStatus(
          t("auto_password_updated_successfully_34", "Password updated successfully."),
          "success"
        );
        handleClosePanel();
      }
    } catch (err: any) {
      useStore.getState().pushStatus(err.message || String(err), "error");
    }
    setAuthLoading(false);
  };

  useEffect(() => {
    const gameClient = getActiveGameClient();
    if (session?.user?.id && gameClient) {
      Promise.resolve(
        gameClient
          .from("profiles")
          .select("is_comm_banned, comm_blacklist_reason")
          .eq("id", session.user.id)
          .maybeSingle()
      )
        .then(({ data }) => {
          if (data?.is_comm_banned) {
            setIsBanned(true);
            setBanReason(data.comm_blacklist_reason || t("comm_ban_title", "Communications Ban"));
          } else {
            setIsBanned(false);
            setBanReason("");
          }
        })
        .catch(() => {});
    } else {
      setIsBanned(false);
      setBanReason("");
    }
  }, [session?.user?.id, activeWorkspaceId]);

  const toggleLocalOnly = () => {
    setLocalOnly(!localOnly);
  };

  const handleCopySystemId = () => {
    navigator.clipboard.writeText(session?.user?.id || "");
    useStore.getState().pushStatus(
      t("auto_copied_to_clipboard_45", "Copied to clipboard!"),
      "success"
    );
  };

  const handleCopyRelinkToken = async () => {
    if (!session?.user?.id) return;
    try {
      const token = await buildSpokeRelinkToken(session.user.id);
      await navigator.clipboard.writeText(token);
      useStore.getState().pushStatus(
        t("spoke_relink_token_copied", "Spoke Relink Token copied to clipboard!"),
        "success"
      );
    } catch (err: any) {
      useStore.getState().pushStatus(
        err?.message || t("spoke_relink_token_copy_fail", "Failed to generate Spoke Relink Token."),
        "error"
      );
    }
  };

  const handleClaimLegacySpokeProfile = async () => {
    if (!session?.user?.id || claimingRelink) return;
    const parsed = parseSpokeRelinkToken(relinkTokenInput);
    if (!parsed) {
      useStore.getState().pushStatus(
        t("auth_relink_token_invalid", "Invalid Spoke Relink Token format. Expected SRK1.<uuid>.<secret>."),
        "warning"
      );
      return;
    }
    setClaimingRelink(true);
    try {
      const { data, error } = await supabaseAuth.rpc("claim_severed_spoke_profile", {
        p_legacy_uuid: parsed.legacyUuid,
        p_claim_secret: parsed.claimSecret,
      });
      if (error) throw error;
      if (data?.role) {
        useStore.getState().setUserRole(String(data.role));
      }
      setRelinkTokenInput("");
      useStore.getState().pushStatus(
        t(
          "spoke_relink_claim_success",
          "Legacy Spoke profile, {Mason} studio, and {Blueprints} cryptographically relinked!"
        ),
        "success"
      );
    } catch (err: any) {
      useStore.getState().pushStatus(
        err?.message || t("spoke_relink_claim_fail", "Failed to verify Spoke Relink Token."),
        "error"
      );
    } finally {
      setClaimingRelink(false);
    }
  };

  const passkeyCardSubtitle =
    isElevatedRole && passkeys.length === 0
      ? t("auth_passkey_required_card_sub", "Action Required: FIDO2 Passkey Needed for Role")
      : factors.length > 0
        ? t("auth_passkey_active_summary", "Active Passkeys: {0} • 2FA Apps: {1}")
          .replace("{0}", String(passkeys.length))
          .replace("{1}", String(totpFactors.length))
        : t("auth_passkey_2fa_subtitle", "Manage FIDO2 Passkeys and Authenticator Apps");

  const activeTabFactors = mfaEnrollTab === "passkey" ? passkeys : totpFactors;
  const isPasskeyFormOpen = showAddPasskeyForm || passkeys.length === 0;
  const passkeyActionNeeded = Boolean(session?.user?.id && isElevatedRole && passkeys.length === 0);

  return (
    <>
      <div className="flex flex-col gap-12 w-full pb-32">
        <TabContainer title={t("settings_auth_title", "Identity & Security")} icon={t("icon_lock", "lock")}>
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={passkeyActionNeeded}
              icon={
                passkeyActionNeeded
                  ? t("icon_passkey", "passkey")
                  : t("icon_verified_user", "verified_user")
              }
              accentVar={passkeyActionNeeded ? "var(--warning)" : "var(--accent)"}
              iconColorClass={
                passkeyActionNeeded ? "text-[var(--warning)]" : "text-[var(--accent)]"
              }
              badgeIcon={t("icon_shield", "shield")}
              badgeLabel={
                !session?.user?.id
                  ? t("auto_guest_mode_active_45", "Guest Mode Active")
                  : isCurrentEmailBlinded
                    ? t("auth_blind_email_badge", "Blinded Email Alias")
                    : t("settings_zero_pii_badge", "Zero-PII")
              }
              overline={t("settings_identity_guide_overline", "Sovereign Account Security")}
              title={
                passkeyActionNeeded
                  ? t("auth_passkey_required_card_sub", "Action Required: FIDO2 Passkey Needed for Role")
                  : t("settings_identity_guide_title", "Blinded Identity & Passkey Protection")
              }
              description={t(
                "settings_identity_guide_desc",
                "Your account supports client-side 600k-iteration PBKDF2 Blinded Email Aliases, FIDO2 Hardware/Phone Passkeys, and cryptographic Spoke Relink Tokens—syncing across rigs without exposing personal identifiers."
              )}
              actionLabel={
                !session?.user?.id
                  ? t("btn_sign_in", "Sign In")
                  : passkeyActionNeeded
                    ? t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")
                    : undefined
              }
              actionIcon={
                !session?.user?.id
                  ? t("icon_login", "login")
                  : t("icon_passkey", "passkey")
              }
              actionVariant={passkeyActionNeeded ? "warning" : "glass"}
              onAction={
                !session?.user?.id
                  ? () => openSanctuaryLogin()
                  : passkeyActionNeeded
                    ? () => {
                      resetSecurityInputs();
                      setActivePanel("2fa");
                    }
                    : undefined
              }
            />

            {session?.user?.id && (
              <>
                <UniversalCard
                  headerStyle="inline"
                  title={t("auth_user_id", "System ID")}
                  subtitle={t("auth_user_id_desc", "Your permanent system identifier on the Sanctuary Network.")}
                  icon={t("icon_badge", "badge")}
                  onClick={() => {
                    resetSecurityInputs();
                    setActivePanel("system_id");
                  }}
                />

                <UniversalCard
                  headerStyle="inline"
                  title={t("auth_email", "Update Email")}
                  subtitle={
                    session?.user?.email
                      ? isCurrentEmailBlinded
                        ? `${t("auth_blind_email_active_badge", "Blinded Email Alias")} • ${maskEmailAddress(session.user.email)}`
                        : maskEmailAddress(session.user.email)
                      : t("path_not_set", "Not Set")
                  }
                  icon={isCurrentEmailBlinded ? t("icon_visibility_off", "visibility_off") : t("icon_mail", "mail")}
                  isActive={Boolean(isCurrentEmailBlinded)}
                  onClick={() => {
                    resetSecurityInputs();
                    setActivePanel("email");
                  }}
                />

                <UniversalCard
                  headerStyle="inline"
                  title={t("auth_password", "Update Password")}
                  subtitle={`${t("auth_zk_password_badge", "600k PBKDF2 + Bcrypt")} • ••••••••`}
                  icon={t("icon_key", "key")}
                  onClick={() => {
                    resetSecurityInputs();
                    setActivePanel("password");
                  }}
                />

                <UniversalCard
                  headerStyle="inline"
                  title={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
                  subtitle={passkeyCardSubtitle}
                  icon={passkeys.length > 0 ? t("icon_passkey", "passkey") : t("icon_gpp_good", "gpp_good")}
                  isActive={passkeys.length > 0 || totpFactors.length > 0}
                  statusColor={passkeyActionNeeded ? "warning" : undefined}
                  onClick={() => {
                    resetSecurityInputs();
                    setActivePanel("2fa");
                  }}
                />
              </>
            )}
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 2: Network & Privacy */}
        <TabContainer
          title={t("prefs_section_privacy", "Network & Privacy")}
          icon={t("icon_security", "security")}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={Boolean(localOnly)}
              icon={
                localOnly
                  ? t("icon_wifi_off", "wifi_off")
                  : t("icon_enhanced_encryption", "enhanced_encryption")
              }
              accentVar={localOnly ? "var(--warning)" : "var(--accent)"}
              iconColorClass={localOnly ? "text-[var(--warning)]" : "text-[var(--accent)]"}
              badgeIcon={
                localOnly
                  ? t("icon_cloud_off", "cloud_off")
                  : t("icon_verified_user", "verified_user")
              }
              badgeLabel={
                localOnly
                  ? t("offline", "Offline")
                  : t("settings_zero_pii_badge", "Zero-PII")
              }
              overline={t("settings_privacy_guide_overline", "Zero-Knowledge Architecture")}
              title={
                localOnly
                  ? t("settings_offline_mode_active", "Strict Air-Gapped Offline Mode Active")
                  : t("settings_privacy_guide_title", "Zero-PII Sync & Threat Telemetry")
              }
              description={t(
                "settings_privacy_guide_desc",
                "All cross-device Rig Beams, Supporter perks, and Notification states are encrypted locally with AES-256-GCM behind blind SHA-256 tokens before touching the network. Enable Local Network Only at any time to sever all cloud traffic."
              )}
              actionLabel={
                localOnly
                  ? t("settings_reconnect_network", "Reconnect Cloud Network")
                  : undefined
              }
              actionIcon={t("icon_wifi", "wifi")}
              actionVariant="warning"
              onAction={localOnly ? toggleLocalOnly : undefined}
            />

            <UniversalCard
              headerStyle="inline"
              title={t("local_only", "Local Network Only")}
              subtitle={t(
                "local_only_desc",
                "ON: Blocks all external cloud uploads and downloads (strict offline airgap).\nOFF: Syncs normally over encrypted Zero-PII channels."
              )}
              icon={t("icon_wifi_off", "wifi_off")}
              isActive={Boolean(localOnly)}
              statusColor={localOnly ? "warning" : undefined}
              onClick={toggleLocalOnly}
              actions={<SettingsToggle checked={localOnly} />}
            />

            <div className="relative group/malware flex">
              <UniversalCard
                headerStyle="inline"
                className="w-full"
                title={t("malware_share_title", "Share Malware Reports")}
                subtitle={t(
                  "malware_share_on_off_desc",
                  "ON: Sends anonymous, metadata-only quarantine hashes to Sanctuary security.\nOFF: Keeps malware detections strictly local."
                )}
                icon={t("icon_security", "security")}
                isActive={Boolean(shareMalwareReports && !isBanned && !localOnly)}
                onClick={() => {
                  if (isBanned || localOnly) return;
                  const val = !shareMalwareReports;
                  setShareMalwareReports(val);
                  localStorage.setItem("sanctuary_share_malware_reports", val.toString());
                }}
                actions={
                  <div className={`${isBanned || localOnly ? "opacity-40 grayscale cursor-not-allowed" : ""}`}>
                    <SettingsToggle checked={Boolean(shareMalwareReports && !localOnly)} />
                  </div>
                }
              />
              {isBanned && (
                <HoverTooltip
                  title={t("access_denied", "Access Denied")}
                  subtitle={`Communications Ban: ${banReason}`}
                  variant="danger"
                  className="group-hover/malware:flex group-hover/malware:opacity-100"
                />
              )}
            </div>

            <div className="relative group/companion flex">
              <UniversalCard
                headerStyle="inline"
                className="w-full"
                title={t("companion_sync_title", "Mobile Companion Cloud Sync")}
                subtitle={t(
                  "companion_sync_on_off_desc",
                  "ON: Uploads encrypted {Vault} & {Blueprint} status snapshots for your paired mobile companion.\nOFF: Keeps all {Vault} and {Blueprint} activity strictly local."
                )}
                icon={t("icon_devices", "devices")}
                isActive={Boolean(companionSyncEnabled && session && !isBanned && !localOnly)}
                onClick={() => {
                  if (!session || isBanned || localOnly) return;
                  const val = !companionSyncEnabled;
                  setCompanionSyncEnabled(val);
                  localStorage.setItem("sanctuary_cloud_companion_sync", val.toString());
                }}
                actions={
                  <div className={`${!session || isBanned || localOnly ? "opacity-40 grayscale cursor-not-allowed" : ""}`}>
                    <SettingsToggle checked={Boolean(companionSyncEnabled && session && !localOnly)} />
                  </div>
                }
              />
              {(!session || isBanned) && (
                <HoverTooltip
                  title={t("access_denied", "Access Denied")}
                  subtitle={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45", "Guest Mode Active")}
                  variant="danger"
                  className="group-hover/companion:flex group-hover/companion:opacity-100"
                />
              )}
            </div>
          </SettingsGrid>
        </TabContainer>

        {/* SECTION 3: Browser & Controls */}
        <TabContainer
          title={t("settings_browser_controls_section", "Browser & Controls")}
          icon={t("icon_keyboard_command_key", "keyboard_command_key")}
        >
          <SettingsGrid>
            <LiquidGlassAlertCard
              isAlertCard={false}
              icon={t("icon_keyboard_command_key", "keyboard_command_key")}
              accentVar="var(--accent)"
              iconColorClass="text-[var(--accent)]"
              badgeIcon={t("icon_sports_esports", "sports_esports")}
              badgeLabel={t("os_label", "Core OS")}
              overline={t("settings_controls_guide_overline", "Client Navigation & Input")}
              title={t("settings_controls_guide_title", "Browser, Hotkeys & Gamepad")}
              description={t(
                "settings_controls_guide_desc",
                "Configure whether {Mod} download links open in Sanctuary's built-in browser or your default web browser, and customize keyboard shortcuts or Steam Deck / controller input bindings."
              )}
            />

            {isDesktop() && (
              <UniversalCard
                headerStyle="inline"
                title={t("settings_use_internal_browser", "Use the Sanctuary Browser")}
                subtitle={t(
                  "use_internal_browser_on_off_desc",
                  "ON: Opens supported {Mod} download pages in Sanctuary's built-in browser.\nOFF: Opens links in your default browser with your extensions and adblockers."
                )}
                icon={t("icon_language", "language")}
                isActive={Boolean(useInternalBrowser)}
                onClick={() => setUseInternalBrowser(!useInternalBrowser)}
                actions={<SettingsToggle checked={useInternalBrowser} />}
              />
            )}

            <UniversalCard
              headerStyle="inline"
              title={t("cmd_palette_controls_title", "Hotkeys & Controller Mapping")}
              subtitle={t(
                "cmd_palette_controls_sub",
                "Customize Keyboard Shortcuts & Gamepad / Steam Deck Input Bindings"
              )}
              icon={t("icon_sports_esports", "sports_esports")}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("sanctuary-open-command-palette", {
                    detail: { openControls: true },
                  })
                );
              }}
              footer={
                <ActionButton
                  variant="glass"
                  icon={t("icon_keyboard_command_key", "keyboard_command_key")}
                  label={t("settings_open_keybinds", "Configure Shortcuts & Gamepad")}
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("sanctuary-open-command-palette", {
                        detail: { openControls: true },
                      })
                    );
                  }}
                  className="w-full justify-center"
                />
              }
            />
          </SettingsGrid>
        </TabContainer>
      </div>

      {/* EMAIL SIDEPANEL */}
      <CoreSecuritySidePanels
        t={t}
        session={session}
        emailInput={emailInput}
        setEmailInput={setEmailInput}
        blindEmailOnSave={blindEmailOnSave}
        setBlindEmailOnSave={setBlindEmailOnSave}
        currentPasswordInput={currentPasswordInput}
        setCurrentPasswordInput={setCurrentPasswordInput}
        passwordInput={passwordInput}
        setPasswordInput={setPasswordInput}
        confirmPasswordInput={confirmPasswordInput}
        setConfirmPasswordInput={setConfirmPasswordInput}
        pendingUnenrollFactorId={pendingUnenrollFactorId}
        setPendingUnenrollFactorId={setPendingUnenrollFactorId}
        authLoading={authLoading}
        relinkTokenInput={relinkTokenInput}
        setRelinkTokenInput={setRelinkTokenInput}
        claimingRelink={claimingRelink}
        activePanel={activePanel}
        factors={factors}
        passkeys={passkeys}
        totpFactors={totpFactors}
        loading2FA={loading2FA}
        mfaEnrollTab={mfaEnrollTab}
        setMfaEnrollTab={setMfaEnrollTab}
        setShowAddPasskeyForm={setShowAddPasskeyForm}
        qrCode={qrCode}
        totpSecret={totpSecret}
        verifyCode={verifyCode}
        setVerifyCode={setVerifyCode}
        enrollError={enrollError}
        enrolling={enrolling}
        passkeyNameInput={passkeyNameInput}
        setPasskeyNameInput={setPasskeyNameInput}
        enrollPasswordInput={enrollPasswordInput}
        setEnrollPasswordInput={setEnrollPasswordInput}
        registeringPasskey={registeringPasskey}
        verifyingStepUp={verifyingStepUp}
        passkeyError={passkeyError}
        setPasskeyError={setPasskeyError}
        citizenPolicy={citizenPolicy}
        savingPolicy={savingPolicy}
        isElevatedRole={isElevatedRole}
        requiresPasskeyStepUp={requiresPasskeyStepUp}
        isCurrentEmailBlinded={isCurrentEmailBlinded}
        blindEmailPreview={blindEmailPreview}
        generatedKeyPreview={generatedKeyPreview}
        setGeneratedKeyPreview={setGeneratedKeyPreview}
        handleClosePanel={handleClosePanel}
        loadFactors={loadFactors}
        handlePasskeyStepUp={handlePasskeyStepUp}
        handleRegisterPasskey={handleRegisterPasskey}
        startEnrollment={startEnrollment}
        cancelEnrollment={cancelEnrollment}
        verifyEnrollment={verifyEnrollment}
        confirmUnenrollFactor={confirmUnenrollFactor}
        handleToggleCitizenPolicy={handleToggleCitizenPolicy}
        handleGenerateSovereignKey={handleGenerateSovereignKey}
        updateAuth={updateAuth}
        handleCopySystemId={handleCopySystemId}
        handleCopyRelinkToken={handleCopyRelinkToken}
        handleClaimLegacySpokeProfile={handleClaimLegacySpokeProfile}
        activeTabFactors={activeTabFactors}
        isPasskeyFormOpen={isPasskeyFormOpen}
      />
    </>
  );
}
