import { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { TabContainer } from './shared';

const standardButtonClass = "px-6 py-3 rounded-2xl theme-glass-inner text-[var(--text)] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:theme-border-accent hover:scale-105 active:scale-95 border border-white/10 backdrop-blur-xl flex items-center justify-center gap-3 hover:bg-white/5";

export default function AuthTab() {
  const { t } = useLexicon();
  const { session } = useStore();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const updateAuth = async (type: 'email' | 'password') => {
    setAuthLoading(true);
    try {
      if (type === 'email' && emailInput) {
        const { error } = await supabase.auth.updateUser({ email: emailInput });
        if (error) throw error;
        useStore.getState().pushStatus(t("auto_email_update_initiated_check_your_inboxe"));
        setEmailInput("");
      }
      if (type === 'password' && passwordInput) {
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) throw error;
        useStore.getState().pushStatus(t("auto_password_updated_successfully"));
        setPasswordInput("");
      }
    } catch (err: any) {
      useStore.getState().pushStatus(err.message || String(err), 'error');
    }
    setAuthLoading(false);
  };

  return (
    <TabContainer title={t("settings_auth_title")} icon="lock">
      <div className="grid xl:grid-cols-2 gap-8">
        <div className="flex flex-col gap-8">
          {session?.user?.id && (
            <div className="flex flex-col gap-3 group">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("auth_user_id")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={session.user.id}
                  className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 outline-none shadow-inner select-all"
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("auth_email")}</label>
            <form onSubmit={(e) => { e.preventDefault(); updateAuth('email'); }} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder={session?.user?.email || ""}
                className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
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

          <div className="flex flex-col gap-3 group">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] ml-2 text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{t("auth_password")}</label>
            <form onSubmit={(e) => { e.preventDefault(); updateAuth('password'); }} className="flex gap-2">
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder={t("auto_")}
                className="flex-1 theme-glass-inner rounded-2xl px-5 py-5 text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none focus:theme-border-accent focus:bg-black/40 transition-all shadow-inner"
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
        </div>
      </div>
    </TabContainer>
  );
}
