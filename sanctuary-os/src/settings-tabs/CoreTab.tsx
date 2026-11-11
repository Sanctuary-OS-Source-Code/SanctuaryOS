import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { supabase, supabaseAuth } from "../supabase";
import { TabContainer, SettingsGrid } from "./shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import {
  fetchMfaSecurityState,
  registerFidoPasskey,
  authenticateFidoPasskey,
  deleteSecurityFactor,
  verifyPasswordWithoutSessionDowngrade,
  isElevatedRoleRequiringPasskey,
  isNativeLocalPasskeySupported,
  notifyMfaStateChanged,
  maskEmailAddress,
  sanitizeFactorFriendlyName,
  isBlindedEmailAddress,
  deriveBlindedEmailAlias,
  generateSovereignRecoveryKey,
  getCitizenSecurityPolicy,
  updateCitizenSecurityPolicy,
  updateUserCredentialsZeroKnowledge,
  CitizenSecurityPolicy,
} from "../utils/passkeyUtils";
import {
  CompanionPasskeyHandshakeRequester,
} from "../components/ElevatedPasskeyGate";

export default function CoreTab({ updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const { session, userRole, osRole, activeWorkspaceId } = useStore(
    useShallow((s) => ({
      session: s.session,
      userRole: s.userRole,
      osRole: s.osRole,
      activeWorkspaceId: s.activeWorkspaceId,
    }))
  );
  const [emailInput, setEmailInput] = useState("");
  const [blindEmailOnSave, setBlindEmailOnSave] = useState<boolean>(() =>
    Boolean(session?.user?.email && isBlindedEmailAddress(session.user.email))
  );
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [pendingUnenrollFactorId, setPendingUnenrollFactorId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<"email" | "password" | "system_id" | "2fa" | null>(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sanctuary_open_2fa_panel") === "true") {
      localStorage.removeItem("sanctuary_open_2fa_panel");
      return "2fa";
    }
    return null;
  });

  const [factors, setFactors] = useState<any[]>([]);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [totpFactors, setTotpFactors] = useState<any[]>([]);
  const [isPasskeyVerified, setIsPasskeyVerified] = useState(false);
  const [isVerifiedMason, setIsVerifiedMason] = useState(false);
  const [loading2FA, setLoading2FA] = useState(true);
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
    getCitizenSecurityPolicy(session, false, false)
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
      .catch(() => {});
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

  const handlePasskeyStepUp = async () => {
    setVerifyingStepUp(true);
    setPasskeyError("");
    const { error } = await authenticateFidoPasskey(passkeys[0]?.id);
    if (error) {
      setPasskeyError(formatPasskeyError(error.message));
      setVerifyingStepUp(false);
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
        issuer: "Sanctuary OS",
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
    } catch {}
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

  const handleAutoDetect = async () => {
    try {
      const activeGameSchema = useStore.getState().activeGameSchema;
      const detected: any = await invoke("auto_detect_paths", { gameSchema: activeGameSchema });
      const patch: Record<string, string> = {};
      if (detected?.live_path) patch.live_path = detected.live_path;
      if (detected?.mods_path) patch.mods_path = detected.mods_path;
      if (detected?.docs_path || detected?.user_data_path) {
        patch.docs_path = detected.docs_path || detected.user_data_path;
      }
      const currentVaultVal = pathMap?.find((p: any) => p.rustKey === "vault_path")?.value;
      if (detected?.vault_path && (!currentVaultVal || currentVaultVal === "web")) {
        patch.vault_path = detected.vault_path;
      }
      if (Object.keys(patch).length > 0) {
        await updateConfig(patch);
      }
      if (detected?.live_path || detected?.mods_path || detected?.docs_path || detected?.user_data_path) {
        useStore.getState().pushStatus(
          t("settings_auto_detect_success", "Paths Auto-Detected Successfully!"),
          "success"
        );
      } else {
        useStore.getState().pushStatus(
          t("settings_auto_detect_fail", "Failed to auto-detect paths."),
          "warning"
        );
      }
    } catch {
      useStore.getState().pushStatus(
        t("settings_auto_detect_fail", "Failed to auto-detect paths."),
        "error"
      );
    }
  };

  const handleCopySystemId = () => {
    navigator.clipboard.writeText(session?.user?.id || "");
    useStore.getState().pushStatus(
      t("auto_copied_to_clipboard_45", "Copied to clipboard!"),
      "success"
    );
  };

  const renderPath = (dir: any) => {
    const obfuscatePath = (p: string) =>
      p
        ? p
            .replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (_match, p1) => {
              const parts = p1.split("\\");
              parts[2] = "***";
              return parts.join("\\");
            })
            .replace(/^(\/(?:home|Users)\/)[^/]+/, "$1***")
        : t("path_not_set", "Not Set");

    return (
      <UniversalCard
        key={dir.rustKey}
        title={dir.label}
        subtitle={obfuscatePath(dir.value)}
        description={
          dir.isUniversal
            ? t(
                "vault_universal_desc",
                "Universal Master {Vault} directory shared across the Hub (Themes & Lexicons) and all Spoke workspaces."
              )
            : undefined
        }
        bannerTopLabel={
          dir.isUniversal
            ? t("vault_universal_badge", "Universal Hub & Spokes")
            : undefined
        }
        bannerBottomLabel={dir.isUniversal ? obfuscatePath(dir.value) : undefined}
        icon={dir.icon || t("icon_folder", "folder")}
        onClick={() => pickPath(dir.rustKey, dir.label)}
        footer={
          <ActionButton
            variant="glass"
            icon={t("icon_sync", "sync")}
            label={t("btn_calibrate", "Select Folder")}
            className="w-full justify-center pointer-events-none"
          />
        }
      />
    );
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

  return (
    <>
      <div className="flex flex-col gap-30 w-full pb-48">
        <TabContainer title={t("settings_auth_title", "Identity & Security")} icon={t("icon_lock", "lock")}>
          <SettingsGrid>
            {session?.user?.id && (
              <UniversalCard
                title={t("auth_user_id", "System ID")}
                subtitle={t("auth_user_id_desc", "Your permanent system identifier on the Sanctuary Network.")}
                icon={t("icon_badge", "badge")}
                onClick={() => {
                  resetSecurityInputs();
                  setActivePanel("system_id");
                }}
              />
            )}

            <UniversalCard
              title={t("auth_email", "Update Email")}
              subtitle={
                session?.user?.email
                  ? isCurrentEmailBlinded
                    ? `${t("auth_blind_email_active_badge", "Blinded Email Alias")} • ${maskEmailAddress(session.user.email)}`
                    : maskEmailAddress(session.user.email)
                  : t("path_not_set", "Not Set")
              }
              icon={isCurrentEmailBlinded ? t("icon_visibility_off", "visibility_off") : t("icon_mail", "mail")}
              onClick={() => {
                resetSecurityInputs();
                setActivePanel("email");
              }}
            />

            <UniversalCard
              title={t("auth_password", "Update Password")}
              subtitle={`${t("auth_zk_password_badge", "600k PBKDF2 + Bcrypt")} • ••••••••`}
              icon={t("icon_key", "key")}
              onClick={() => {
                resetSecurityInputs();
                setActivePanel("password");
              }}
            />

            <UniversalCard
              title={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
              subtitle={passkeyCardSubtitle}
              icon={passkeys.length > 0 ? t("icon_passkey", "passkey") : t("icon_gpp_good", "gpp_good")}
              onClick={() => {
                resetSecurityInputs();
                setActivePanel("2fa");
              }}
            />
          </SettingsGrid>
        </TabContainer>

        {isDesktop() && (
          <>
            <TabContainer
              title={t("vault_path", "The {Vault} Path")}
              icon={t("icon_account_balance", "account_balance")}
            >
              <SettingsGrid>
                {pathMap?.filter((dir: any) => dir.rustKey === "vault_path").map(renderPath)}
              </SettingsGrid>
            </TabContainer>

            <TabContainer
              title={t("sys_coords", "System Coordinates")}
              icon={t("icon_push_pin", "push_pin")}
            >
              <SettingsGrid>
                {pathMap?.filter((dir: any) => dir.rustKey !== "vault_path").map(renderPath)}
                <UniversalCard
                  title={t("auto_detect", "Auto Detect")}
                  subtitle={t("auto_detect_desc", "Automatically scan your system to detect and configure your game installation, save files, and {vault} paths.")}
                  icon={t("icon_troubleshoot", "troubleshoot")}
                  onClick={handleAutoDetect}
                  footer={
                    <ActionButton
                      variant="glass"
                      icon={t("icon_troubleshoot", "troubleshoot")}
                      label={t("auto_detect", "Auto Detect")}
                      className="w-full justify-center pointer-events-none"
                    />
                  }
                />
              </SettingsGrid>
            </TabContainer>
          </>
        )}
      </div>

      {/* EMAIL SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === "email"}
        onClose={handleClosePanel}
        title={t("auth_email", "Update Email")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_mail", "mail")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[600px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("btn_update", "Update")}
              disabled={
                authLoading ||
                !currentPasswordInput ||
                (!emailInput.trim() && (isCurrentEmailBlinded || !blindEmailOnSave))
              }
              onClick={() => updateAuth("email")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              isCurrentEmailBlinded
                ? t("icon_visibility_off", "visibility_off")
                : t("icon_verified_user", "verified_user")
            }
            overline={
              isCurrentEmailBlinded
                ? t("auth_blind_email_active_badge", "Blinded Email Alias")
                : t("auth_email_current_label", "Current Bound Email")
            }
            title={maskEmailAddress(session?.user?.email) || t("path_not_set", "Not Set")}
            description={t(
              "auth_email_update_desc",
              "Update the email address associated with your Sanctuary account."
            )}
            variant={isCurrentEmailBlinded ? "success" : "accent"}
          />

          <UniversalGroup
            title={t("auth_email", "Update Email")}
            icon={t("icon_mail", "mail")}
            headerAction={
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_shield", "shield")}
                </span>
                <span>{t("auth_blind_email_badge", "Blinded Email Alias")}</span>
              </span>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateAuth("email");
              }}
              className="flex flex-col gap-3.5"
            >
              <div
                onClick={() => setBlindEmailOnSave((v) => !v)}
                className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-2.5 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_visibility_off", "visibility_off")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-black text-[var(--text)]">
                        {t("auth_blind_email_toggle_title", "Blinded Email Alias (No Plaintext Email Stored)")}
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
                    aria-checked={blindEmailOnSave}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBlindEmailOnSave((v) => !v);
                    }}
                    className={`sa-glass-toggle shrink-0 ${blindEmailOnSave ? "is-on" : ""}`}
                  >
                    <span className="sa-glass-toggle-thumb" />
                  </button>
                </div>

                {blindEmailOnSave && blindEmailPreview && (
                  <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("auth_blind_email_active_badge", "Blinded Email Alias")}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[var(--accent)] truncate">
                      {maskEmailAddress(blindEmailPreview)}
                    </span>
                  </div>
                )}

                <div
                  className={`pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-start gap-2 text-[11px] font-medium leading-relaxed ${
                    blindEmailOnSave ? "text-[var(--warning)]" : "text-[var(--subtext)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[15px] shrink-0 mt-0.5">
                    {blindEmailOnSave
                      ? t("icon_warning", "warning")
                      : t("icon_info", "info")}
                  </span>
                  <span>
                    {blindEmailOnSave
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("auth_email_new_label", "New Email Address")}
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={
                      !isCurrentEmailBlinded && blindEmailOnSave && session?.user?.email
                        ? maskEmailAddress(session.user.email)
                        : t("auth_email_placeholder", "name@example.com")
                    }
                    className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("auth_current_password_label", "Current Password (Required)")}
                  </label>
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder={t("auth_current_password_ph", "Enter your current password to verify...")}
                    autoComplete="current-password"
                    className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>

              <ActionButton
                type="submit"
                disabled={
                  authLoading ||
                  !currentPasswordInput ||
                  (!emailInput.trim() && (isCurrentEmailBlinded || !blindEmailOnSave))
                }
                variant="glass"
                icon={
                  !emailInput.trim() && !isCurrentEmailBlinded && blindEmailOnSave
                    ? t("icon_visibility_off", "visibility_off")
                    : t("icon_save", "save")
                }
                label={
                  !emailInput.trim() && !isCurrentEmailBlinded && blindEmailOnSave
                    ? t("auth_blind_email_btn_convert", "Blind & Shred Server Email")
                    : t("btn_update", "Update")
                }
                className="w-full"
              />
            </form>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* PASSWORD SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === "password"}
        onClose={handleClosePanel}
        title={t("auth_password", "Update Password")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_key", "key")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[600px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("btn_update", "Update")}
              disabled={authLoading || passwordInput.length < 8 || !confirmPasswordInput || !currentPasswordInput}
              onClick={() => updateAuth("password")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_lock", "lock")}
            overline={t("auth_zk_password_badge", "600k PBKDF2 + Bcrypt")}
            title={t("auth_password", "Update Password")}
            description={t(
              "auth_zk_password_active_desc",
              "Passwords are stretched on-device (600,000-iteration PBKDF2-HMAC-SHA256) before transmission and bcrypt-hashed by the server—your plaintext password is never transmitted."
            )}
            variant="accent"
          />

          <UniversalGroup
            title={t("auth_password", "Update Password")}
            icon={t("icon_key", "key")}
            headerAction={
              <button
                type="button"
                onClick={handleGenerateSovereignKey}
                className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] cursor-pointer transition-all`}
              >
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_vpn_key", "vpn_key")}
                </span>
                <span>{t("auth_sovereign_key_btn_generate", "Generate 256-Bit Key & Copy")}</span>
              </button>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateAuth("password");
              }}
              className="flex flex-col gap-3.5"
            >
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                  {t("auth_current_password_label", "Current Password (Required)")}
                </label>
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  placeholder={t("auth_current_password_ph", "Enter your current password to verify...")}
                  autoComplete="current-password"
                  autoFocus
                  className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("auth_recovery_new_password_label", "New Password (Min. 8 Characters)")}
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (generatedKeyPreview && e.target.value !== generatedKeyPreview) {
                        setGeneratedKeyPreview("");
                      }
                    }}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                    {t("auth_confirm_new_password_label", "Confirm New Password")}
                  </label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder={t("auth_confirm_new_password_ph", "Re-enter new password...")}
                    autoComplete="new-password"
                    minLength={8}
                    className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>

              <ActionButton
                type="submit"
                disabled={authLoading || passwordInput.length < 8 || !confirmPasswordInput || !currentPasswordInput}
                variant="glass"
                icon={t("icon_save", "save")}
                label={t("btn_update", "Update")}
                className="w-full"
              />
            </form>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* SYSTEM ID SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === "system_id"}
        onClose={handleClosePanel}
        title={t("auth_user_id", "System ID")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_badge", "badge")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[580px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("btn_copy", "Copy")}
              onClick={handleCopySystemId}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_fingerprint", "fingerprint")}
            overline={t("auth_user_id_card_badge", "Verified Account Identifier")}
            title={t("auth_user_id", "System ID")}
            description={t("auth_user_id_desc", "Your permanent system identifier on the Sanctuary Network.")}
            variant="accent"
          />

          <SidePanelTitleInput
            readOnly
            value={session?.user?.id || ""}
            label={t("auth_user_id", "System ID")}
            icon={t("icon_fingerprint", "fingerprint")}
          />

          <UniversalGroup
            title={t("auth_user_id_info_title", "How Your System ID Works")}
            icon={t("icon_info", "info")}
          >
            <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
              {t(
                "auth_user_id_info_desc",
                "Your System ID uniquely identifies your Sanctuary account across support tickets, cloud backups, and supporter pass verification without exposing your personal email."
              )}
            </p>
            <ActionButton
              onClick={handleCopySystemId}
              variant="glass"
              icon={t("icon_content_copy", "content_copy")}
              label={t("btn_copy", "Copy")}
              className="w-full"
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* PASSKEYS & 2FA SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === "2fa"}
        onClose={handleClosePanel}
        title={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
        subtitle={t("auth_passkey_2fa_subtitle", "Manage FIDO2 Passkeys and Authenticator Apps")}
        icon={t("icon_passkey", "passkey")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              passkeys.length > 0
                ? t("icon_passkey", "passkey")
                : factors.length > 0
                  ? t("icon_verified_user", "verified_user")
                  : t("icon_shield", "shield")
            }
            overline={
              passkeys.length > 0
                ? t("auth_passkey_status_active", "FIDO2 Passkey Protection Active")
                : factors.length > 0
                  ? t("auth_2fa_status_enabled", "Two-Factor Protection Active")
                  : t("auth_2fa_status_disabled", "Two-Factor Protection Inactive")
            }
            title={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
            description={
              isElevatedRole
                ? t("auth_passkey_policy_elevated_desc", "Verified {Masons}, Architects, Oversight, Wayfinders, and Keepers must maintain at least one active FIDO2 Passkey to access elevated hubs.")
                : t(
                    "auth_passkey_policy_citizen_desc",
                    "Passkeys are optional for standard accounts, but strongly recommended for phishing-resistant security."
                  )
            }
            badge={`${factors.length}`}
            variant={
              passkeys.length > 0
                ? "success"
                : isElevatedRole
                  ? "warning"
                  : "accent"
            }
          />

          {loading2FA ? (
            <div className="glass-panel rounded-2xl p-6 text-center text-[var(--subtext)] font-black tracking-widest text-xs border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              {t("status_loading_security", "Loading Security Status...")}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_passkey", "passkey")}
                  label={t("auth_passkey_badge_fido", "FIDO2 Passkey")}
                  value={t("passkey_stat_enrolled_count", "{0} Enrolled").replace(
                    "{0}",
                    String(passkeys.length)
                  )}
                  subValue={t("passkey_tile_fido_sub", "Biometrics, Password Managers & USB Keys")}
                  isActive={mfaEnrollTab === "passkey"}
                  onClick={() => setMfaEnrollTab("passkey")}
                />
                <DashboardStatTile
                  variant="filter"
                  icon={t("icon_qr_code_scanner", "qr_code_scanner")}
                  label={t("passkey_tile_totp_title", "Authenticator App")}
                  value={t("passkey_stat_enrolled_count", "{0} Enrolled").replace(
                    "{0}",
                    String(totpFactors.length)
                  )}
                  subValue={t("passkey_tile_totp_sub", "6-Digit Code Generator Backup")}
                  isActive={mfaEnrollTab === "totp"}
                  onClick={() => setMfaEnrollTab("totp")}
                />
              </div>

              {requiresPasskeyStepUp && (
                <div className="flex flex-col gap-3.5">
                  {isNativeLocalPasskeySupported() && (
                    <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col shrink-0">
                      <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_lock", "lock")}
                            </span>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                            {t(
                              "auth_passkey_stepup_required_title",
                              "Existing Passkey Verification Required"
                            )}
                          </span>
                        </div>
                        <span
                          className={`${VAULT_CHIP_CLASS} shrink-0 !border-[color-mix(in_srgb,var(--warning)_38%,transparent)]`}
                        >
                          <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                            {t("icon_lock", "lock")}
                          </span>
                          <span>{t("auth_passkey_stepup_locked_badge", "Step-Up Locked")}</span>
                        </span>
                      </div>

                      <div className="p-4 flex flex-col gap-3.5">
                        <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                          {t(
                            "auth_passkey_stepup_required_desc",
                            "Your account already has an active FIDO2 Passkey. To prevent unauthorized credential enrollment from stolen sessions or passwords, you must authenticate with an existing Passkey on this device before adding or modifying security factors."
                          )}
                        </p>

                        {passkeyError && (
                          <div className="px-3.5 py-2.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed flex items-start gap-2">
                            <span className="material-symbols-outlined !text-[16px] shrink-0 mt-0.5">
                              {t("icon_error", "error")}
                            </span>
                            <span>{passkeyError}</span>
                          </div>
                        )}

                        <ActionButton
                          onClick={handlePasskeyStepUp}
                          disabled={verifyingStepUp}
                          variant="glass"
                          icon={t("icon_passkey", "passkey")}
                          label={
                            verifyingStepUp
                              ? t("btn_verifying_passkey", "Verifying Passkey...")
                              : t("btn_verify_with_passkey", "Authenticate with Passkey")
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  <CompanionPasskeyHandshakeRequester
                    targetScope={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
                    autoStart={!isNativeLocalPasskeySupported()}
                    onVerified={loadFactors}
                  />
                </div>
              )}

              {(!requiresPasskeyStepUp || activeTabFactors.length > 0) && (
                <UniversalGroup
                  title={
                    mfaEnrollTab === "passkey"
                      ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                      : t("passkey_tile_totp_title", "Authenticator App")
                  }
                  icon={
                    mfaEnrollTab === "passkey"
                      ? t("icon_passkey", "passkey")
                      : t("icon_qr_code_scanner", "qr_code_scanner")
                  }
                  headerAction={
                    <div className="flex items-center gap-2">
                      <span className={VAULT_CHIP_CLASS}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                          {mfaEnrollTab === "passkey"
                            ? t("icon_passkey", "passkey")
                            : t("icon_qr_code_scanner", "qr_code_scanner")}
                        </span>
                        <span>{activeTabFactors.length}</span>
                      </span>
                      {!requiresPasskeyStepUp &&
                        mfaEnrollTab === "passkey" &&
                        passkeys.length > 0 &&
                        isPasskeyFormOpen && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddPasskeyForm(false);
                              setPasskeyError("");
                            }}
                            className={`${VAULT_CHIP_CLASS} hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] cursor-pointer transition-all`}
                          >
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_close", "close")}
                            </span>
                            <span>{t("close", "Close")}</span>
                          </button>
                        )}
                    </div>
                  }
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeTabFactors.map((f) => {
                      const isPasskey = f.factor_type === "webauthn";
                      const isLastRequiredPasskey =
                        isPasskey && isElevatedRole && passkeys.length <= 1;
                      const isPendingRemoval = pendingUnenrollFactorId === f.id;
                      const displayLabel = sanitizeFactorFriendlyName(
                        f.friendly_name,
                        isPasskey
                          ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                          : t("auth_passkey_badge_totp", "Authenticator App")
                      );

                      return (
                        <div
                          key={f.id}
                          className={`glass-panel rounded-2xl p-3.5 flex flex-col justify-between gap-3 border transition-all ${
                            isPendingRemoval
                              ? "sm:col-span-2 border-[color-mix(in_srgb,var(--accent)_38%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                              <span className="material-symbols-outlined !text-[19px]">
                                {isPasskey
                                  ? t("icon_passkey", "passkey")
                                  : t("icon_qr_code_scanner", "qr_code_scanner")}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-xs md:text-sm font-black text-[var(--text)] truncate leading-snug">
                                {displayLabel}
                              </span>
                              <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 truncate">
                                {`${t("auth_2fa_enrolled_prefix", "Enrolled: ")}${new Date(f.created_at).toLocaleDateString()}`}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 mt-auto">
                            <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                              <span
                                className={`material-symbols-outlined !text-[12px] ${
                                  isLastRequiredPasskey
                                    ? "text-[var(--accent)]"
                                    : "text-[var(--success)]"
                                }`}
                              >
                                {isLastRequiredPasskey
                                  ? t("icon_verified_user", "verified_user")
                                  : t("icon_check_circle", "check_circle")}
                              </span>
                              <span>
                                {isLastRequiredPasskey
                                  ? t("passkey_min_one_required_badge", "Required for Role")
                                  : t("active", "Active")}
                              </span>
                            </span>

                            {requiresPasskeyStepUp && isPasskey ? (
                              <ActionButton
                                onClick={handlePasskeyStepUp}
                                disabled={verifyingStepUp}
                                variant="glass"
                                icon={t("icon_passkey", "passkey")}
                                label={
                                  verifyingStepUp
                                    ? t("btn_verifying_passkey", "Verifying Passkey...")
                                    : t("btn_verify_2fa", "Verify")
                                }
                                className="!px-3 !py-1.5 !text-[10px]"
                              />
                            ) : (
                              <ActionButton
                                onClick={() => {
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
                                  if (isLastRequiredPasskey) {
                                    useStore.getState().pushStatus(
                                      t(
                                        "auth_passkey_last_required_err",
                                        "Elevated roles must keep at least one active FIDO2 Passkey. Register a backup Passkey before removing this one."
                                      ),
                                      "error"
                                    );
                                    return;
                                  }
                                  setPendingUnenrollFactorId(isPendingRemoval ? null : f.id);
                                  setCurrentPasswordInput("");
                                }}
                                disabled={isLastRequiredPasskey || requiresPasskeyStepUp}
                                variant="glass"
                                icon={
                                  isLastRequiredPasskey || requiresPasskeyStepUp
                                    ? t("icon_lock", "lock")
                                    : t("icon_delete", "delete")
                                }
                                label={
                                  requiresPasskeyStepUp
                                    ? t("auth_passkey_stepup_locked_badge", "Step-Up Locked")
                                    : isLastRequiredPasskey
                                      ? t("passkey_min_one_required_badge", "Required for Role")
                                      : isPasskey
                                        ? t("btn_remove_passkey", "Remove Passkey")
                                        : t("btn_disable_2fa", "Disable 2FA")
                                }
                                className="!px-3 !py-1.5 !text-[10px]"
                              />
                            )}
                          </div>

                          {isPendingRemoval && (
                            <form
                              onSubmit={confirmUnenrollFactor}
                              className="pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2.5 animate-in fade-in duration-200"
                            >
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                  type="password"
                                  value={currentPasswordInput}
                                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                                  placeholder={t(
                                    "auth_current_password_ph",
                                    "Enter your current password to verify..."
                                  )}
                                  autoComplete="current-password"
                                  autoFocus
                                  className="flex-1 glass-surface rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                                />
                                <div className="flex items-center gap-2 shrink-0">
                                  <ActionButton
                                    type="button"
                                    onClick={() => {
                                      setPendingUnenrollFactorId(null);
                                      setCurrentPasswordInput("");
                                    }}
                                    variant="glass"
                                    icon={t("icon_close", "close")}
                                    label={t("cancel", "Cancel")}
                                    className="!px-3 !py-2 !text-[10px]"
                                  />
                                  <ActionButton
                                    type="submit"
                                    disabled={authLoading || !currentPasswordInput}
                                    variant="glass"
                                    icon={t("icon_check", "check")}
                                    label={t("confirm", "Confirm")}
                                    className="!px-3.5 !py-2 !text-[10px]"
                                  />
                                </div>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}

                    {/* Compact Add Card / Inline Enrollment Row */}
                    {!requiresPasskeyStepUp &&
                      (mfaEnrollTab === "passkey" ? (
                        !isPasskeyFormOpen ? (
                        <div
                          onClick={() => {
                            setShowAddPasskeyForm(true);
                            setPasskeyError("");
                          }}
                          className="glass-panel rounded-2xl p-3.5 flex flex-col justify-between gap-3 border border-dashed border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] cursor-pointer transition-all group"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                              <span className="material-symbols-outlined !text-[19px]">
                                {t("icon_add", "add")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-xs md:text-sm font-black text-[var(--text)] truncate leading-snug">
                                {t("auth_btn_add_passkey", "Add Passkey")}
                              </span>
                              <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 line-clamp-1">
                                {t(
                                  "auth_card_add_passkey_sub",
                                  "Windows Hello, Touch ID, 1Password, Bitwarden, or YubiKey"
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 mt-auto">
                            <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                {t("icon_verified_user", "verified_user")}
                              </span>
                              <span>{t("auth_passkey_badge_fido", "FIDO2 Passkey")}</span>
                            </span>
                            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] opacity-80 group-hover:translate-x-0.5 transition-transform">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <form
                          onSubmit={handleRegisterPasskey}
                          className="sm:col-span-2 glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex flex-col gap-3 animate-in fade-in duration-200"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined !text-[17px]">
                                  {t("icon_passkey", "passkey")}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-black text-[var(--text)] truncate">
                                  {t(
                                    "auth_passkey_register_section_title",
                                    "Register FIDO2 Passkey (Recommended)"
                                  )}
                                </span>
                                <span className="text-[11px] font-medium text-[var(--subtext)] truncate">
                                  {t(
                                    "auth_card_add_passkey_sub",
                                    "Windows Hello, Touch ID, 1Password, Bitwarden, or YubiKey"
                                  )}
                                </span>
                              </div>
                            </div>

                            {passkeys.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowAddPasskeyForm(false);
                                  setPasskeyError("");
                                }}
                                className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_close", "close")}
                                </span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                                {t("auth_passkey_name_label", "Passkey Device Label")}
                              </label>
                              <input
                                type="text"
                                value={passkeyNameInput}
                                onChange={(e) => setPasskeyNameInput(e.target.value)}
                                placeholder={t(
                                  "auth_passkey_name_placeholder",
                                  "e.g. Windows Hello, MacBook Touch ID, YubiKey 5C..."
                                )}
                                className="w-full glass-surface rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                                {t("auth_current_password_label", "Current Password (Required)")}
                              </label>
                              <input
                                type="password"
                                value={enrollPasswordInput}
                                onChange={(e) => setEnrollPasswordInput(e.target.value)}
                                placeholder={t(
                                  "auth_current_password_ph",
                                  "Enter your current password to verify..."
                                )}
                                autoComplete="current-password"
                                className="w-full glass-surface rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                              />
                            </div>
                          </div>

                          {passkeyError && (
                            <div className="px-3 py-2 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed flex items-start gap-2">
                              <span className="material-symbols-outlined !text-[15px] shrink-0 mt-0.5">
                                {t("icon_error", "error")}
                              </span>
                              <span>{passkeyError}</span>
                            </div>
                          )}

                          <div className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-snug">
                              {t(
                                "auth_passkey_enroll_password_desc",
                                "Confirm your current account password to authorize registering this FIDO2 Passkey."
                              )}
                            </span>
                            <ActionButton
                              type="submit"
                              disabled={registeringPasskey || !enrollPasswordInput.trim()}
                              variant="glass"
                              icon={t("icon_passkey", "passkey")}
                              label={
                                registeringPasskey
                                  ? t("btn_registering_passkey", "Waiting for Passkey Prompt...")
                                  : t("btn_register_passkey", "Register Passkey")
                              }
                              className="shrink-0 !px-4 !py-2"
                            />
                          </div>
                        </form>
                      )
                    ) : !qrCode ? (
                      <div
                        onClick={() => {
                          if (!enrolling) startEnrollment();
                        }}
                        className="glass-panel rounded-2xl p-3.5 flex flex-col justify-between gap-3 border border-dashed border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] cursor-pointer transition-all group"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                            <span className="material-symbols-outlined !text-[19px]">
                              {t("icon_add", "add")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-xs md:text-sm font-black text-[var(--text)] truncate leading-snug">
                              {t("btn_enroll_totp_app", "Set Up Authenticator App")}
                            </span>
                            <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 line-clamp-1">
                              {t(
                                "auth_card_add_totp_sub",
                                "Google Authenticator, Authy, 1Password, or Bitwarden 6-digit code"
                              )}
                            </span>
                          </div>
                        </div>

                        {enrollError && (
                          <div className="text-[11px] font-bold text-[var(--danger)]">
                            {enrollError}
                          </div>
                        )}

                        <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 mt-auto">
                          <span className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5`}>
                            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                              {t("icon_qr_code_scanner", "qr_code_scanner")}
                            </span>
                            <span>{t("auth_passkey_badge_totp", "Authenticator App")}</span>
                          </span>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] opacity-80 group-hover:translate-x-0.5 transition-transform">
                            {t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="sm:col-span-2 glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] grid grid-cols-1 sm:grid-cols-[128px_1fr] gap-4 items-center animate-in fade-in duration-200">
                        <div className="bg-white p-2.5 rounded-2xl shadow-lg flex items-center justify-center mx-auto sm:mx-0">
                          <img
                            src={
                              qrCode.startsWith("data:")
                                ? qrCode
                                : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`
                            }
                            alt={t("auth_2fa_scan_qr", "Scan QR Code")}
                            className="w-28 h-28 object-contain"
                          />
                        </div>

                        <div className="flex flex-col gap-2.5 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-[var(--text)]">
                                {t("auth_2fa_scan_qr", "Scan QR Code")}
                              </span>
                              <span className="text-[11px] font-medium text-[var(--subtext)]">
                                {t(
                                  "auth_2fa_scan_desc",
                                  "Scan this QR code with your authenticator app."
                                )}
                              </span>
                            </div>
                          </div>

                          {totpSecret && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={totpSecret}
                                className="flex-1 min-w-0 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl px-3 py-1.5 text-[11px] font-mono font-bold text-[var(--text)] outline-none select-all"
                              />
                              <ActionButton
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(totpSecret);
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

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="text"
                              placeholder={t("auth_2fa_placeholder_code", "000000")}
                              value={verifyCode}
                              onChange={(e) => setVerifyCode(e.target.value)}
                              className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl px-3 py-2 text-xs font-mono font-black text-[var(--text)] text-center tracking-[0.28em] focus:outline-none focus:border-[var(--accent)] transition-colors"
                              maxLength={6}
                            />
                            <div className="flex items-center gap-2 shrink-0">
                              <ActionButton
                                type="button"
                                onClick={cancelEnrollment}
                                variant="glass"
                                icon={t("icon_close", "close")}
                                label={t("cancel", "Cancel")}
                                className="!px-3 !py-2 !text-[10px]"
                              />
                              <ActionButton
                                type="button"
                                onClick={verifyEnrollment}
                                disabled={verifyCode.length < 6 || enrolling}
                                variant="glass"
                                icon={t("icon_check", "check")}
                                label={t("btn_verify_2fa", "Verify")}
                                className="!px-3.5 !py-2 !text-[10px]"
                              />
                            </div>
                          </div>

                          {enrollError && (
                            <div className="text-[11px] font-bold text-[var(--danger)]">
                              {enrollError}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </UniversalGroup>
              )}

              {/* Citizen Account Security Lockdown Policy */}
              <UniversalGroup
                title={t("auth_policy_section_title", "{Citizen} Security Lockdown")}
                icon={t("icon_shield_lock", "shield_lock")}
                headerAction={
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_security", "security")}
                    </span>
                    <span>{t("active", "Active")}</span>
                  </span>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 1. Require 2FA / Passkey on Sign-In */}
                  <div
                    onClick={() => {
                      if (factors.length > 0 && !savingPolicy) {
                        handleToggleCitizenPolicy(
                          "enforceLoginMfa",
                          !citizenPolicy.enforceLoginMfa
                        );
                      }
                    }}
                    className={`glass-panel rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 border transition-all ${
                      factors.length === 0
                        ? "opacity-60 cursor-not-allowed border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                        : "cursor-pointer border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_login", "login")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)] leading-snug">
                          {t("auth_policy_login_mfa_title", "Require 2FA / Passkey on Sign-In")}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        disabled={factors.length === 0 || savingPolicy}
                        aria-checked={factors.length > 0 && citizenPolicy.enforceLoginMfa}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (factors.length > 0 && !savingPolicy) {
                            handleToggleCitizenPolicy(
                              "enforceLoginMfa",
                              !citizenPolicy.enforceLoginMfa
                            );
                          }
                        }}
                        className={`sa-glass-toggle shrink-0 ${
                          factors.length > 0 && citizenPolicy.enforceLoginMfa ? "is-on" : ""
                        }`}
                      >
                        <span className="sa-glass-toggle-thumb" />
                      </button>
                    </div>
                    <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_policy_login_mfa_desc",
                        "Block password-only logins; require FIDO2 Passkey or 2FA verification on every new sign-in."
                      )}
                    </p>
                  </div>

                  {/* 2. Per-Session FIDO2 Lockdown (Full Account Gate) */}
                  <div
                    onClick={() => {
                      if (passkeys.length > 0 && !savingPolicy) {
                        handleToggleCitizenPolicy(
                          "enforceSessionLock",
                          !citizenPolicy.enforceSessionLock
                        );
                      }
                    }}
                    className={`glass-panel rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 border transition-all ${
                      passkeys.length === 0
                        ? "opacity-60 cursor-not-allowed border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                        : "cursor-pointer border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] text-[var(--accent)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_lock", "lock")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)] leading-snug">
                          {t("auth_policy_session_lock_title", "Per-Session FIDO2 Lockdown")}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        disabled={passkeys.length === 0 || savingPolicy}
                        aria-checked={passkeys.length > 0 && citizenPolicy.enforceSessionLock}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (passkeys.length > 0 && !savingPolicy) {
                            handleToggleCitizenPolicy(
                              "enforceSessionLock",
                              !citizenPolicy.enforceSessionLock
                            );
                          }
                        }}
                        className={`sa-glass-toggle shrink-0 ${
                          passkeys.length > 0 && citizenPolicy.enforceSessionLock
                            ? "is-on"
                            : ""
                        }`}
                      >
                        <span className="sa-glass-toggle-thumb" />
                      </button>
                    </div>
                    <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_policy_session_lock_desc",
                        "Lock your entire account like an Elevated Hub—requiring a live FIDO2 Passkey or Companion Handshake on every session launch."
                      )}
                    </p>
                  </div>
                </div>
              </UniversalGroup>
            </>
          )}
        </div>
      </SidePanel>
    </>
  );
}
