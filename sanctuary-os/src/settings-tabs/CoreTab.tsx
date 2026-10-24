import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../utils/envUtils";
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
} from "../shared";
import {
  fetchMfaSecurityState,
  registerFidoPasskey,
  deleteSecurityFactor,
  verifyPasswordWithoutSessionDowngrade,
  isElevatedRoleRequiringPasskey,
  notifyMfaStateChanged,
  maskEmailAddress,
  sanitizeFactorFriendlyName,
} from "../utils/passkeyUtils";

export default function CoreTab({ updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const { session, userRole, osRole, activeWorkspaceId } = useStore();
  const [emailInput, setEmailInput] = useState("");
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
  const [isVerifiedMason, setIsVerifiedMason] = useState(false);
  const [loading2FA, setLoading2FA] = useState(true);
  const [mfaEnrollTab, setMfaEnrollTab] = useState<"passkey" | "totp">("passkey");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [passkeyNameInput, setPasskeyNameInput] = useState("");
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");

  const isElevatedRole = isElevatedRoleRequiringPasskey({
    userRole,
    osRole,
    isVerifiedMason,
  });

  const resetSecurityInputs = () => {
    setEmailInput("");
    setCurrentPasswordInput("");
    setPasswordInput("");
    setConfirmPasswordInput("");
    setPendingUnenrollFactorId(null);
    setPasskeyError("");
    setEnrollError("");
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

  const handleRegisterPasskey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRegisteringPasskey(true);
    setPasskeyError("");
    const basePasskeyName = t("auth_passkey_default_name", "FIDO2 Passkey");
    const defaultLabel =
      passkeyNameInput.trim() ||
      (passkeys.length > 0 ? `${basePasskeyName} (${passkeys.length + 1})` : basePasskeyName);

    const { error } = await registerFidoPasskey(defaultLabel);
    if (error) {
      setPasskeyError(formatPasskeyError(error.message));
      setRegisteringPasskey(false);
      return;
    }

    setPasskeyNameInput("");
    setRegisteringPasskey(false);
    useStore.getState().pushStatus(
      t("auth_passkey_enrolled_toast", "FIDO2 Passkey registered and verified!"),
      "success"
    );
    await loadFactors();
  };

  const startEnrollment = async () => {
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
      const baseTotpLabel = t("auth_2fa_authenticator_app", "Authenticator App");
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

  const updateAuth = async (type: "email" | "password") => {
    setAuthLoading(true);
    try {
      if (type === "email") {
        const cleanEmail = emailInput.trim();
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          useStore.getState().pushStatus(
            t("auth_email_invalid_err", "Please enter a valid email address."),
            "error"
          );
          setAuthLoading(false);
          return;
        }
        const verified = await verifyCurrentPassword();
        if (!verified) {
          setAuthLoading(false);
          return;
        }
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabaseAuth.auth.updateUser(
          { email: cleanEmail },
          redirectTo ? { emailRedirectTo: redirectTo } : undefined
        );
        if (error) throw error;
        useStore.getState().pushStatus(
          t("auto_email_update_initiated_45", "Email update initiated."),
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
        const verified = await verifyCurrentPassword();
        if (!verified) {
          setAuthLoading(false);
          return;
        }
        const { error } = await supabaseAuth.auth.updateUser({ password: passwordInput });
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
      const detected: any = await invoke("auto_detect_paths");
      updateConfig("live_path", detected.live_path);
      updateConfig("mods_path", detected.mods_path);
      updateConfig("vault_path", detected.vault_path);
      useStore.getState().pushStatus(
        t("settings_auto_detect_success", "Paths Auto-Detected Successfully!")
      );
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
        ? p.replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (_match, p1) => {
            const parts = p1.split("\\");
            parts[2] = "***";
            return parts.join("\\");
          })
        : t("path_not_set", "Not Set");

    return (
      <UniversalCard
        key={dir.rustKey}
        title={dir.label}
        subtitle={obfuscatePath(dir.value)}
        icon={t("icon_folder", "folder")}
        onClick={() => pickPath(dir.rustKey, dir.label)}
      >
        <ActionButton
          variant="glass"
          icon={t("icon_sync", "sync")}
          label={t("btn_calibrate", "Select Folder")}
          className="w-full pointer-events-none mt-2"
        />
      </UniversalCard>
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
                  ? session.user.email.replace(/(.).*(@.*)/, "$1***$2")
                  : t("path_not_set", "Not Set")
              }
              icon={t("icon_mail", "mail")}
              onClick={() => {
                resetSecurityInputs();
                setActivePanel("email");
              }}
            />

            <UniversalCard
              title={t("auth_password", "Update Password")}
              subtitle="••••••••••••"
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
              title={t("vault_path", "Library Path")}
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
                  subtitle={t(
                    "auto_detect_desc",
                    "Automatically scan your system to detect and configure your game installation, save files, and library paths."
                  )}
                  icon={t("icon_troubleshoot", "troubleshoot")}
                  onClick={handleAutoDetect}
                >
                  <ActionButton
                    variant="glass"
                    icon={t("icon_troubleshoot", "troubleshoot")}
                    label={t("auto_detect", "Auto Detect")}
                    className="w-full pointer-events-none mt-2"
                  />
                </UniversalCard>
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
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("btn_update", "Update")}
              disabled={authLoading || !emailInput.trim() || !currentPasswordInput}
              onClick={() => updateAuth("email")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_verified_user", "verified_user")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t("auth_email_current_label", "Current Bound Email")}
              </span>
              <span className="text-sm md:text-base font-black font-mono tracking-tight text-[var(--text)] truncate">
                {maskEmailAddress(session?.user?.email) || t("path_not_set", "Not Set")}
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAuth("email");
            }}
            className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4"
          >
            <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
              {t("auth_email_update_desc", "Update the email address associated with your Sanctuary account.")}
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("auth_email_new_label", "New Email Address")}
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t("auth_email_placeholder", "name@example.com")}
                autoFocus
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("auth_current_password_label", "Current Password (Required)")}
              </label>
              <input
                type="password"
                value={currentPasswordInput}
                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                placeholder={t("auth_current_password_ph", "Enter your current password to verify...")}
                autoComplete="current-password"
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <ActionButton
              type="submit"
              disabled={authLoading || !emailInput.trim() || !currentPasswordInput}
              variant="glass"
              icon={t("icon_save", "save")}
              label={t("btn_update", "Update")}
              className="w-full"
            />
          </form>
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
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_lock", "lock")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t("auth_password_status_title", "Encrypted Credential Protection")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "auth_password_update_desc",
                  "Update your Sanctuary account password. For security, you may be required to re-authenticate."
                )}
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAuth("password");
            }}
            className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
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
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("auth_recovery_new_password_label", "New Password (Min. 8 Characters)")}
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="new-password"
                minLength={8}
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
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
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              />
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
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {t("auth_user_id_card_badge", "Verified Account Identifier")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t("auth_user_id_desc", "Your permanent system identifier on the Sanctuary Network.")}
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
            <input
              type="text"
              readOnly
              value={session?.user?.id || ""}
              className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono font-bold tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all select-all"
            />

            <ActionButton
              onClick={handleCopySystemId}
              variant="glass"
              icon={t("icon_content_copy", "content_copy")}
              label={t("btn_copy", "Copy")}
              className="w-full"
            />
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] flex items-center justify-center shrink-0 text-[var(--subtext)]">
              <span className="material-symbols-outlined !text-[18px]">
                {t("icon_info", "info")}
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-black tracking-wide text-[var(--text)]">
                {t("auth_user_id_info_title", "How Your System ID Works")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "auth_user_id_info_desc",
                  "Your System ID uniquely identifies your Sanctuary account across support tickets, cloud backups, and supporter pass verification without exposing your personal email."
                )}
              </p>
            </div>
          </div>
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
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start justify-between gap-3.5">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div
                className={`w-11 h-11 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                  passkeys.length > 0
                    ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                    : isElevatedRole
                      ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_45%,transparent)]"
                      : "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                }`}
              >
                <span className="material-symbols-outlined !text-[22px]">
                  {passkeys.length > 0
                    ? t("icon_passkey", "passkey")
                    : factors.length > 0
                      ? t("icon_verified_user", "verified_user")
                      : t("icon_shield", "shield")}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                  {passkeys.length > 0
                    ? t("auth_passkey_status_active", "FIDO2 Passkey Protection Active")
                    : factors.length > 0
                      ? t("auth_2fa_status_enabled", "Two-Factor Protection Active")
                      : t("auth_2fa_status_disabled", "Two-Factor Protection Inactive")}
                </span>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {isElevatedRole
                    ? t(
                        "auth_passkey_policy_elevated_desc",
                        "Verified Masons, Architects, Oversight, Wayfinders, and Keepers must maintain at least one active FIDO2 Passkey to access elevated hubs."
                      )
                    : t(
                        "auth_passkey_policy_citizen_desc",
                        "Passkeys are optional for standard accounts, but strongly recommended for phishing-resistant security."
                      )}
                </p>
              </div>
            </div>
          </div>

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
                  label={t("passkey_tile_fido_title", "FIDO2 Passkey")}
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

              {/* Selected Enrollment Card */}
              {mfaEnrollTab === "passkey" ? (
                <form
                  onSubmit={handleRegisterPasskey}
                  className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col"
                >
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_passkey", "passkey")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("auth_passkey_register_section_title", "Register FIDO2 Passkey (Recommended)")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]">
                      {t("auth_passkey_badge_fido", "FIDO2 PASSKEY")}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-4">
                    <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                      {t(
                        "auth_passkey_register_section_desc",
                        "Works with Windows Hello, macOS Touch ID, iCloud Keychain, 1Password, Bitwarden, and hardware FIDO2 keys (YubiKey)."
                      )}
                    </p>

                    <div className="flex flex-col gap-1.5">
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
                        className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>

                    {passkeyError && (
                      <div className="px-3.5 py-2.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed flex items-start gap-2">
                        <span className="material-symbols-outlined !text-[16px] shrink-0 mt-0.5">
                          {t("icon_error", "error")}
                        </span>
                        <span>{passkeyError}</span>
                      </div>
                    )}

                    <ActionButton
                      type="submit"
                      disabled={registeringPasskey}
                      variant="glass"
                      icon={t("icon_passkey", "passkey")}
                      label={
                        registeringPasskey
                          ? t("btn_registering_passkey", "Waiting for Passkey Prompt...")
                          : t("btn_register_passkey", "Register Passkey")
                      }
                      className="w-full"
                    />
                  </div>
                </form>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col">
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_qr_code_scanner", "qr_code_scanner")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {t("auth_totp_section_title", "Authenticator App (TOTP Backup)")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-[var(--subtext)]">
                      {t("auth_passkey_badge_totp", "AUTHENTICATOR APP")}
                    </span>
                  </div>

                  {!qrCode ? (
                    <div className="p-4 flex flex-col gap-4">
                      <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                        {t(
                          "auth_totp_section_desc",
                          "Optional 6-digit code generator (Google Authenticator, Authy, 1Password) for standard accounts or backup verification."
                        )}
                      </p>
                      {enrollError && (
                        <div className="px-3.5 py-2.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed">
                          {enrollError}
                        </div>
                      )}
                      <ActionButton
                        onClick={startEnrollment}
                        disabled={enrolling}
                        variant="glass"
                        icon={t("icon_devices", "devices")}
                        label={t("btn_enroll_totp_app", "Set Up Authenticator App")}
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div className="p-5 flex flex-col items-center gap-5">
                      <div className="text-center flex flex-col gap-1">
                        <h3 className="text-sm font-black text-[var(--text)] tracking-wide m-0">
                          {t("auth_2fa_scan_qr", "Scan QR Code")}
                        </h3>
                        <p className="text-xs font-medium text-[var(--subtext)] m-0">
                          {t("auth_2fa_scan_desc", "Scan this QR code with your authenticator app.")}
                        </p>
                      </div>

                      <div className="bg-white p-4 rounded-2xl shadow-lg flex items-center justify-center">
                        <img
                          src={
                            qrCode.startsWith("data:")
                              ? qrCode
                              : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`
                          }
                          alt={t("auth_2fa_scan_qr", "Scan QR Code")}
                          className="w-40 h-40 object-contain"
                        />
                      </div>

                      {totpSecret && (
                        <div className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-2xl p-4 flex flex-col gap-2">
                          <h4 className="text-[10px] font-black tracking-widest text-[var(--subtext)] uppercase m-0">
                            {t("auth_2fa_setup_key_title", "Manual Setup Key")}
                          </h4>
                          <p className="text-xs font-medium text-[var(--subtext)] m-0">
                            {t(
                              "auth_2fa_setup_key_desc",
                              "If you cannot scan the QR code, enter this secret key manually:"
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="text"
                              readOnly
                              value={totpSecret}
                              className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[var(--text)] outline-none select-all"
                            />
                            <ActionButton
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
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-3 w-full">
                        <input
                          type="text"
                          placeholder={t("auth_2fa_placeholder_code", "000000")}
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value)}
                          className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-xl px-4 py-3 text-sm font-mono font-black text-[var(--text)] text-center tracking-[0.3em] focus:outline-none focus:border-[var(--accent)] transition-colors"
                          maxLength={6}
                        />
                        {enrollError && (
                          <div className="text-xs font-bold text-[var(--danger)] text-center">
                            {enrollError}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mt-1">
                          <ActionButton
                            onClick={cancelEnrollment}
                            variant="glass"
                            icon={t("icon_close", "close")}
                            label={t("cancel", "Cancel")}
                            className="w-full"
                          />
                          <ActionButton
                            onClick={verifyEnrollment}
                            disabled={verifyCode.length < 6 || enrolling}
                            variant="glass"
                            icon={t("icon_check", "check")}
                            label={t("btn_verify_2fa", "Verify")}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Linked Items for Active Tile (Underneath the New Button) */}
              {(mfaEnrollTab === "passkey" ? passkeys : totpFactors).length > 0 && (
                <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col">
                  <div className="px-4 py-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {mfaEnrollTab === "passkey"
                          ? t("icon_passkey", "passkey")
                          : t("icon_qr_code_scanner", "qr_code_scanner")}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)]">
                        {mfaEnrollTab === "passkey"
                          ? t("passkey_tile_fido_title", "FIDO2 Passkey")
                          : t("passkey_tile_totp_title", "Authenticator App")}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)]">
                      {(mfaEnrollTab === "passkey" ? passkeys : totpFactors).length}
                    </span>
                  </div>

                  <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                    {(mfaEnrollTab === "passkey" ? passkeys : totpFactors).map((f) => {
                      const isPasskey = f.factor_type === "webauthn";
                      const isLastRequiredPasskey = isPasskey && isElevatedRole && passkeys.length <= 1;
                      const isPendingRemoval = pendingUnenrollFactorId === f.id;
                      const displayLabel = sanitizeFactorFriendlyName(
                        f.friendly_name,
                        isPasskey
                          ? t("auth_passkey_default_name", "FIDO2 Passkey")
                          : t("auth_2fa_authenticator_app", "Authenticator App")
                      );

                      return (
                        <div key={f.id} className="flex flex-col">
                          <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-9 h-9 rounded-xl border bg-transparent flex items-center justify-center shrink-0 ${
                                  isPasskey
                                    ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                                    : "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_20%,transparent)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[18px]">
                                  {isPasskey
                                    ? t("icon_passkey", "passkey")
                                    : t("icon_qr_code_scanner", "qr_code_scanner")}
                                </span>
                              </div>

                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs md:text-sm font-black text-[var(--text)] truncate">
                                  {displayLabel}
                                </span>
                                <span className="text-[11px] font-mono text-[var(--subtext)] opacity-80">
                                  {`${t("auth_2fa_enrolled_prefix", "Enrolled: ")}${new Date(f.created_at).toLocaleDateString()}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <ActionButton
                                onClick={() => {
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
                                disabled={isLastRequiredPasskey}
                                variant="glass"
                                icon={isLastRequiredPasskey ? t("icon_lock", "lock") : t("icon_delete", "delete")}
                                label={
                                  isLastRequiredPasskey
                                    ? t("passkey_min_one_required_badge", "Required for Role")
                                    : isPasskey
                                      ? t("btn_remove_passkey", "Remove Passkey")
                                      : t("btn_disable_2fa", "Disable 2FA")
                                }
                                className="!px-3.5 !py-2"
                              />
                            </div>
                          </div>

                          {isPendingRemoval && (
                            <form
                              onSubmit={confirmUnenrollFactor}
                              className="px-4 py-3.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--bg)_35%,transparent)] flex flex-col gap-3 animate-in fade-in duration-200"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                                  {t("auth_mfa_disable_confirm_title", "Confirm Two-Factor Removal")}
                                </span>
                                <p className="text-[11px] text-[var(--subtext)] leading-snug m-0">
                                  {t(
                                    "auth_mfa_disable_confirm_desc",
                                    "Enter your current password to confirm disabling Two-Factor Authentication."
                                  )}
                                </p>
                              </div>

                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                                  className="flex-1 glass-surface rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
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
                                    className="!px-3.5 !py-2.5"
                                  />
                                  <ActionButton
                                    type="submit"
                                    disabled={authLoading || !currentPasswordInput}
                                    variant="glass"
                                    icon={t("icon_check", "check")}
                                    label={t("btn_confirm", "Confirm")}
                                    className="!px-4 !py-2.5"
                                  />
                                </div>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
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
