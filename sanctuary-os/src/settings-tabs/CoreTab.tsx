import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../utils/envUtils';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase, supabaseAuth } from '../supabase';
import { TabContainer, SettingsGrid } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { SidePanel, ActionButton, PanelHeaderGroup, PanelHeaderButton } from '../shared';

export default function CoreTab({ config, updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<'email' | 'password' | 'system_id' | '2fa' | null>(null);

  const [factors, setFactors] = useState<any[]>([]);
  const [loading2FA, setLoading2FA] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const loadFactors = async () => {
    setLoading2FA(true);
    const { data } = await supabaseAuth.auth.mfa.listFactors();
    if (data && data.totp) {
      setFactors(data.totp.filter((f: any) => f.status === 'verified'));
    }
    setLoading2FA(false);
  };

  useEffect(() => {
    loadFactors();
  }, []);

  const startEnrollment = async () => {
    setEnrolling(true);
    setEnrollError('');
    
    try {
      // Purge any lingering unverified factors before starting a new enrollment to prevent 422 errors
      const { data: existingFactors } = await supabaseAuth.auth.mfa.listFactors();
      if (existingFactors && existingFactors.all) {
        for (const f of existingFactors.all) {
          if (f.status === 'unverified') {
            await supabaseAuth.auth.mfa.unenroll({ factorId: f.id });
          }
        }
      }

      const verifiedCount = existingFactors && existingFactors.all ? existingFactors.all.filter(f => f.status === 'verified').length : 0;
      const fName = session?.user?.email ? (verifiedCount > 0 ? `${session.user.email} (${verifiedCount + 1})` : session.user.email) : `Device ${verifiedCount + 1}`;

      const { data, error } = await supabaseAuth.auth.mfa.enroll({ 
        factorType: 'totp',
        issuer: 'Sanctuary OS',
        friendlyName: fName
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
    setVerifyCode('');
    setEnrollError('');
  };

  const verifyEnrollment = async () => {
    if (!factorId) return;
    setEnrolling(true);
    setEnrollError('');
    const { error } = await supabaseAuth.auth.mfa.challengeAndVerify({
      factorId,
      code: verifyCode
    });
    
    if (error) {
      setEnrollError(error.message);
      setEnrolling(false);
      return;
    }
    
    setFactorId(null);
    setQrCode(null);
    setTotpSecret(null);
    setVerifyCode('');
    setEnrolling(false);
    loadFactors();
  };

  const unenrollFactor = async (id: string) => {
    await supabaseAuth.auth.mfa.unenroll({ factorId: id });
    loadFactors();
  };

  const updateAuth = async (type: 'email' | 'password') => {
    setAuthLoading(true);
    try {
      if (type === 'email' && emailInput) {
        const { error } = await supabase.auth.updateUser({ email: emailInput });
        if (error) throw error;
        useStore.getState().pushStatus(t("auto_email_update_initiated_45", "Email update initiated."));
        setEmailInput("");
        setActivePanel(null);
      }
      if (type === 'password' && passwordInput) {
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) throw error;
        useStore.getState().pushStatus(t("auto_password_updated_successfully_34", "Password updated successfully."));
        setPasswordInput("");
        setActivePanel(null);
      }
    } catch (err: any) {
      useStore.getState().pushStatus(err.message || String(err), 'error');
    }
    setAuthLoading(false);
  };

  const handleAutoDetect = async () => {
    try {
      const detected: any = await invoke("auto_detect_paths");
      updateConfig("live_path", detected.live_path);
      updateConfig("mods_path", detected.mods_path);
      updateConfig("vault_path", detected.vault_path);
      useStore.getState().pushStatus(t("settings_auto_detect_success", "Paths Auto-Detected Successfully!"));
    } catch {
      useStore.getState().pushStatus(t("settings_auto_detect_fail", "Failed to auto-detect paths."), 'error');
    }
  };

  const handleCopySystemId = () => {
    navigator.clipboard.writeText(session?.user?.id || "");
    useStore.getState().pushStatus(t("auto_copied_to_clipboard_45", "Copied to clipboard!"), 'success');
  };

  const renderPath = (dir: any) => {
    const obfuscatePath = (p: string) => p ? p.replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (_match, p1) => {
      const parts = p1.split('\\');
      parts[2] = '***';
      return parts.join('\\');
    }) : t("path_not_set", "Not Set");

    return (
      <UniversalCard key={dir.rustKey} title={dir.label} subtitle={obfuscatePath(dir.value)} icon={t("icon_folder", "folder")} onClick={() => pickPath(dir.rustKey, dir.label)}>
        <ActionButton 
          variant="glass" 
          icon={t("icon_sync", "sync")} 
          label={t("btn_calibrate", "Select Folder")} 
          className="w-full pointer-events-none mt-2" 
        />
      </UniversalCard>
    );
  };

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
                onClick={() => setActivePanel('system_id')} 
              />
            )}

            <UniversalCard 
              title={t("auth_email", "Update Email")} 
              subtitle={session?.user?.email ? session.user.email.replace(/(.).*(@.*)/, '$1***$2') : t("path_not_set", "Not Set")} 
              icon={t("icon_mail", "mail")} 
              onClick={() => setActivePanel('email')} 
            />

            <UniversalCard 
              title={t("auth_password", "Update Password")} 
              subtitle="••••••••••••" 
              icon={t("icon_key", "key")} 
              onClick={() => setActivePanel('password')} 
            />

            <UniversalCard 
              title={t("auth_2fa_title", "Two-Factor Authentication (2FA)")} 
              subtitle={factors.length > 0 ? `${t("auth_2fa_active_devices", "Active Devices")}: ${factors.length}` : t("auth_2fa_subtitle", "Manage your 2FA settings")} 
              icon={t("icon_gpp_good", "gpp_good")} 
              onClick={() => setActivePanel('2fa')} 
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
                {pathMap?.filter((dir: any) => dir.rustKey === 'vault_path').map(renderPath)}
              </SettingsGrid>
            </TabContainer>

            <TabContainer
              title={t("sys_coords", "System Coordinates")}
              icon={t("icon_push_pin", "push_pin")}
            >
              <SettingsGrid>
                {pathMap?.filter((dir: any) => dir.rustKey !== 'vault_path').map(renderPath)}
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
                    variant="accent"
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
        isOpen={activePanel === 'email'}
        onClose={() => setActivePanel(null)}
        title={t("auth_email", "Update Email")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_mail", "mail")}
        iconColorClass="theme-text-accent"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("btn_update", "Update")}
              variant="accent"
              disabled={authLoading || !emailInput.trim()}
              onClick={() => updateAuth('email')}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 relative z-10 w-full">
          <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_verified_user", "verified_user")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">
                {t("auth_email_current_label", "Current Bound Email")}
              </span>
              <span className="text-sm font-black tracking-wide text-[var(--text)] truncate">
                {session?.user?.email || t("path_not_set", "Not Set")}
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAuth('email');
            }}
            className="glass-panel rounded-3xl p-6 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-5"
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
                onChange={e => setEmailInput(e.target.value)}
                placeholder={session?.user?.email || ""}
                autoFocus
                className="w-full glass-surface rounded-xl px-4 py-3.5 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-inner"
              />
            </div>

            <ActionButton
              type="submit"
              disabled={authLoading || !emailInput.trim()}
              variant="accent"
              icon={t("icon_save", "save")}
              label={t("btn_update", "Update")}
              className="w-full"
            />
          </form>
        </div>
      </SidePanel>

      {/* PASSWORD SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === 'password'}
        onClose={() => setActivePanel(null)}
        title={t("auth_password", "Update Password")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_key", "key")}
        iconColorClass="theme-text-accent"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              tooltip={t("btn_update", "Update")}
              variant="accent"
              disabled={authLoading || !passwordInput.trim()}
              onClick={() => updateAuth('password')}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 relative z-10 w-full">
          <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
              <span className="material-symbols-outlined !text-[22px]">
                {t("icon_lock", "lock")}
              </span>
            </div>
            <div className="flex flex-col min-w-0 gap-1">
              <span className="text-xs font-black tracking-wide text-[var(--text)]">
                {t("auth_password_status_title", "Encrypted Credential Protection")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t("auth_password_update_desc", "Update your Sanctuary account password. For security, you may be required to re-authenticate.")}
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAuth('password');
            }}
            className="glass-panel rounded-3xl p-6 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("auth_password_new_label", "New Password")}
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                className="w-full glass-surface rounded-xl px-4 py-3.5 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-inner"
              />
            </div>

            <ActionButton
              type="submit"
              disabled={authLoading || !passwordInput.trim()}
              variant="accent"
              icon={t("icon_save", "save")}
              label={t("btn_update", "Update")}
              className="w-full"
            />
          </form>
        </div>
      </SidePanel>

      {/* SYSTEM ID SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === 'system_id'}
        onClose={() => setActivePanel(null)}
        title={t("auth_user_id", "System ID")}
        subtitle={t("settings_auth_title", "Identity & Security")}
        icon={t("icon_badge", "badge")}
        iconColorClass="theme-text-accent"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("btn_copy", "Copy")}
              variant="accent"
              onClick={handleCopySystemId}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 relative z-10 w-full">
          <div className="glass-panel rounded-3xl p-6 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[24px]">
                  {t("icon_fingerprint", "fingerprint")}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-black tracking-tight text-[var(--text)]">
                  {t("auth_user_id_card_badge", "Verified Account Identifier")}
                </span>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t("auth_user_id_desc", "Your permanent system identifier on the Sanctuary Network.")}
                </p>
              </div>
            </div>

            <input
              type="text"
              readOnly
              value={session?.user?.id || ""}
              className="w-full glass-surface rounded-xl px-4 py-3.5 text-xs font-mono font-bold tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all shadow-inner select-all"
            />

            <ActionButton
              onClick={handleCopySystemId}
              variant="accent"
              icon={t("icon_content_copy", "content_copy")}
              label={t("btn_copy", "Copy")}
              className="w-full"
            />
          </div>

          <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0 text-[var(--subtext)]">
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

      {/* 2FA SIDEPANEL */}
      <SidePanel
        isOpen={activePanel === '2fa'}
        onClose={() => setActivePanel(null)}
        title={t("auth_2fa_title", "Two-Factor Authentication (2FA)")}
        subtitle={t("auth_2fa_subtitle", "Manage your 2FA settings")}
        icon={t("icon_gpp_good", "gpp_good")}
        iconColorClass="theme-text-accent"
      >
        <div className="flex flex-col gap-5 relative z-10 w-full">
          <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                factors.length > 0
                  ? 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]'
                  : 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]'
              }`}
            >
              <span className="material-symbols-outlined !text-[24px]">
                {factors.length > 0 ? t("icon_verified_user", "verified_user") : t("icon_gpp_good", "gpp_good")}
              </span>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-black tracking-tight text-[var(--text)]">
                {factors.length > 0
                  ? t("auth_2fa_status_enabled", "Two-Factor Protection Active")
                  : t("auth_2fa_status_disabled", "Two-Factor Protection Inactive")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t("auth_2fa_desc", "Secure your account using a Time-Based One-Time Password (TOTP) app like Google Authenticator or Authy.")}
              </p>
            </div>
          </div>

          {loading2FA ? (
            <div className="glass-panel rounded-3xl p-8 text-center text-[var(--subtext)] font-black tracking-widest text-xs border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              {t("status_loading_security", "Loading Security Status...")}
            </div>
          ) : factors.length > 0 ? (
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 gap-4 w-full">
                {factors.map(f => (
                  <UniversalCard
                    key={f.id}
                    title={f.friendly_name || t("auth_2fa_authenticator_app", "Authenticator App")}
                    subtitle={`${t("auth_2fa_enrolled_prefix", "Enrolled: ")}${new Date(f.created_at).toLocaleDateString()}`}
                    icon={t("icon_gpp_good", "gpp_good")}
                    isActive={true}
                  >
                    <ActionButton
                      onClick={() => unenrollFactor(f.id)}
                      variant="danger"
                      icon={t("icon_delete", "delete")}
                      label={t("btn_disable_2fa", "Disable 2FA")}
                      className="w-full mt-2"
                    />
                  </UniversalCard>
                ))}
              </div>

              <div className="glass-panel rounded-3xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t("auth_2fa_secondary_prompt", "Enroll an additional authenticator device as a backup.")}
                </p>
                <ActionButton
                  onClick={startEnrollment}
                  disabled={enrolling || qrCode !== null}
                  variant="accent"
                  icon={t("icon_devices", "devices")}
                  label={t("btn_enroll_another", "Enroll Another Device")}
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            !qrCode && (
              <div className="glass-panel rounded-3xl p-6 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
                <ActionButton
                  onClick={startEnrollment}
                  disabled={enrolling}
                  variant="accent"
                  icon={t("icon_add_moderator", "add_moderator")}
                  label={t("btn_enable_2fa", "Enable 2FA")}
                  className="w-full"
                />
              </div>
            )
          )}

          {qrCode && (
            <div className="glass-panel rounded-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-6 flex flex-col items-center gap-6">
              <div className="text-center flex flex-col gap-1">
                <h3 className="text-sm font-black text-[var(--text)] tracking-wide m-0">
                  {t("auth_2fa_scan_qr", "Scan QR Code")}
                </h3>
                <p className="text-xs font-medium text-[var(--subtext)] m-0">
                  {t("auth_2fa_scan_desc", "Scan this QR code with your authenticator app.")}
                </p>
              </div>
              
              <div className="bg-white p-4 rounded-2xl shadow-lg" dangerouslySetInnerHTML={{ __html: qrCode }} />

              {totpSecret && (
                <div className="w-full glass-surface border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] rounded-2xl p-4 flex flex-col gap-2.5">
                  <h4 className="text-[10px] font-black tracking-widest text-[var(--warning)] uppercase m-0">
                    {t("auth_2fa_setup_key_title", "Manual Setup Key")}
                  </h4>
                  <p className="text-xs font-medium text-[var(--subtext)] m-0">
                    {t("auth_2fa_setup_key_desc", "If you cannot scan the QR code, enter this secret key manually:")}
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
                        useStore.getState().pushStatus(t("auto_copied_to_clipboard_45", "Copied to clipboard!"), 'success');
                      }}
                      variant="accent"
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
                  onChange={e => setVerifyCode(e.target.value)}
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
                    variant="accent"
                    icon={t("icon_check", "check")}
                    label={t("btn_verify_2fa", "Verify")}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </SidePanel>
    </>
  );
}


