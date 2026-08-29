import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../utils/envUtils';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase, supabaseAuth } from '../supabase';
import { TabContainer, SettingsGrid } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { SidePanel, ActionButton } from '../shared';

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
    const { data, error } = await supabaseAuth.auth.mfa.listFactors();
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
    const { data, error } = await supabaseAuth.auth.mfa.challengeAndVerify({
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
        useStore.getState().pushStatus(t("auto_email_update_initiated_45"));
        setEmailInput("");
        setActivePanel(null);
      }
      if (type === 'password' && passwordInput) {
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) throw error;
        useStore.getState().pushStatus(t("auto_password_updated_successfully_34"));
        setPasswordInput("");
        setActivePanel(null);
      }
    } catch (err: any) {
      useStore.getState().pushStatus(err.message || String(err), 'error');
    }
    setAuthLoading(false);
  };

  const renderPath = (dir: any) => {
    const obfuscatePath = (p: string) => p ? p.replace(/([A-Za-z]:\\[Uu]sers\\[^\\]+)/, (match, p1) => {
      const parts = p1.split('\\');
      parts[2] = '***';
      return parts.join('\\');
    }) : t("path_not_set");

    return (
      <UniversalCard key={dir.rustKey} title={dir.label} subtitle={obfuscatePath(dir.value)} icon="folder" onClick={() => pickPath(dir.rustKey, dir.label)}>
        <ActionButton 
          variant="accent" 
          icon={t("icon_sync")} 
          label={t("btn_calibrate")} 
          className="w-full pointer-events-none mt-2" 
        />
      </UniversalCard>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-30 w-full pb-48">
        
        <TabContainer title={t("settings_auth_title")} icon="lock">
          <SettingsGrid>
            {session?.user?.id && (
              <UniversalCard 
                title={t("auth_user_id")} 
                subtitle={t("auth_user_id_desc")} 
                icon="badge" 
                onClick={() => setActivePanel('system_id')} 
              />
            )}

            <UniversalCard 
              title={t("auth_email")} 
              subtitle={session?.user?.email ? session.user.email.replace(/(.).*(@.*)/, '$1***$2') : "No email bound"} 
              icon="mail" 
              onClick={() => setActivePanel('email')} 
            />

            <UniversalCard 
              title={t("auth_password")} 
              subtitle="••••••••••••" 
              icon="key" 
              onClick={() => setActivePanel('password')} 
            />

            <UniversalCard 
              title={t("auth_2fa_title")} 
              subtitle={factors.length > 0 ? t("auth_2fa_active_devices") + `: ${factors.length}` : t("auth_2fa_subtitle")} 
              icon="gpp_good" 
              onClick={() => setActivePanel('2fa')} 
            />
          </SettingsGrid>
        </TabContainer>

        {isDesktop() && (
          <>
            <TabContainer
              title={t("vault_path")}
              icon="account_balance"
            >
              <SettingsGrid>
                {pathMap?.filter((dir: any) => dir.rustKey === 'vault_path').map(renderPath)}
              </SettingsGrid>
            </TabContainer>

            <TabContainer
              title={t("sys_coords")}
              icon="push_pin"
              actions={
                <ActionButton 
                  variant="accent" 
                  icon={t("icon_troubleshoot")} 
                  label={t("auto_detect")} 
                  onClick={async () => {
                    try {
                      const detected: any = await invoke("auto_detect_paths");
                      updateConfig("live_path", detected.live_path);
                      updateConfig("mods_path", detected.mods_path);
                      updateConfig("vault_path", detected.vault_path);
                      useStore.getState().pushStatus(t("settings_auto_detect_success"));
                    } catch (err) {
                      useStore.getState().pushStatus(t("settings_auto_detect_fail"), 'error');
                    }
                  }}
                />
              }
            >
              <SettingsGrid>
                {pathMap?.filter((dir: any) => dir.rustKey !== 'vault_path').map(renderPath)}
              </SettingsGrid>
            </TabContainer>
          </>
        )}

      </div>

      <SidePanel
        isOpen={activePanel === 'email'}
        onClose={() => setActivePanel(null)}
        title={t("auth_email")}
        icon="mail"
      >
        <div className="flex flex-col gap-6 p-6 h-full relative z-10">
          <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest leading-relaxed">
            {t("auth_email_update_desc")}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); updateAuth('email'); }} className="flex flex-col gap-4 mt-auto">
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder={session?.user?.email || ""}
              autoFocus
              className="w-full glass-surface rounded-xl px-5 py-4 text-[12px] font-black capitalize tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-inner"
            />
            <ActionButton
              type="submit"
              disabled={authLoading || !emailInput}
              variant="accent"
              icon="save"
              label={t("btn_update")}
            />
          </form>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'password'}
        onClose={() => setActivePanel(null)}
        title={t("auth_password")}
        icon="key"
      >
        <div className="flex flex-col gap-6 p-6 h-full relative z-10">
          <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest leading-relaxed">
            {t("auth_password_update_desc")}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); updateAuth('password'); }} className="flex flex-col gap-4 mt-auto">
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder={t("auto_")}
              autoFocus
              className="w-full glass-surface rounded-xl px-5 py-4 text-[12px] font-black capitalize tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-inner"
            />
            <ActionButton
              type="submit"
              disabled={authLoading || !passwordInput}
              variant="accent"
              icon="save"
              label={t("btn_update")}
            />
          </form>
        </div>
      </SidePanel>
      <SidePanel
        isOpen={activePanel === 'system_id'}
        onClose={() => setActivePanel(null)}
        title={t("auth_user_id")}
        icon="badge"
      >
        <div className="flex flex-col gap-6 p-6 h-full relative z-10">
          <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest leading-relaxed">
            {t("auth_user_id_desc")}
          </p>
          <div className="flex flex-col gap-4 mt-auto">
            <input
              type="text"
              readOnly
              value={session?.user?.id || ""}
              className="w-full glass-surface rounded-xl px-5 py-4 text-[12px] font-black capitalize tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all shadow-inner select-all"
            />
            <ActionButton
              onClick={() => {
                navigator.clipboard.writeText(session?.user?.id || "");
                useStore.getState().pushStatus(t("auto_copied_to_clipboard_45"), 'success');
              }}
              variant="accent"
              icon="content_copy"
              label={t("btn_copy")}
            />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        isOpen={activePanel === '2fa'}
        onClose={() => setActivePanel(null)}
        title={t("auth_2fa_title")}
        icon="gpp_good"
      >
        <div className="flex flex-col gap-6 p-6 h-full relative z-10 overflow-y-auto">
          <p className="text-[10px] font-bold text-[var(--subtext)] capitalize tracking-widest leading-relaxed">
            {t("auth_2fa_desc")}
          </p>

          <div className="flex flex-col gap-4">
            {loading2FA ? (
              <div className="p-8 text-center text-[var(--subtext)] font-black tracking-widest text-xs">{t("status_loading_security")}</div>
            ) : factors.length > 0 ? (
              <div className="bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] rounded-xl border border-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-5 mt-auto">
                <h3 className="text-xs font-bold text-[var(--accent)] tracking-widest uppercase mb-4">{t("auth_2fa_active_devices")}</h3>
                <div className="flex flex-col gap-3">
                  {factors.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[var(--success)]">gpp_good</span>
                        <div>
                          <div className="text-xs font-bold text-[var(--text)]">{f.friendly_name || t("auth_2fa_authenticator_app")}</div>
                          <div className="text-[10px] text-[var(--subtext)]">{t("auth_2fa_enrolled_prefix")}{new Date(f.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => unenrollFactor(f.id)}
                        className="px-3 py-1.5 rounded-md text-[10px] font-bold tracking-wider text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors"
                      >
                        {t("btn_disable_2fa")}
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 p-4 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                  <p className="text-[10px] text-[var(--subtext)] leading-relaxed">
                    {t("auth_2fa_secondary_prompt")}
                  </p>
                  <ActionButton
                    onClick={startEnrollment}
                    disabled={enrolling || qrCode !== null}
                    variant="accent"
                    icon="devices"
                    label={t("btn_enroll_another")}
                    className="w-full"
                  />
                </div>
              </div>
            ) : (
              !qrCode && (
                <div className="mt-auto">
                  <ActionButton
                    onClick={startEnrollment}
                    disabled={enrolling}
                    variant="accent"
                    icon="add_moderator"
                    label={t("btn_enable_2fa")}
                    className="w-full"
                  />
                </div>
              )
            )}

            {qrCode && (
              <div className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-6 flex flex-col items-center gap-6 mt-auto">
                <div className="text-center">
                  <h3 className="text-sm font-bold text-[var(--text)] tracking-wider">{t("auth_2fa_scan_qr")}</h3>
                  <p className="text-[10px] text-[var(--subtext)] mt-1">{t("auth_2fa_scan_desc")}</p>
                </div>
                
                <div className="bg-white p-4 rounded-xl shadow-lg" dangerouslySetInnerHTML={{ __html: qrCode }} />

                {totpSecret && (
                  <div className="w-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-lg p-4 flex flex-col gap-2 relative">
                    <h4 className="text-[10px] font-black tracking-widest text-[var(--danger)] uppercase">{t("auth_2fa_setup_key_title")}</h4>
                    <p className="text-[10px] text-[var(--subtext)]">{t("auth_2fa_setup_key_desc")}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={totpSecret} 
                        className="flex-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded px-3 py-1.5 text-xs font-mono text-[var(--text)] outline-none select-all"
                      />
                      <ActionButton 
                        onClick={() => {
                          navigator.clipboard.writeText(totpSecret);
                          useStore.getState().pushStatus(t("auto_copied_to_clipboard_45"), 'success');
                        }}
                        variant="accent"
                        icon="content_copy"
                        label={t("btn_copy_key")}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 w-full max-w-[250px]">
                  <input
                    type="text"
                    placeholder={t("auth_2fa_placeholder_code")}
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value)}
                    className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-lg px-4 py-2 text-xs text-[var(--text)] text-center tracking-[0.2em] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    maxLength={6}
                  />
                  {enrollError && <div className="text-[10px] text-[var(--danger)] text-center">{enrollError}</div>}
                  
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={cancelEnrollment}
                      className="flex-1 px-4 py-2 rounded-lg border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)] font-bold text-[10px] tracking-wider hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      onClick={verifyEnrollment}
                      disabled={verifyCode.length < 6 || enrolling}
                      className="flex-1 px-4 py-2 rounded-lg bg-[var(--success)] text-white font-bold text-[10px] tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {t("btn_verify_2fa")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidePanel>
    </>
  );
}


