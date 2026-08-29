import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { getSubdomain } from './utils/routingUtils';
import WebNewsFeed from './WebNewsFeed';
import WebDocumentFeed from './WebDocumentFeed';
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
    window.location.href = `${protocol}//${host}/${gameId}`;
  };

  return (
    <div className="w-full flex flex-col items-center justify-start relative pt-0 px-6 md:px-0 pb-0">
      <WebLegalViewer />

      <main className="w-full flex flex-col gap-12 relative z-10 px-0 lg:px-4 pb-12">

        {/* Top Header: System Status & Stats */}
        <header className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-4 md:mt-0">
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter leading-none text-[var(--text)] drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              {t("landing_welcome")}
            </h1>
            <p className="text-sm md:text-base font-bold uppercase tracking-widest opacity-80 max-w-3xl leading-relaxed text-[var(--subtext)] drop-shadow-md mt-2">
              {t("landing_subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full shrink-0">
            <DashboardStatTile icon={<span className="material-symbols-outlined">dns</span>} number={games.length} label={t("landing_active_nodes") || "ACTIVE WORKSPACES"} colorClass="text-[var(--accent)]" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">verified_user</span>} value="ONLINE" label="SYSTEM STATUS" colorClass="text-emerald-500" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">shield</span>} value="SECURED" label="GLOBAL NETWORK" colorClass="text-blue-500" />
            <DashboardStatTile icon={<span className="material-symbols-outlined">api</span>} value="ACTIVE" label="CORE REGISTRY" colorClass="text-purple-500" />
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] 2xl:grid-cols-[1fr_500px] gap-12 w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 fill-mode-both">

          {/* Left Column: Workspaces */}
          <section id="workspaces" className="flex flex-col gap-6 scroll-mt-24">
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
                    <div key={game.id} onClick={() => navigateToGame(game.schema_id)} className="cursor-pointer flex flex-col gap-0 rounded-3xl glass-panel bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_10px_40px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-1 transition-all duration-500 group overflow-hidden relative backdrop-blur-2xl">
                      <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                      <div className="p-6 md:p-8 flex flex-col gap-6 relative z-10 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] transition-all duration-500 bg-[color-mix(in_srgb,var(--text)_3%,transparent)]">
                              <span className="material-symbols-outlined !text-[28px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors duration-500">{game.name?.toLowerCase().includes('sims') ? 'home' : 'sports_esports'}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-500">{game.name}</h3>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60">ID: {game.schema_id}</span>
                            </div>
                          </div>
                          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] transition-all duration-500">
                            <span className="material-symbols-outlined !text-[24px] text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-500">arrow_forward</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Right Column: News Feed */}
          <aside id="news" className="flex flex-col gap-6 scroll-mt-24">
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

        {/* System Directives (Documents) - Full Width */}
        <section id="system_directives" className="w-full flex flex-col gap-6 mt-16 mb-8 scroll-mt-24">
          <div className="flex items-center justify-between w-full gap-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-4 drop-shadow-md">
              <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]">
                <span className="material-symbols-outlined text-[var(--accent)]">folder_special</span>
              </div>
              {t("landing_system_directives")}
            </h2>
          </div>
          <div className="w-full">
            <WebDocumentFeed />
          </div>
        </section>

        {/* Premium OS Download Call to Action - Glassmorphism Restored */}
        <section id="download" className="w-full mt-12 mb-12 relative flex flex-col lg:flex-row items-center justify-between gap-10 p-10 md:p-12 rounded-[40px] glass-panel bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.2)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_20px_60px_rgba(var(--accent-rgb),0.1)] transition-all duration-700 overflow-hidden group backdrop-blur-3xl scroll-mt-24">

          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10 text-center md:text-left">
            <div className="w-24 h-24 shrink-0 rounded-3xl glass-panel bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shadow-[0_0_30px_rgba(var(--accent-rgb),0.1)] group-hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.3)] group-hover:scale-105 group-hover:-rotate-3 transition-all duration-700">
              <span className="material-symbols-outlined text-[48px] text-[var(--accent)] drop-shadow-[0_0_10px_var(--accent)]">
                system_update_alt
              </span>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-widest text-[var(--text)] leading-tight">
                {t("landing_download") || "DOWNLOAD DESKTOP CLIENT"}
              </h2>
              <p className="text-[var(--subtext)] text-sm font-bold uppercase tracking-widest opacity-80 max-w-xl leading-relaxed">
                {t("landing_download_desc")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 relative z-10 shrink-0">
            <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64-setup.exe`} className="px-8 py-5 rounded-2xl glass-panel bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[var(--text)] font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-1 transition-all duration-300">
              <span className="material-symbols-outlined !text-[24px]">download</span>
              Windows (.exe)
            </a>

            <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64_en-US.msi`} className="px-8 py-5 rounded-2xl glass-panel bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--text)] hover:text-[var(--accent)] font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.2)] hover:-translate-y-1 transition-all duration-300">
              <span className="material-symbols-outlined !text-[24px]">api</span>
              Windows (.msi)
            </a>
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
