import { supabase } from "../../supabase";
import { useStore } from "../../store";
import { isNativeLocalPasskeySupported, sanitizeFactorFriendlyName } from "../../utils/passkeyUtils";
import { CompanionPasskeyHandshakeRequester } from "../ElevatedPasskeyGate";
import { isDesktop } from "../../utils/envUtils";
import {
  ActionButton,
  DashboardStatTile,
  SidePanelFilterBar,
  VAULT_CHIP_CLASS,
} from "../../shared";

export function AuthPasswordRecoveryForm({
  t,
  setIsPasswordRecovery,
  recoveryNewPassword,
  setRecoveryNewPassword,
  recoveryConfirmPassword,
  setRecoveryConfirmPassword,
  generatedKeyPreview,
  setGeneratedKeyPreview,
  isProcessing,
  handleGenerateSovereignPassword,
  handlePasswordRecoverySubmit,
}: any) {
  return (
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
  );
}

export function AuthMfaChallengeView({
  t,
  setShowMfaChallenge,
  mfaPasskeys,
  mfaTotpFactors,
  selectedPasskeyId,
  setSelectedPasskeyId,
  mfaMode,
  setMfaMode,
  mfaCode,
  setMfaCode,
  setStatus,
  isProcessing,
  isAwaitingMfaRef,
  finalizeLogin,
  completeAuthenticatedTransition,
  handlePasskeyMfaAuth,
  handleMfaAuth,
}: any) {
  return (
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
                          {mfaPasskeys.map((pk: any) => {
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
  );
}

export function AuthSignupSecurityView({
  t,
  email,
  password,
  generatedKeyPreview,
  username,
  blindSignupEmail,
  setSignupLaunchTarget,
  signupLaunchTarget,
  signupPasskeyName,
  setSignupPasskeyName,
  signupPasskeyEnrolled,
  signupCopiedKit,
  isProcessing,
  handleSignupEnrollPasskey,
  handleCopyRecoveryKit,
  handleCompleteSignupOnboarding,
}: any) {
  return (
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
  );
}
