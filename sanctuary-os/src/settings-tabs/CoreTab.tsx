import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { TabContainer, SettingsGrid } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { SidePanel, ActionButton } from '../shared';

export default function CoreTab({ config, updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<'email' | 'password' | 'system_id' | null>(null);

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
          </SettingsGrid>
        </TabContainer>

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
    </>
  );
}


