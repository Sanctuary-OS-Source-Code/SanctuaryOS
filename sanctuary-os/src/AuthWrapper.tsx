import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { invoke } from "@tauri-apps/api/core";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const setSession = useStore((state) => state.setSession);
  const [loadingSession, setLoadingSession] = useState(true);

  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHwidBanned, setIsHwidBanned] = useState(false);
  const [sandboxAccepted, setSandboxAccepted] = useState(false);

  const [showLoginUI, setShowLoginUI] = useState(() => localStorage.getItem("sanctuary_show_login") === "true");

  useEffect(() => {
    const checkBanStatus = async () => {
      const isOfflineMode = !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";
      try {
        if (!isOfflineMode) {
          const hwid = await invoke<string>("get_hardware_id");
          if (hwid && hwid !== "UNKNOWN_HWID") {
            const fetchPromise = supabase.from('profiles').select("id").eq('hardware_id', hwid).eq('is_banned', true).limit(1);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
            const { data } = await Promise.race([fetchPromise, timeoutPromise]) as any;
            if (data && data.length > 0) {
              setIsHwidBanned(true);
              localStorage.setItem("sanctuary_blacklisted", "true");
            }
          }
        }
      } catch (e) {
        console.error("HWID check failed", e);
      }
      
      if (localStorage.getItem("sanctuary_blacklisted") === "true") {
        setIsHwidBanned(true);
      }

      try {
        if (isOfflineMode) {
          const cachedToken = localStorage.getItem('sb-chphhvpcgcpnyvshsudh-auth-token');
          if (cachedToken) {
            try {
              const parsed = JSON.parse(cachedToken);
              setSession(parsed.session || parsed);
            } catch(e){}
          }
        }

        if (!isOfflineMode) {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
          const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
          setSession(session);
        }
      } catch (e) {
        console.error("Session fetch failed", e);
      } finally {
        setLoadingSession(false);
      }
    };

    checkBanStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [invoke]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResetPassword) {
      if (!email) {
        setStatus(t("err_missing"));
        return;
      }
      setIsProcessing(true);
      setStatus(t("status_authenticating"));
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setStatus(t("status_reset_sent"));
      } catch (err: any) {
        setStatus(`${t("err_validation")}${err.message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!email || !password || (!isLogin && !username)) {
      setStatus(t("err_missing"));
      return;
    }

    setIsProcessing(true);
    setStatus(t("status_authenticating"));

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data?.user) {
          try {
            const hwid = await invoke<string>("get_hardware_id");
            await supabase.from('profiles').update({ hardware_id: hwid }).eq('id', data.user.id);
          } catch (e) {
            console.error("Failed to capture HWID on login", e);
          }

          const { data: profile } = await supabase.from('profiles').select('is_banned, role').eq('id', data.user.id).single();
          if (profile?.is_banned || profile?.role === 'blacklisted') {
            await supabase.auth.signOut();
            setIsHwidBanned(true);
            localStorage.setItem("sanctuary_blacklisted", "true");
            throw new Error("Account has been permanently blacklisted.");
          } else {
            localStorage.removeItem("sanctuary_blacklisted");
            setIsHwidBanned(false);
          }
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setStatus(`${t("err_validation")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)]">
        <span className="text-xs font-black uppercase tracking-[0.3em] theme-text-accent animate-pulse">
          {t("loading_session")}
        </span>
      </div>
    );
  }

  if (session || ((!showLoginUI || !navigator.onLine) && (!isHwidBanned || sandboxAccepted))) {
    return <>{children}</>;
  }

  if (isHwidBanned && !sandboxAccepted) {
    return (
      <div 
        className="flex h-screen w-screen bg-[var(--bg)]/60 backdrop-blur-3xl relative overflow-hidden font-sans"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="absolute inset-0 bg-red-950/30 animate-pulse pointer-events-none" />

        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] rounded-full bg-red-900/20 blur-[150px] pointer-events-none translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-red-600/10 blur-[150px] pointer-events-none -translate-x-1/4 translate-y-1/4" />

        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(220, 38, 38, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(220, 38, 38, 0.2) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 md:p-20">
          <div className="w-full max-w-6xl h-full max-h-[800px] bg-[var(--bg)]/40 backdrop-blur-3xl border border-red-500/30 rounded-2xl shadow-[0_40px_100px_rgba(220,38,38,0.15),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col overflow-hidden relative">

            <div className="h-1 w-full bg-gradient-to-r from-transparent via-red-500/80 to-transparent opacity-50" />
            <div className="w-full flex justify-between p-8 text-red-500/50 text-[10px] font-black uppercase tracking-widest font-mono">
              <span>{t("err_sys_prefix")} {t("auto_0xdeadbeef")}</span>
              <span>{t("err_sys_severed")}</span>
            </div>

            <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-8 md:p-16 gap-16">

              <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
                <span className="material-symbols-outlined !text-[8rem] md:!text-[12rem] drop-shadow-[0_0_30px_rgba(220,38,38,0.8)] text-red-500 animate-pulse">{t("icon_skull")}</span>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-red-800 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)] leading-none">
                  {t("tab_network")}<br />{t("err_severed")}
                </h1>
              </div>

              <div className="flex-1 flex flex-col gap-10">
                <div className="flex flex-col gap-4">
                  <h3 className="text-xl font-black uppercase tracking-widest text-red-500 border-b border-red-500/20 pb-4">{t("quarantine_active")}</h3>
                  <p className="text-sm font-bold uppercase tracking-widest text-red-400 opacity-80 leading-relaxed">
                    {t("quarantine_desc1")}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-500/60 leading-relaxed">
                    {t("quarantine_desc2")}
                  </p>
                </div>

                <button
                  onClick={() => { setShowLoginUI(false); setSandboxAccepted(true); }}
                  className="w-full py-8 rounded-xl font-black text-sm uppercase tracking-[0.4em] transition-all bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/60 shadow-[0_0_20px_rgba(220,38,38,0.15)] hover:shadow-[0_0_40px_rgba(220,38,38,0.3)] active:scale-95 group flex items-center justify-center gap-4"
                >
                  {t("btn_sandbox")}
                  <span className="opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 duration-300">
                    &rarr;
                  </span>
                </button>
              </div>
            </div>

            <div className="w-full flex justify-center p-8 border-t border-red-500/10">
              <span className="text-red-500/30 text-[9px] font-black uppercase tracking-[0.5em]">{t("offline_mode")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center font-sans relative overflow-hidden transition-colors duration-1000" style={{ background: 'var(--bgGradient, var(--bg))', color: 'var(--text)' }}>

      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full theme-bg-accent opacity-[0.06] blur-[100px] pointer-events-none z-0 mix-blend-normal transition-all duration-1000" />
      
      <div className="relative z-10 w-[90%] max-w-lg theme-glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] p-8 md:p-14 shadow-[0_40px_100px_rgba(0,0,0,0.4)] flex flex-col backdrop-blur-3xl overflow-hidden group">

        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-50" />

        <div className="flex flex-col items-center justify-center text-center mb-10">
          <div className="relative mb-6 group/logo flex items-center justify-center w-24 h-24">
            <div className="absolute inset-2 bg-[var(--accent)] rounded-full opacity-[0.15] blur-xl group-hover/logo:opacity-30 group-hover/logo:blur-2xl transition-all duration-700" />
            <img src="/icon.png" alt="" className="w-16 h-16 object-contain drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)] relative z-10 group-hover/logo:scale-110 group-hover/logo:-translate-y-1 transition-transform duration-700" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-[var(--headerText)] drop-shadow-[0_0_20px_color-mix(in_srgb,var(--headerText)_10%,transparent)] mb-2 transition-colors duration-500">
            {t("title")}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-accent opacity-80 transition-colors duration-500">
            {t("subtitle")}
          </p>
        </div>

        <form onSubmit={handleAuth} className="flex flex-col gap-5 relative z-20" noValidate>
          {!isLogin && !isResetPassword && (
            <div className="relative group/input">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">{t("icon_person")}</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                data-1p-ignore
                placeholder={t("placeholder_username")}
                className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
              />
            </div>
          )}

          <div className="relative group/input">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">{t("icon_alternate_email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              spellCheck="false"
              data-1p-ignore
              placeholder={t("placeholder_email")}
              className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
            />
          </div>

          {!isResetPassword && (
            <div className="relative group/input">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">{t("icon_lock")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                spellCheck="false"
                data-1p-ignore
                placeholder={t("placeholder_password")}
                className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
          >
            {isResetPassword ? t("btn_send_reset") : isLogin ? t("btn_login") : t("btn_signup")}
          </button>
        </form>

        <div className="mt-4 relative z-20">
          <button
            onClick={() => { localStorage.removeItem("sanctuary_show_login"); setShowLoginUI(false); }}
            className="w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all theme-glass-inner border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] active:scale-[0.98]"
          >
            {t("btn_skip")}
          </button>
        </div>

        <div className="flex items-center justify-center gap-2.5 mt-6 mb-2 relative z-20">
          <div className={`w-1.5 h-1.5 rounded-full ${status.includes('Error') || status.includes('Missing') ? 'bg-[var(--danger)] shadow-[0_0_8px_var(--danger)]' : 'theme-bg-accent shadow-[0_0_8px_var(--accent)]'} ${isProcessing ? 'animate-pulse' : ''}`} />
          <span className={`text-[9px] font-mono uppercase tracking-widest truncate ${status.includes('Error') || status.includes('Missing') ? 'text-[var(--danger)]' : 'theme-text-accent opacity-80'}`}>
            {status || t("status_standby") || "Awaiting Credentials..."}
          </span>
        </div>

        <div className="mt-4 flex flex-col items-center gap-5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-6 relative z-20">
          {!isResetPassword && (
            <button
              type="button"
              onClick={() => { setIsResetPassword(true); setStatus(""); }}
              className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center gap-2 w-full text-center"
            >
              <span className="material-symbols-outlined !text-[14px]">{t("icon_vpn_key")}</span>
              {t("toggle_to_reset")}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isResetPassword) {
                setIsResetPassword(false);
                setIsLogin(true);
              } else {
                setIsLogin(!isLogin);
              }
              setStatus("");
            }}
            className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center gap-2 w-full text-center"
          >
            <span className="material-symbols-outlined !text-[14px]">{t("icon_switch_account")}</span>
            {isResetPassword ? t("toggle_to_login_from_reset") : isLogin ? t("toggle_to_signup") : t("toggle_to_login")}
          </button>
        </div>
      </div>
    </div>
  );
}
