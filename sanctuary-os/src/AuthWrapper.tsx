import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const setSession = useStore((state) => state.setSession);
  const [loadingSession, setLoadingSession] = useState(true);

  // Login Form States
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [showLoginUI, setShowLoginUI] = useState(() => localStorage.getItem("sanctuary_show_login") === "true");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  },[]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (!isLogin && !username)) {
      setStatus(t("auth_err_missing"));
      return;
    }

    setIsProcessing(true);
    setStatus(t("auth_status_authenticating"));

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }, // This triggers the SQL function we just wrote!
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

  // If verifying initial load, show a stealthy loading state
  if (loadingSession) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)]">
        <span className="text-xs font-black uppercase tracking-[0.3em] theme-text-accent animate-pulse">
          {t("auth_loading_session")}
        </span>
      </div>
    );
  }

  // If authenticated or not explicitly showing login UI, render the OS!
  if (session || !showLoginUI) {
    return <>{children}</>;
  }

  // If not authenticated and showLoginUI is true, render the Glassmorphism Login Screen
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg)] font-sans relative overflow-hidden">
      {/* Background Thematic Blobs */}
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] rounded-full theme-bg-accent opacity-10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30vw] h-[30vw] rounded-full bg-[var(--warning)] opacity-5 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10 flex flex-col">
        <h1 className="text-3xl font-black uppercase tracking-tighter text-[var(--text)] mb-2">
          {t("auth_title")}
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] mb-8">
          {t("auth_subtitle")}
        </p>

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {!isLogin && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth_placeholder_username")}
              className="w-full bg-black/40 border border-white/10 px-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)]"
            />
          )}
          
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth_placeholder_email")}
            className="w-full bg-black/40 border border-white/10 px-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)]"
          />
          
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth_placeholder_password")}
            className="w-full bg-black/40 border border-white/10 px-6 py-4 rounded-2xl text-sm font-bold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--subtext)]"
          />

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full mt-4 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all theme-bg-accent text-[var(--bg)] hover:scale-[1.02] active:scale-95 shadow-lg disabled:opacity-50 disabled:scale-100"
          >
            {isLogin ? t("auth_btn_login") : t("auth_btn_signup")}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={() => { localStorage.removeItem("sanctuary_show_login"); setShowLoginUI(false); }}
            className="w-full py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all bg-white/5 text-[var(--text)] hover:bg-white/10 hover:scale-[1.02] active:scale-95 border border-white/10"
          >
            {t("auth_btn_skip") || "SKIP FOR NOW"}
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 border-t border-white/10 pt-6">
          <button
            onClick={() => { setIsLogin(!isLogin); setStatus(""); }}
            className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] transition-colors"
          >
            {isLogin ? t("auth_toggle_to_signup") : t("auth_toggle_to_login")}
          </button>
          
          <div className="flex items-center gap-2 mt-2 bg-black/40 px-4 py-2 rounded-lg border border-white/5 w-full">
            <div className={`w-1.5 h-1.5 rounded-full ${status.includes('Error') || status.includes('Missing') ? 'bg-[var(--danger)]' : 'theme-bg-accent'} animate-pulse`} />
            <span className={`text-[8px] font-mono uppercase tracking-widest truncate ${status.includes('Error') || status.includes('Missing') ? 'text-[var(--danger)]' : 'text-[var(--subtext)]'}`}>
              {status || t("auth_status_standby")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}