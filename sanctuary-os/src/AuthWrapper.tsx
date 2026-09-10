import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { invoke } from "@tauri-apps/api/core";
import { hashString } from "./lib/cryptoUtils";
import { isDesktop } from "./utils/envUtils";
export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const setSession = useStore((state) => state.setSession);
  const [loadingSession, setLoadingSession] = useState(true);

  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHwidBanned, setIsHwidBanned] = useState(false);
  const [sandboxAccepted, setSandboxAccepted] = useState(false);
  const [gameTitle, setGameTitle] = useState("");
  const [gameIcon, setGameIcon] = useState<string | null>(null);

  const [showLoginUI, setShowLoginUI] = useState(() => localStorage.getItem("sanctuary_show_login") === "true");

  useEffect(() => {
    const handleSessionUpdate = async (newSession: any) => {
      if (newSession) {
        try {
          const mfaStatus = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (mfaStatus.data?.nextLevel === 'aal2' && mfaStatus.data?.currentLevel === 'aal1') {
            const factors = await supabase.auth.mfa.listFactors();
            const totpFactor = factors.data?.totp?.[0];
            if (totpFactor) {
              setMfaFactorId(totpFactor.id);
              setShowMfaChallenge(true);
              setSession(null); // Keep session null in React state to force challenge UI
              return;
            }
          }
        } catch (e) {
          console.error("MFA check failed", e);
        }
      }
      setSession(newSession);
    };

    const fetchGameTitle = async () => {
      try {
        const config: any = await invoke("get_global_config");
        if (config && config.active_workspace_id && config.workspaces) {
          const activeWs = config.workspaces.find((w: any) => w.id === config.active_workspace_id);
          if (activeWs && activeWs.schema_id) {
            const { data } = await supabase.from('sanctuary_games').select('name, icon').eq('schema_id', activeWs.schema_id).maybeSingle();
            if (data) {
              if (data.name) setGameTitle(data.name);
              if (data.icon) setGameIcon(data.icon);
            }
          }
        }
      } catch (e) { }
    };
    fetchGameTitle();

    const checkBanStatus = async () => {
      const isOfflineMode = !navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true";
      try {
        if (!isOfflineMode) {
          let rawHwid = "WEB_BROWSER_HWID";
          if (isDesktop()) {
            try { rawHwid = await invoke<string>("get_hardware_id"); } catch { }
          }
          if (rawHwid && rawHwid !== "UNKNOWN_HWID") {
            const hwid = await hashString(rawHwid);
            const fetchPromise = supabaseAuth.from('hardware_bans').select("hwid_hash").eq('hwid_hash', hwid).limit(1);
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
            } catch (e) { }
          }
        }

        if (!isOfflineMode) {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
          const { data: { session: fetchedSession } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
          await handleSessionUpdate(fetchedSession);
        }
      } catch (e) {
        console.error("Session fetch failed", e);
      } finally {
        setLoadingSession(false);
      }
    };

    checkBanStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      handleSessionUpdate(newSession).catch(console.error);
    });

    return () => subscription.unsubscribe();
  }, [invoke]);

  const finalizeLogin = async (user: any) => {
    try {
      let rawHwid = "WEB_BROWSER_HWID";
      if (isDesktop()) {
        try { rawHwid = await invoke<string>("get_hardware_id"); } catch { }
      }
      const hwid = await hashString(rawHwid);
      const fetchBanPromise = supabaseAuth.from('hardware_bans').select("hwid_hash").eq('hwid_hash', hwid).limit(1);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
      const res = await Promise.race([fetchBanPromise, timeoutPromise]) as any;

      if (res.data && res.data.length > 0) {
        // Apply ban to user profile
        await supabaseAuth.from('profiles').update({ is_banned: true }).eq('id', user.id);
        setIsHwidBanned(true);
        localStorage.setItem("sanctuary_blacklisted", "true");
        await supabase.auth.signOut();
        throw new Error("Hardware ban detected. Account has been permanently blacklisted.");
      }
    } catch (e: any) {
      if (e.message.includes("blacklisted")) throw e;
      console.error("Failed to check HWID ban status on login", e);
    }

    let profile = null;
    try {
      const fetchPromise = supabaseAuth.from('profiles').select('is_banned, role').eq('id', user.id).maybeSingle();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
      const res = await Promise.race([fetchPromise, timeoutPromise]) as any;
      profile = res.data;
    } catch (e) {
      console.error("Failed to fetch profile on login", e);
    }
    if (profile?.is_banned || profile?.role === 'blacklisted') {
      await supabase.auth.signOut();
      setIsHwidBanned(true);
      localStorage.setItem("sanctuary_blacklisted", "true");
      throw new Error("Account has been permanently blacklisted.");
    } else {
      localStorage.removeItem("sanctuary_blacklisted");
      setIsHwidBanned(false);
    }
  };

  const handleMfaAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || !mfaCode) return;
    setIsProcessing(true);
    setStatus("DEBUG: Starting challenge...");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) throw challenge.error;

      setStatus("DEBUG: Starting verify...");
      const verify = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaCode
      });
      if (verify.error) throw verify.error;

      setStatus("DEBUG: Getting user...");
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        setStatus("DEBUG: Finalizing login...");
        await finalizeLogin(userData.user);
        setStatus("DEBUG: Getting session...");
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) setSession(sessionData.session);
      }
    } catch (err: any) {
      setStatus(`${t("err_validation") || "Error: "}${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

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
          const mfaStatus = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (mfaStatus.data?.nextLevel === 'aal2' && mfaStatus.data?.currentLevel === 'aal1') {
            const factors = await supabase.auth.mfa.listFactors();
            const totpFactor = factors.data?.totp?.[0];
            if (totpFactor) {
              setMfaFactorId(totpFactor.id);
              setShowMfaChallenge(true);
              setIsProcessing(false);
              setStatus("MFA Required");
              return;
            }
          }
          await finalizeLogin(data.user);
          if (data.session) setSession(data.session);
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
      <div className="flex h-[100dvh] w-screen items-center justify-center font-sans relative overflow-hidden transition-colors duration-1000" style={{ background: 'var(--bgGradient)', color: 'var(--text)' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] pointer-events-none mix-blend-screen"
          style={{ backgroundColor: `color-mix(in srgb, var(--accent) 10%, transparent)` }} />

        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: `color-mix(in srgb, var(--accent) 5%, transparent)`,
              borderColor: `color-mix(in srgb, var(--accent) 30%, transparent)`,
              borderWidth: '1px',
              boxShadow: `0 0 30px color-mix(in srgb, var(--accent) 10%, transparent), inset 0 0 20px color-mix(in srgb, var(--accent) 5%, transparent)`
            }}>
            <div className="absolute inset-0 rounded-[inherit]  border animate-ping opacity-30" style={{ borderColor: `color-mix(in srgb, var(--accent) 20%, transparent)` }} />
            <span className="material-symbols-outlined animate-spin"
              style={{ color: 'var(--accent)', filter: `drop-shadow(0 0 15px var(--accent))` }}>sync</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <h2 className="text-xl font-black capitalize tracking-widest text-[var(--text)]">
              {t("loading_session")}
            </h2>
            <p className="text-sm font-medium text-[var(--text-muted)] tracking-wider animate-pulse">
              {t("status_standby")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (session || ((!showLoginUI || !navigator.onLine) && (!isHwidBanned || sandboxAccepted))) {
    return <>{children}</>;
  }

  if (isHwidBanned && !sandboxAccepted) {
    return (
      <div
        className="flex h-[100dvh] w-screen bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-3xl relative overflow-hidden font-sans"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="absolute inset-0 rounded-[inherit] bg-red-950/30 animate-pulse pointer-events-none" />

        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] rounded-full bg-red-900/20 blur-[150px] pointer-events-none translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] blur-[150px] pointer-events-none -translate-x-1/4 translate-y-1/4" />

        <div className="absolute inset-0 rounded-[inherit] opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(220, 38, 38, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(220, 38, 38, 0.2) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 md:p-20">
          <div className="w-full max-w-6xl h-full max-h-[800px] bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-3xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl shadow-[0_40px_100px_rgba(220,38,38,0.15),inset_0_1px_1px_rgba(255,255,255,0.05)] flex flex-col overflow-hidden relative">

            <div className="h-1 w-full bg-gradient-to-r from-transparent via-red-500/80 to-transparent opacity-50" />
            <div className="w-full flex justify-start p-8 text-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[10px] font-black capitalize tracking-widest font-mono">
              <span>{t("err_sys_prefix")} {t("auto_0xdeadbeef")}</span>
              <span>{t("err_sys_severed")}</span>
            </div>

            <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-8 md:p-16 gap-16">

              <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
                <span className="material-symbols-outlined !text-[8rem] md:!text-[12rem] drop-shadow-md text-red-500 animate-pulse">{t("icon_skull")}</span>
                <h1 className="text-5xl md:text-7xl font-black capitalize tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-red-800 drop-shadow-md leading-none">
                  {t("tab_network")}<br />{t("err_severed")}
                </h1>
              </div>

              <div className="flex-1 flex flex-col gap-10">
                <div className="flex flex-col gap-4">
                  <h3 className="text-xl font-black capitalize tracking-widest text-red-500 border-b border-[color-mix(in_srgb,var(--danger)_20%,transparent)] pb-4">{t("quarantine_active")}</h3>
                  <p className="text-sm font-bold capitalize tracking-widest text-red-400 opacity-80 leading-relaxed">
                    {t("quarantine_desc1")}
                  </p>
                  <p className="text-xs font-bold capitalize tracking-widest text-[color-mix(in_srgb,var(--danger)_60%,transparent)] leading-relaxed">
                    {t("quarantine_desc2")}
                  </p>
                </div>

                <button
                  onClick={() => { setShowLoginUI(false); setSandboxAccepted(true); }}
                  className="w-full py-8 rounded-xl font-black text-sm capitalize tracking-[0.4em] transition-all bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-red-400 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-red-200 hover:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] shadow-md hover:shadow-md active:scale-95 group flex items-center justify-center gap-4"
                >
                  {t("btn_sandbox")}
                  <span className="opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 duration-300">
                    &rarr;
                  </span>
                </button>
              </div>
            </div>

            <div className="w-full flex justify-center p-8 border-t border-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
              <span className="text-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[9px] font-black capitalize tracking-[0.5em]">{t("offline_mode")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen items-center justify-center font-sans relative overflow-hidden transition-colors duration-1000" 
         style={{ 
           backgroundImage: 'var(--bgGradient)', 
           backgroundSize: 'cover',
           backgroundPosition: 'center',
           backgroundRepeat: 'no-repeat',
           backgroundAttachment: 'fixed',
           color: 'var(--text)' 
         }}>
      <div className={`relative z-10 w-[90%] ${(!isLogin && !isResetPassword) ? 'max-w-5xl' : 'max-w-xl'} bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-[60px] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_20px_color-mix(in_srgb,var(--accent)_5%,transparent)] flex flex-col group transition-all duration-500 overflow-hidden max-h-[95dvh]`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--text)_10%,transparent)] to-[color-mix(in_srgb,var(--bg)_20%,transparent)] pointer-events-none" />
        <div className={`flex w-full h-full ${(!isLogin && !isResetPassword) ? 'flex-col md:flex-row' : 'flex-col'} overflow-y-auto overflow-x-hidden custom-scrollbar`}>
          <div className={`flex flex-col w-full ${(!isLogin && !isResetPassword) ? 'md:w-1/2 p-8 md:p-14 border-b md:border-b-0 md:border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)]' : 'p-10 md:p-16'} shrink-0 relative z-20`}>
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent opacity-50" />

            <div className="flex flex-col items-center justify-center text-center mb-10 relative z-20">
              {/* Centered Logo */}
              <div className="relative mb-6 w-20 h-20 flex items-center justify-center">
                <img
                  src={gameIcon || "/icon.png"}
                  alt="Logo"
                  className="w-full h-full object-contain hover:scale-110 hover:rotate-12 transition-all duration-700 cursor-pointer drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                />
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-[var(--headerText)] drop-shadow-md mb-2 transition-colors duration-500">
                {t("sidebar_app_title")}
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-accent opacity-80 transition-colors duration-500">
                {t("subtitle")}
              </p>
            </div>

            {showMfaChallenge ? (
              <form onSubmit={handleMfaAuth} className="flex flex-col gap-5 relative z-20" noValidate>
                <div className="relative group/input">
                  <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-50 group-focus-within/input:theme-text-accent group-focus-within/input:opacity-100 transition-all !text-[20px]">pin</span>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    autoComplete="off"
                    spellCheck="false"
                    maxLength={6}
                    placeholder="6-DIGIT AUTHENTICATOR CODE"
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-md transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:capitalize placeholder:tracking-widest placeholder:text-[10px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || mfaCode.length < 6}
                  className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-transparent text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  VERIFY 2FA
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMfaChallenge(false); supabase.auth.signOut(); }}
                  className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center gap-2 w-full text-center mt-2"
                >
                  CANCEL
                </button>
              </form>
            ) : (
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
                      className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-md transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:capitalize placeholder:tracking-widest placeholder:text-[10px]"
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
                    className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-md transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:capitalize placeholder:tracking-widest placeholder:text-[10px]"
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
                      className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] pl-14 pr-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] focus:shadow-md transition-all placeholder:text-[var(--subtext)] placeholder:opacity-50 placeholder:capitalize placeholder:tracking-widest placeholder:text-[10px]"
                    />
                  </div>
                )}



                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full mt-2 py-4 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-transparent text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {isResetPassword ? t("btn_send_reset") : isLogin ? t("btn_login") : t("btn_signup")}
                </button>
              </form>
            )}

            <div className="mt-4 relative z-20">
              <button
                onClick={() => { localStorage.removeItem("sanctuary_show_login"); setShowLoginUI(false); }}
                className="w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] active:scale-[0.98]"
              >
                {t("btn_skip")}
              </button>
            </div>

            <div className="flex items-center justify-center gap-2.5 mt-6 mb-2 relative z-20">
              <span className={`text-[9px] font-mono capitalize tracking-widest truncate ${status.includes('Error') || status.includes('Missing') ? 'text-[var(--danger)]' : 'theme-text-accent opacity-80'}`}>
                {status || t("status_standby")}
              </span>
            </div>

            <div className="mt-4 flex flex-col items-center gap-5 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-6 relative z-20">
              {!isResetPassword && (
                <button
                  type="button"
                  onClick={() => { setIsResetPassword(true); setStatus(""); }}
                  className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center gap-2 w-full text-center"
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
                className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] hover:text-[var(--text)] transition-colors flex items-center justify-center gap-2 w-full text-center"
              >
                <span className="material-symbols-outlined !text-[14px]">{t("icon_switch_account")}</span>
                {isResetPassword ? t("toggle_to_login_from_reset") : isLogin ? t("toggle_to_signup") : t("toggle_to_login")}
              </button>
            </div>
          </div>

          {!isLogin && !isResetPassword && (
            <div className="flex flex-col w-full md:w-1/2 p-8 md:p-14 justify-center gap-10 shrink-0 relative z-10 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
              <div className="flex flex-col items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-6">
                <div className="relative mb-4 w-16 h-16 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-lg">
                  <span className="material-symbols-outlined !text-[32px] theme-text-accent opacity-80">admin_panel_settings</span>
                </div>
                <h3 className="text-2xl font-black tracking-tighter text-[var(--headerText)] text-center">{t("network_access_guidelines_header")}</h3>
                <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--subtext)] opacity-70 text-center">{t("network_access_guidelines_desc")}</p>
              </div>

              <div className="flex flex-col gap-8">
                <div className="flex items-start gap-5">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <span className="material-symbols-outlined !text-[20px] text-green-500">shield</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("auth_privacy_title")}</span>
                    <p className="text-[11px] leading-relaxed font-medium text-[var(--subtext)] opacity-80">{t("auth_privacy_desc")}</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_rgba(192,132,252,0.1)]">
                    <span className="material-symbols-outlined !text-[20px] text-purple-400">visibility_off</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("auth_anon_title")}</span>
                    <p className="text-[11px] leading-relaxed font-medium text-[var(--subtext)] opacity-80">{t("auth_anon_desc")}</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_rgba(96,165,250,0.1)]">
                    <span className="material-symbols-outlined !text-[20px] text-blue-400">mark_email_read</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("auth_masked_title")}</span>
                    <p className="text-[11px] leading-relaxed font-medium text-[var(--subtext)] opacity-80">{t("auth_masked_desc")}</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_rgba(250,204,21,0.1)]">
                    <span className="material-symbols-outlined !text-[20px] text-yellow-400">cloud_done</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">{t("auth_cloud_title")}</span>
                    <p className="text-[11px] leading-relaxed font-medium text-[var(--subtext)] opacity-80">{t("auth_cloud_desc")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




