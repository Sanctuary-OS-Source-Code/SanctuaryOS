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
      try {
        const hwid = await invoke<string>("get_hardware_id");
        if (hwid && hwid !== "UNKNOWN_HWID") {
          const { data } = await supabase.from('profiles').select('id').eq('hardware_id', hwid).eq('is_banned', true).limit(1);
          if (data && data.length > 0) {
            setIsHwidBanned(true);
            localStorage.setItem("sanctuary_blacklisted", "true");
          }
        }
      } catch (e) {
        console.error("HWID check failed", e);
      }
      
      if (localStorage.getItem("sanctuary_blacklisted") === "true") {
        setIsHwidBanned(true);
      }
      
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoadingSession(false);
      });
    };
    checkBanStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  },[]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResetPassword) {
      if (!email) {
        setStatus(t("auth_err_missing"));
        return;
      }
      setIsProcessing(true);
      setStatus(t("auth_status_authenticating"));
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setStatus(t("auth_status_reset_sent"));
      } catch (err: any) {
        setStatus(`${t("auth_err_validation")}${err.message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!email || !password || (!isLogin && !username)) {
      setStatus(t("auth_err_missing"));
      return;
    }

    setIsProcessing(true);
    setStatus(t("auth_status_authenticating"));

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        if (data?.user) {
          try {
            const hwid = await invoke<string>("get_hardware_id");
            await supabase.from('profiles').update({ hardware_id: hwid }).eq('id', data.user.id);
          } catch(e) {
            console.error("Failed to capture HWID on login", e);
          }

          const { data: profile } = await supabase.from('profiles').select('is_banned, role').eq('id', data.user.id).single();
          if (profile?.is_banned || profile?.role === 'blacklisted') {
             await supabase.auth.signOut();
             setIsHwidBanned(true);
             localStorage.setItem("sanctuary_blacklisted", "true");
             throw new Error("Account has been permanently blacklisted.");
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
      setStatus(`${t("auth_err_validation")}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)]">
        <span className="text-xs font-black uppercase tracking-[0.3em] theme-text-accent animate-pulse">
          {t("auth_loading_session")}
        </span>
      </div>
    );
  }

  if (session || (!showLoginUI && (!isHwidBanned || sandboxAccepted))) {
    return <>{children}</>;
  }

  if (isHwidBanned && !sandboxAccepted) {
    return (
      <div className="flex h-screen w-screen bg-black relative overflow-hidden font-sans">
        {/* Deep, pulsing background layers */}
        <div className="absolute inset-0 bg-red-950/40 animate-pulse pointer-events-none" />
        
        {/* Large abstract geometric background elements for "landing page" feel */}
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] rounded-full bg-red-900/20 blur-[150px] pointer-events-none translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-red-600/10 blur-[150px] pointer-events-none -translate-x-1/4 translate-y-1/4" />
        
        {/* Grid lines for depth */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(220, 38, 38, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(220, 38, 38, 0.2) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        {/* Central Glass Panel stretching almost full height */}
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 md:p-20">
          <div className="w-full max-w-6xl h-full max-h-[800px] bg-black/40 backdrop-blur-3xl border border-red-500/20 rounded-[3rem] shadow-[0_0_150px_rgba(220,38,38,0.15)] flex flex-col overflow-hidden relative">
            
            {/* Top decorative header */}
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
            <div className="w-full flex justify-between p-8 text-red-500/50 text-[10px] font-black uppercase tracking-widest font-mono">
              <span>SYS.ERR // 0xDEADBEEF</span>
              <span>CONNECTION_SEVERED</span>
            </div>

            <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-8 md:p-16 gap-16">
              
              {/* Left Side: Icon & Title */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
                <span className="material-symbols-outlined !text-[8rem] md:!text-[12rem] drop-shadow-[0_0_30px_rgba(220,38,38,0.8)] text-red-500 animate-pulse">{t("ui_icon_malware_skull") || "skull"}</span>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-red-800 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)] leading-none">
                  NETWORK<br/>SEVERED
                </h1>
              </div>

              {/* Right Side: Details & Action */}
              <div className="flex-1 flex flex-col gap-10">
                <div className="flex flex-col gap-4">
                  <h3 className="text-xl font-black uppercase tracking-widest text-red-500 border-b border-red-500/20 pb-4">Quarantine Protocol Active</h3>
                  <p className="text-sm font-bold uppercase tracking-widest text-red-400 opacity-80 leading-relaxed">
                    This hardware signature has been permanently blacklisted from Sanctuary OS global databases.
                  </p>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-500/60 leading-relaxed">
                    Online connectivity, Mod Syncing, and Blueprint Sharing privileges have been revoked. You are restricted to local environment operations only.
                  </p>
                </div>
                
                <button 
                  onClick={() => { setShowLoginUI(false); setSandboxAccepted(true); }}
                  className="w-full py-8 rounded-[2rem] font-black text-sm uppercase tracking-[0.4em] transition-all bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500 shadow-[0_0_40px_rgba(220,38,38,0.2)] hover:shadow-[0_0_60px_rgba(220,38,38,0.4)] group flex items-center justify-center gap-4"
                >
                  ENTER LOCAL SANDBOX
                  <span className="opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 duration-300">
                    &rarr;
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom decorative footer */}
            <div className="w-full flex justify-center p-8 border-t border-red-500/10">
               <span className="text-red-500/30 text-[9px] font-black uppercase tracking-[0.5em]">Sanctuary OS Offline Mode</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)] font-sans relative overflow-hidden">
      
      {/* Dynamic Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[var(--bg)] to-black pointer-events-none z-0" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

      {/* Controlled Ambient Glow Behind Modal */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full theme-bg-accent opacity-10 blur-[100px] pointer-events-none z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-blue-500 opacity-5 blur-[80px] pointer-events-none z-0" />

      <div className="relative z-10 w-full max-w-lg theme-glass-panel border border-white/10 rounded-[2.5rem] p-10 md:p-14 shadow-[0_0_100px_rgba(0,0,0,0.8),inset_0_0_40px_rgba(255,255,255,0.02)] flex flex-col backdrop-blur-3xl overflow-hidden group">
        
        {/* Subtle inner top highlight */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-50" />

        <div className="flex flex-col items-center justify-center text-center mb-10">
          <div className="w-20 h-20 rounded-3xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center mb-6 overflow-hidden relative group/logo">
            <div className="absolute inset-0 bg-[var(--accent)] opacity-10 group-hover/logo:opacity-20 transition-opacity" />
            <img src="/icon.png" alt="" className="w-12 h-12 object-contain drop-shadow-[0_0_10px_var(--accent)] group-hover/logo:scale-110 transition-transform duration-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/40 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-2">
            {t("auth_title")}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-accent opacity-80">
            {t("auth_subtitle")}
          </p>
        </div>

        <form onSubmit={handleAuth} className="flex flex-col gap-5 relative z-20" noValidate>
          {!isLogin && !isResetPassword && (
            <div className="relative group/input">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">person</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                data-1p-ignore
                placeholder={t("auth_placeholder_username")}
                className="w-full theme-glass-inner border border-white/5 bg-black/20 pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-30 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
              />
            </div>
          )}
          
          <div className="relative group/input">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">alternate_email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              spellCheck="false"
              data-1p-ignore
              placeholder={t("auth_placeholder_email")}
              className="w-full theme-glass-inner border border-white/5 bg-black/20 pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-30 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
            />
          </div>
          
          {!isResetPassword && (
            <div className="relative group/input">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">lock</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                spellCheck="false"
                data-1p-ignore
                placeholder={t("auth_placeholder_password")}
                className="w-full theme-glass-inner border border-white/5 bg-black/20 pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all placeholder:text-[var(--subtext)] placeholder:opacity-30 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] theme-text-accent hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
          >
            {isResetPassword ? t("auth_btn_send_reset") : isLogin ? t("auth_btn_login") : t("auth_btn_signup")}
          </button>
        </form>

        <div className="mt-4 relative z-20">
          <button
            onClick={() => { localStorage.removeItem("sanctuary_show_login"); setShowLoginUI(false); }}
            className="w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all bg-white/[0.03] backdrop-blur-md border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 active:scale-[0.98]"
          >
            {t("auth_btn_skip") || "BYPASS LOGIN"}
          </button>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 border-t border-white/10 pt-6 relative z-20">
          <div className="flex items-center gap-4">
            {!isResetPassword && (
              <button
                type="button"
                onClick={() => { setIsResetPassword(true); setStatus(""); }}
                className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined !text-[14px]">vpn_key</span>
                {t("auth_toggle_to_reset")}
              </button>
            )}

            {!isResetPassword && <div className="w-1 h-1 rounded-full bg-white/20" />}

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
              className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined !text-[14px]">switch_account</span>
              {isResetPassword ? t("auth_toggle_to_login_from_reset") : isLogin ? t("auth_toggle_to_signup") : t("auth_toggle_to_login")}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-2.5 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${status.includes('Error') || status.includes('Missing') ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'theme-bg-accent shadow-[0_0_8px_var(--accent)]'} ${isProcessing ? 'animate-pulse' : ''}`} />
            <span className={`text-[9px] font-mono uppercase tracking-widest truncate ${status.includes('Error') || status.includes('Missing') ? 'text-red-400' : 'text-white/60'}`}>
              {status || t("auth_status_standby")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
