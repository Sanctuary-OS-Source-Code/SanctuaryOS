import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { TabContainer, SettingsGrid, SettingCard } from './shared';
import { SidePanel } from '../shared';

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

export default function CoreTab({ config, updateConfig, pickPath, pathMap }: any) {
  const { t } = useLexicon();
  const { session } = useStore();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<'email' | 'password' | null>(null);

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
      <SettingCard key={dir.rustKey} title={dir.label} description={obfuscatePath(dir.value)} icon="folder" onClick={() => pickPath(dir.rustKey, dir.label)}>
        <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest theme-glass-inner border border-white/20 shadow-lg bg-black/40 text-[var(--text)] transition-all group-hover:theme-border-accent">
          <span className="material-symbols-outlined !text-sm text-[var(--accent)]">{t("icon_sync")}</span>
          {t("btn_calibrate")}
        </div>
      </SettingCard>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-30 w-full pb-48">
        
        <TabContainer title={t("settings_auth_title")} icon="lock">
          <SettingsGrid>
            {session?.user?.id && (
              <SettingCard title={t("auth_user_id")} description={t("auth_user_id_desc") || "Your unique Sanctuary identifier"} icon="badge">
                <input
                  type="text"
                  readOnly
                  value={session.user.id}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 outline-none shadow-inner select-all"
                />
              </SettingCard>
            )}

            <SettingCard 
              title={t("auth_email")} 
              description={session?.user?.email ? session.user.email.replace(/(.).*(@.*)/, '$1***$2') : "No email bound"} 
              icon="mail" 
              onClick={() => setActivePanel('email')} 
            />

            <SettingCard 
              title={t("auth_password")} 
              description="••••••••••••" 
              icon="key" 
              onClick={() => setActivePanel('password')} 
            />
          </SettingsGrid>
        </TabContainer>

        <TabContainer
          title={t("vault_path") || "MASTER VAULT LOCATION"}
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
            <button onClick={async () => {
              try {
                const detected: any = await invoke("auto_detect_paths");
                updateConfig("live_path", detected.live_path);
                updateConfig("mods_path", detected.mods_path);
                updateConfig("vault_path", detected.vault_path);
                useStore.getState().pushStatus(t("settings_auto_detect_success"));
              } catch (err) {
                useStore.getState().pushStatus(t("settings_auto_detect_fail"), 'error');
              }
            }} className="px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center gap-3 hover:bg-white/5">
              <span className="material-symbols-outlined !text-lg text-[var(--accent)] drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]">{t("icon_troubleshoot")}</span>
              {t("auto_detect")}
            </button>
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
          <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest leading-relaxed">
            {t("auth_email_update_desc") || "Update the email address associated with your Sanctuary account. A confirmation link will be sent to both your old and new email addresses."}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); updateAuth('email'); }} className="flex flex-col gap-4 mt-auto">
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder={session?.user?.email || ""}
              autoFocus
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-[12px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={authLoading || !emailInput}
              className={standardButtonClass}
            >
              {t("btn_update")}
            </button>
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
          <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest leading-relaxed">
            {t("auth_password_update_desc") || "Update your Sanctuary account password. For security, you may be required to re-authenticate."}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); updateAuth('password'); }} className="flex flex-col gap-4 mt-auto">
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder={t("auto_")}
              autoFocus
              className="w-full theme-glass-inner rounded-xl px-5 py-4 text-[12px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={authLoading || !passwordInput}
              className={standardButtonClass}
            >
              {t("btn_update")}
            </button>
          </form>
        </div>
      </SidePanel>
    </>
  );
}
