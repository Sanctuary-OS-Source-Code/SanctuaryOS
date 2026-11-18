import { DynamicThemePreviewBanner } from "../../chameleon-components/ThemeCard";
import { SidePanelPillToggle } from "../universal/UniversalLayout";
import { ActionButton, VAULT_CHIP_CLASS } from "../../shared";

export function AuthPasswordResetView({
  t,
  setIsLogin,
  isLogin,
  setIsResetPassword,
  email,
  setEmail,
  password,
  setPassword,
  recoveryMode,
  setRecoveryMode,
  sovereignRecoveryInput,
  setSovereignRecoveryInput,
  setStatus,
  isProcessing,
  handlePasskeyPasswordRecovery,
  handlePasskeyMfaAuth,
  handleAuth,
}: any) {
  return (
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
  );
}

export function AuthLoginFormView({
  t,
  setIsLogin,
  isLogin,
  setIsResetPassword,
  email,
  setEmail,
  password,
  setPassword,
  recoveryMode,
  setRecoveryMode,
  sovereignRecoveryInput,
  setSovereignRecoveryInput,
  setStatus,
  isProcessing,
  handlePasskeyPasswordRecovery,
  handlePasskeyMfaAuth,
  handleAuth,
}: any) {
  return (
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
  );
}

export function AuthOnboardingPersonalizeView({
  t,
  activeLang,
  setActiveLang,
  useGlobalLexicon,
  setUseGlobalLexicon,
  setGlobalLexiconId,
  currentTheme,
  activeThemeId,
  setActiveThemeId,
  useGlobalTheme,
  setUseGlobalTheme,
  setGlobalThemeId,
  setSignupStep,
  setSignupStyleConfirmed,
  setStatus,
  onboardingLexiconOptions,
  onboardingThemeOptions,
  currentThemeIsDark,
}: any) {
  return (
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
                    {onboardingLexiconOptions.map((opt: any) => {
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
                    {onboardingThemeOptions.map((th: any) => {
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
  );
}

export function AuthOnboardingWelcomeView({
  t,
  currentTheme,
  activeThemeId,
  setSignupStep,
  signupLegalAccepted,
  setSignupLegalAccepted,
  signupAgeConfirmed,
  setSignupAgeConfirmed,
  reviewedUserDocs,
  setReviewedUserDocs,
  setActiveOnboardingDrawerTab,
  setStatus,
  activeLexiconDisplayName,
}: any) {
  return (
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
                            setReviewedUserDocs((prev: any) => ({
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
  );
}
