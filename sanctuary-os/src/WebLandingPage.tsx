import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { getSubdomain } from './utils/routingUtils';
import WebNewsFeed from './WebNewsFeed';
import WebLegalViewer from './WebLegalViewer';
import { DashboardStatTile, standardButtonClass, standardAccentGlassButtonClass } from './shared';
import { SystemBackground } from './SystemBackground';
import packageJson from '../package.json';

export default function WebLandingPage() {
  const { t } = useLexicon();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      const { data } = await supabase.from('sanctuary_games').select('*');
      if (data) setGames(data);
      setLoading(false);
    };
    fetchGames();
  }, []);

  const navigateToGame = (gameId: string) => {
    const host = window.location.host;
    const protocol = window.location.protocol;
    const currentSubdomain = getSubdomain();
    let newHost = host;
    if (currentSubdomain) {
      newHost = host.replace(`${currentSubdomain}.`, `${gameId}.`);
    } else {
      newHost = `${gameId}.${host}`;
    }
    window.location.href = `${protocol}//${newHost}`;
  };

  return (
    <div className="w-full flex flex-col items-center justify-start relative pt-8 px-6 md:px-0 pb-0">
      <WebLegalViewer />

      <main className="w-full flex flex-col gap-12 relative z-10 px-0 lg:px-4 pb-12">

        {/* Top Header: System Status & Stats */}
        <header className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-none text-[var(--text)] drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              {t("landing_welcome")}
            </h1>
            <p className="text-sm md:text-base font-bold uppercase tracking-widest opacity-80 max-w-3xl leading-relaxed text-[var(--subtext)] drop-shadow-md mt-2">
              {t("landing_subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full shrink-0">
            <DashboardStatTile icon={<span className="material-symbols-outlined">dns</span>} number={games.length} label={t("landing_active_nodes")} colorClass="text-[var(--accent)]" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">api</span>} number={320} label={t("landing_api_calls")} colorClass="text-purple-500" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">verified_user</span>} number={0} label={t("landing_auth_status")} colorClass="text-blue-500" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">public</span>} number={1} label={t("landing_system_status")} colorClass="text-emerald-500" />
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] 2xl:grid-cols-[1fr_500px] gap-12 w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 fill-mode-both">
          
          {/* Left Column: Workspaces */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between w-full gap-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-4 drop-shadow-md">
                <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                  <span className="material-symbols-outlined text-[var(--accent)]">public</span>
                </div>
                {t("landing_workspaces")}
              </h2>
            </div>

            <div className="w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loading ? (
                  <div className="col-span-full py-12 flex justify-center">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]">autorenew</span>
                  </div>
                ) : games.length === 0 ? (
                  <div className="col-span-full py-12 flex items-center justify-center opacity-50 font-bold uppercase tracking-widest glass-panel rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                    {t("landing_no_workspaces")}
                  </div>
                ) : (
                  games.map(game => (
                    <div key={game.id} onClick={() => navigateToGame(game.schema_id)} className="cursor-pointer flex flex-col gap-4 p-5 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative">
                      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] group-hover:via-[var(--accent)] to-transparent opacity-50 transition-colors duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-[color-mix(in_srgb,var(--accent)_5%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)] transition-all">
                          <span className="material-symbols-outlined text-[24px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">
                            {game.name?.toLowerCase().includes('sims') ? 'home' : 'sports_esports'}
                          </span>
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <h3 className="text-base font-black uppercase tracking-wider text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">{game.name}</h3>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-70 group-hover:opacity-100 transition-opacity truncate">{t("landing_initialize")}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Right Column: News Feed */}
          <aside className="flex flex-col gap-6">
            <div className="flex items-center justify-between w-full gap-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-4 drop-shadow-md">
                <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <span className="material-symbols-outlined text-[var(--subtext)]">newspaper</span>
                </div>
                {t("landing_news")}
              </h2>
            </div>
            <div className="w-full">
              <WebNewsFeed />
            </div>
          </aside>

        </div>

        {/* Full-width Download Panel (Pinned Item Style) */}
        <section className="w-full glass-panel rounded-3xl p-8 md:p-12 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group mt-4 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-[2000ms] ease-in-out pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,var(--accent),transparent_70%)] opacity-10 pointer-events-none mix-blend-screen" />

          <div className="flex-1 flex flex-col gap-4 relative z-10">
            <h2 className="text-3xl font-black uppercase tracking-widest text-[var(--text)] drop-shadow-md">
              {t("landing_download")}
            </h2>
            <p className="text-[var(--subtext)] text-sm font-bold uppercase tracking-widest opacity-80 max-w-2xl leading-relaxed">
              {t("landing_download_desc")}
            </p>

            <div className="flex flex-wrap gap-5 mt-2">
              <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64-setup.exe`} className={`${standardButtonClass} !py-3 !px-6 !text-sm !rounded-xl relative overflow-hidden group/btn`}>
                <div className="absolute inset-0 rounded-[inherit] -z-10 pointer-events-none backdrop-blur-md firefox-safe-glass group-hover/btn:opacity-0 transition-opacity" />
                <span className="material-symbols-outlined !text-[22px] relative z-10">download</span>
                <span className="relative z-10">{t("landing_win_exe") || "Windows (.exe)"}</span>
              </a>
              <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64_en-US.msi`} className={`${standardAccentGlassButtonClass} !py-3.5 !px-8 !text-sm !rounded-xl relative overflow-hidden group/btn hover:border-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)] transition-all`}>
                <div className="absolute inset-0 rounded-[inherit] -z-10 pointer-events-none backdrop-blur-md firefox-safe-glass" />
                <span className="material-symbols-outlined !text-[22px] relative z-10 text-[var(--subtext)] group-hover/btn:text-[var(--accent)] transition-colors">api</span>
                <span className="relative z-10 text-[var(--text)]">{t("landing_win_msi") || "Windows (.msi)"}</span>
              </a>
            </div>
          </div>

          <div className="shrink-0 relative z-10 hidden md:flex flex-col items-end gap-3 text-right">
            <div className="relative">
              <div className="absolute inset-0 bg-[var(--accent)] blur-[40px] opacity-40 rounded-full" />
              <span className="material-symbols-outlined text-[120px] text-[var(--accent)] drop-shadow-[0_0_20px_var(--accent)] opacity-90 transform group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-700 relative z-10">
                devices
              </span>
            </div>
            <div className="text-xs md:text-sm font-black uppercase tracking-[0.3em] text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)] mt-2 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
              {t("landing_system_version") || "SYSTEM VERSION"} v{packageJson.version}
            </div>
          </div>
        </section>

      </main>

      {/* Simplified Footer */}
      <footer className="w-full py-8 mt-12 flex flex-col md:flex-row items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-40 text-[var(--text)]">
          {t("landing_copyright") || "Sanctuary OS © 2026 Sanctuary Foundry"}
        </div>
        <div className="flex gap-8 mt-4 md:mt-0">
          <button onClick={() => window.location.hash = 'eula'} className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
            {t("landing_eula") || "EULA"}
          </button>
          <button onClick={() => window.location.hash = 'privacy'} className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
            {t("landing_privacy") || "Privacy Policy"}
          </button>
          <button onClick={() => window.location.hash = 'terms'} className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--accent)] transition-colors">
            {t("landing_terms") || "Terms of Service"}
          </button>
        </div>
      </footer>
    </div>
  );
}
