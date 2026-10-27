import React, { useState, useEffect, useCallback } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useTooltipStore } from "../store/tooltipStore";
import { supabaseAuth } from "../supabase";
import { ActionButton, LoadingScreen, SidePanel, DashboardStatTile } from "../shared";
import {
  fetchMfaSecurityState,
  getCachedMfaSecurityState,
  registerFidoPasskey,
  authenticateFidoPasskey,
  deleteSecurityFactor,
  verifyPasswordWithoutSessionDowngrade,
  sanitizeFactorFriendlyName,
  notifyMfaStateChanged,
  MfaSecurityState,
} from "../utils/passkeyUtils";

interface ElevatedPasskeyGateProps {
  children: React.ReactNode;
  roleLabelKey?: string;
  roleLabelFallback?: string;
  requirePasskey?: boolean;
}

export function ElevatedPasskeyGate({
  children,
  roleLabelKey,
  roleLabelFallback,
  requirePasskey = true,
}: ElevatedPasskeyGateProps) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);

  const [mfaState, setMfaState] = useState<MfaSecurityState | null>(() =>
    getCachedMfaSecurityState(session?.user?.id)
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedMfaSecurityState(session?.user?.id)
  );
  const [mfaEnrollTab, setMfaEnrollTab] = useState<"passkey" | "totp">("passkey");
  const [passkeyName, setPasskeyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Inline TOTP enrollment states
  const [enrollingTotp, setEnrollingTotp] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrollError, setEnrollError] = useState("");

  // Inline factor removal states
  const [pendingUnenrollFactorId, setPendingUnenrollFactorId] = useState<string | null>(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [removingFactor, setRemovingFactor] = useState(false);

  const isOffline =
    typeof navigator !== "undefined" &&
    (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true");

  const refreshState = useCallback(async () => {
    if (!session?.user?.id || !requirePasskey || isOffline) {
      setLoading(false);
      return;
    }
    const state = await fetchMfaSecurityState();
    setMfaState(state);
    setLoading(false);
  }, [session?.user?.id, requirePasskey, isOffline]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    const handleMfaUpdated = () => {
      refreshState();
    };
    window.addEventListener("sanctuary-mfa-updated", handleMfaUpdated);
    return () => window.removeEventListener("sanctuary-mfa-updated", handleMfaUpdated);
  }, [refreshState]);

  const hasPasskey = Boolean(mfaState?.hasPasskey);
  const hasPendingMfaChallenge = hasPasskey && !mfaState?.isPasskeyVerified;
  const isHubLocked =
    requirePasskey &&
    !isOffline &&
    Boolean(session?.user?.id) &&
    !loading &&
    (!hasPasskey || hasPendingMfaChallenge);

  useEffect(() => {
    if (!isHubLocked) {
      useTooltipStore.getState().clearTooltip();
      return;
    }

    const mainEl = document.getElementById("sanctuary-main-scroll");
    if (!mainEl) return;

    const computedColor =
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#ffffff";
    const encodedColor = encodeURIComponent(computedColor);
    const svgCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24'%3E%3Cpath fill='${encodedColor}' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z'/%3E%3C/svg%3E") 11 11`;
    mainEl.style.setProperty("--passkey-block-cursor", svgCursor);
    mainEl.classList.add("cursor-passkey-locked");

    const handleMouseMove = (e: MouseEvent) => {
      useTooltipStore.getState().setTooltip({
        title: t("passkey_gate_hover_locked_title", "Hub Locked — FIDO2 Passkey Required"),
        subtitle: t(
          "passkey_gate_hover_locked_desc",
          "Complete FIDO2 Passkey setup in the side panel to unlock this hub, or use the Sidebar and Dock to switch sections."
        ),
        variant: "warning",
        icon: t("icon_block", "block"),
        x: e.clientX,
        y: e.clientY - 14,
        align: "center",
        vAlign: "top",
      });
    };

    const handleMouseLeave = () => {
      useTooltipStore.getState().clearTooltip();
    };

    const handleBlockedClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    mainEl.addEventListener("mousemove", handleMouseMove);
    mainEl.addEventListener("mouseleave", handleMouseLeave);
    mainEl.addEventListener("click", handleBlockedClick, true);

    return () => {
      mainEl.classList.remove("cursor-passkey-locked");
      mainEl.style.removeProperty("--passkey-block-cursor");
      mainEl.removeEventListener("mousemove", handleMouseMove);
      mainEl.removeEventListener("mouseleave", handleMouseLeave);
      mainEl.removeEventListener("click", handleBlockedClick, true);
      useTooltipStore.getState().clearTooltip();
    };
  }, [isHubLocked, t]);

  if (!requirePasskey || isOffline || !session?.user?.id) {
    return <>{children}</>;
  }

  if (loading && !mfaState) {
    return <LoadingScreen title={t("status_loading_security", "Loading Security Status...")} />;
  }

  if (hasPasskey && !hasPendingMfaChallenge) {
    return <>{children}</>;
  }

  const resolveRoleDisplay = () => {
    if (roleLabelKey && roleLabelFallback) {
      return t(roleLabelKey, roleLabelFallback);
    }
    const oRole = (osRole || "").toLowerCase();
    const uRole = (userRole || "").toLowerCase();
    if (["keeper", "core_dev", "admin"].includes(oRole)) {
      return t("dir_proto_r6_role", "Keeper");
    }
    if (["wayfinder", "admin"].includes(uRole)) {
      return t("role_wayfinder", "Wayfinder");
    }
    if (uRole === "oversight") {
      return t("role_oversight", "Oversight");
    }
    if (["architect", "senior_architect"].includes(uRole)) {
      return t("architect", "Architect");
    }
    return t("dir_proto_r2_role", "Verified {Mason}");
  };

  const formatPasskeyError = (rawMessage: string): string => {
    const lower = rawMessage.toLowerCase();
    if (lower.includes("mfa enroll is disabled") || lower.includes("passkey is disabled")) {
      return t(
        "passkey_err_supabase_mfa_disabled",
        "Passkey authentication is disabled on the Hub database. Enable 'Passkeys' under Supabase Dashboard → Authentication → Passkeys (/auth/passkeys)."
      );
    }
    return rawMessage;
  };

  const handleRegisterNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    const defaultLabel =
      passkeyName.trim() || t("auth_passkey_badge_fido", "FIDO2 Passkey");

    const { error } = await registerFidoPasskey(defaultLabel);
    if (error) {
      setErrorMsg(formatPasskeyError(error.message));
      setBusy(false);
      return;
    }

    useStore
      .getState()
      .pushStatus(t("auth_passkey_enrolled_toast", "FIDO2 Passkey registered and verified!"), "success");
    setPasskeyName("");
    await refreshState();
    setBusy(false);
  };

  const handleVerifySessionPasskey = async () => {
    setBusy(true);
    setErrorMsg("");
    const { error } = await authenticateFidoPasskey();
    if (error) {
      setErrorMsg(formatPasskeyError(error.message));
      setBusy(false);
      return;
    }
    await refreshState();
    setBusy(false);
  };

  const startTotpEnrollment = async () => {
    setEnrollingTotp(true);
    setEnrollError("");
    try {
      const { data: existingData } = await supabaseAuth.auth.mfa.listFactors();
      if (existingData?.all) {
        const unverified = existingData.all.filter(
          (f: any) => f.status === "unverified" && f.factor_type === "totp"
        );
        for (const f of unverified) {
          await supabaseAuth.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const baseLabel = t("auth_passkey_badge_totp", "Authenticator App");
      const verifiedTotpCount =
        existingData?.all?.filter((f: any) => f.status === "verified" && f.factor_type === "totp")
          .length || 0;
      const friendlyName =
        verifiedTotpCount > 0 ? `${baseLabel} (${verifiedTotpCount + 1})` : baseLabel;

      const { data, error } = await supabaseAuth.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Sanctuary OS",
        friendlyName,
      });
      if (error) throw error;
      if (data) {
        setTotpFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setTotpSecret(data.totp.secret);
      }
    } catch (err: any) {
      setEnrollError(err.message || t("err_failed_start_2fa", "Failed to start 2FA enrollment."));
      setEnrollingTotp(false);
    }
  };

  const verifyTotpEnrollment = async () => {
    if (!totpFactorId || !verifyCode) return;
    setEnrollError("");
    try {
      const challenge = await supabaseAuth.auth.mfa.challenge({ factorId: totpFactorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabaseAuth.auth.mfa.verify({
        factorId: totpFactorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      useStore
        .getState()
        .pushStatus(
          t("toast_2fa_enabled_success", "Two-Factor Authentication successfully enabled!"),
          "success"
        );
      setEnrollingTotp(false);
      setQrCode(null);
      setTotpSecret(null);
      setTotpFactorId(null);
      setVerifyCode("");
      notifyMfaStateChanged();
      await refreshState();
    } catch (err: any) {
      setEnrollError(err.message || t("err_invalid_2fa_code", "Invalid verification code."));
    }
  };

  const cancelTotpEnrollment = async () => {
    if (totpFactorId) {
      await supabaseAuth.auth.mfa.unenroll({ factorId: totpFactorId });
    }
    setEnrollingTotp(false);
    setQrCode(null);
    setTotpSecret(null);
    setTotpFactorId(null);
    setVerifyCode("");
    setEnrollError("");
  };

  const confirmUnenrollFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUnenrollFactorId) return;
    const allFactors = mfaState?.allVerifiedFactors || [];
    const passkeys = mfaState?.passkeys || [];
    const targetFactor = allFactors.find((f: any) => f.id === pendingUnenrollFactorId);
    const isRemovingPasskey = targetFactor?.factor_type === "webauthn";

    if (isRemovingPasskey && passkeys.length <= 1) {
      useStore.getState().pushStatus(
        t(
          "auth_passkey_last_required_err",
          "Elevated roles must keep at least one active FIDO2 Passkey. Register a backup Passkey before removing this one."
        ),
        "error"
      );
      setPendingUnenrollFactorId(null);
      setCurrentPasswordInput("");
      return;
    }

    if (!currentPasswordInput) {
      useStore
        .getState()
        .pushStatus(t("err_enter_current_password", "Please enter your current password to verify."), "error");
      return;
    }

    setRemovingFactor(true);
    try {
      const verifyResult = await verifyPasswordWithoutSessionDowngrade(
        session?.user?.email || "",
        currentPasswordInput
      );
      if (!verifyResult.verified) {
        throw new Error(
          t("err_incorrect_current_password", "Incorrect current password. Verification failed.")
        );
      }

      const { error } = await deleteSecurityFactor(
        targetFactor || { id: pendingUnenrollFactorId, factor_type: "totp" }
      );
      if (error) throw error;

      useStore.getState().pushStatus(
        isRemovingPasskey
          ? t("auth_passkey_removed_toast", "FIDO2 Passkey removed.")
          : t("toast_2fa_disabled", "Two-Factor Authentication disabled."),
        "info"
      );
      setPendingUnenrollFactorId(null);
      setCurrentPasswordInput("");
      await refreshState();
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(err.message || t("err_failed_disable_2fa", "Failed to disable 2FA."), "error");
    } finally {
      setRemovingFactor(false);
    }
  };

  const roleTitle = resolveRoleDisplay();
  const passkeys = mfaState?.passkeys || [];
  const totpFactors = mfaState?.totpFactors || [];
  const activeTabFactors = mfaEnrollTab === "passkey" ? passkeys : totpFactors;

  return (
    <>
      <div className="w-full h-full relative cursor-passkey-locked">
        <div
          className="w-full h-full pointer-events-none select-none opacity-40 blur-[2px] transition-all duration-300"
          inert
        >
          {children}
        </div>
      </div>

      <SidePanel
        isOpen={true}
        onClose={() => {}}
        hideCloseButton={true}
        passthroughBackdrop={true}
        noBackdropDim={true}
        title={t("auth_passkey_2fa_title", "Passkeys & Two-Factor Auth (2FA)")}
        subtitle={t("auth_passkey_2fa_subtitle", "Manage FIDO2 Passkeys and Authenticator Apps")}
        icon={t("icon_passkey", "passkey")}
        iconColorClass="theme-text-accent"
      >
        <div
          className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8"
          onMouseEnter={() => useTooltipStore.getState().clearTooltip()}
        >
          <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_shield", "shield")}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                {roleTitle}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t("auth_passkey_policy_elevated_desc", "Verified {Masons}, Architects, Oversight, Wayfinders, and Keepers must maintain at least one active FIDO2 Passkey to access elevated hubs.")}
              </p>
            </div>
          </div>

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

          {mfaEnrollTab === "passkey" ? (
            !hasPasskey ? (
              <form
                onSubmit={handleRegisterNow}
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
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--accent)]">
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
                      value={passkeyName}
                      onChange={(e) => setPasskeyName(e.target.value)}
                      placeholder={t(
                        "auth_passkey_name_placeholder",
                        "e.g. Windows Hello, MacBook Touch ID, YubiKey 5C..."
                      )}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                    />
                  </div>

                  {errorMsg && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed flex items-start gap-2">
                      <span className="material-symbols-outlined !text-[16px] shrink-0 mt-0.5">
                        {t("icon_error", "error")}
                      </span>
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <ActionButton
                    type="submit"
                    disabled={busy}
                    variant="glass"
                    icon={t("icon_passkey", "passkey")}
                    label={
                      busy
                        ? t("btn_registering_passkey", "Waiting for Passkey Prompt...")
                        : t("btn_register_passkey", "Register Passkey")
                    }
                    className="w-full"
                  />
                </div>
              </form>
            ) : (
              <div className="glass-panel rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-4 flex flex-col gap-4">
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "passkey_gate_verify_desc",
                    "Your account has a registered FIDO2 Passkey, but this session needs to complete Passkey verification before opening this hub."
                  )}
                </p>

                {errorMsg && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] text-xs font-bold leading-relaxed flex items-start gap-2">
                    <span className="material-symbols-outlined !text-[16px] shrink-0 mt-0.5">
                      {t("icon_error", "error")}
                    </span>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <ActionButton
                  onClick={handleVerifySessionPasskey}
                  disabled={busy}
                  variant="glass"
                  icon={t("icon_passkey", "passkey")}
                  label={
                    busy
                      ? t("btn_verifying_passkey", "Verifying Passkey...")
                      : t("btn_verify_with_passkey", "Authenticate with Passkey")
                  }
                  className="w-full"
                />
              </div>
            )
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
                    onClick={startTotpEnrollment}
                    disabled={enrollingTotp}
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
                        onClick={cancelTotpEnrollment}
                        variant="glass"
                        icon={t("icon_close", "close")}
                        label={t("cancel", "Cancel")}
                        className="w-full"
                      />
                      <ActionButton
                        onClick={verifyTotpEnrollment}
                        disabled={verifyCode.length < 6 || enrollingTotp}
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
          {activeTabFactors.length > 0 && (
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
                      ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                      : t("passkey_tile_totp_title", "Authenticator App")}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)]">
                  {activeTabFactors.length}
                </span>
              </div>

              <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)]">
                {activeTabFactors.map((f: any) => {
                  const isPasskey = f.factor_type === "webauthn";
                  const isLastRequiredPasskey = isPasskey && passkeys.length <= 1;
                  const isPendingRemoval = pendingUnenrollFactorId === f.id;
                  const displayLabel = sanitizeFactorFriendlyName(
                    f.friendly_name,
                    isPasskey
                      ? t("auth_passkey_badge_fido", "FIDO2 Passkey")
                      : t("auth_passkey_badge_totp", "Authenticator App")
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
                                disabled={removingFactor || !currentPasswordInput}
                                variant="glass"
                                icon={t("icon_check", "check")}
                                label={t("confirm", "Confirm")}
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
        </div>
      </SidePanel>
    </>
  );
}
