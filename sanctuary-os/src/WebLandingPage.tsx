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
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import packageJson from '../package.json';
import { UniversalCard } from './components/universal/UniversalCard';

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

  const navigateToGame = async (gameId: string) => {
    if (isDesktop()) {
      try {
        const globalConfig: any = await invoke("get_global_config");
        globalConfig.active_workspace_id = gameId;
        await invoke("save_coordinates", { config: globalConfig });
        localStorage.setItem('sanctuary_last_active_workspace', gameId);
        setTimeout(() => window.location.reload(), 10);
      } catch (err) {
        console.error("Failed to swap workspace on desktop:", err);
      }
    } else {
      const host = window.location.host;
      const protocol = window.location.protocol;
      window.location.href = `${protocol}//${host}/${gameId}`;
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-start relative pt-0 px-6 md:px-0 pb-0">
      <WebLegalViewer />

      <main className="w-full flex flex-col gap-12 relative z-10 px-0 lg:px-4 pb-12">
        <div className="absolute top-6 right-6 z-[100] hidden md:flex items-center gap-4">
        </div>

        <header className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-4 md:mt-0">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter leading-none text-[var(--text)] drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] break-words">
              {t("landing_welcome")}
            </h1>
            <p className="text-sm md:text-base font-bold uppercase tracking-widest opacity-80 max-w-3xl leading-relaxed text-[var(--subtext)] drop-shadow-md mt-2">
              {t("landing_subtitle")}
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-12 w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 fill-mode-both">

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
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {loading ? (
                  <div className="col-span-full py-12 flex justify-center">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]">autorenew</span>
                  </div>
                ) : games.length === 0 ? (
                  <div className="col-span-full py-12 flex items-center justify-center opacity-50 font-bold uppercase tracking-widest glass-panel rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                    {t("landing_no_workspaces")}
                  </div>
                ) : (
                  <>
                    {games.map(game => (
                      <div key={game.id} onClick={() => navigateToGame(game.schema_id)} className="cursor-pointer grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center justify-items-center sm:justify-items-start gap-4 sm:gap-6 p-4 md:p-6 rounded-3xl glass-panel bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_10px_40px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-1 transition-all duration-500 group overflow-hidden relative backdrop-blur-2xl">
                        <div className="absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-2xl glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-500 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] overflow-hidden relative z-10 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]">
                          <div className="absolute inset-0 bg-gradient-to-tr from-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
                          {game.icon ? (
                            <img src={game.icon} alt="" className="w-10 h-10 md:w-12 md:h-12 object-contain drop-shadow-lg opacity-80 group-hover:opacity-100 transition-all duration-500 relative z-10" />
                          ) : (
                            <span className="material-symbols-outlined !text-[36px] md:!text-[44px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors duration-500 relative z-10">{game.name?.toLowerCase().includes('sims') ? 'home' : 'sports_esports'}</span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5 min-w-0 z-10 text-center sm:text-left w-full">
                          <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] group-hover:text-[var(--accent)] transition-colors duration-500 drop-shadow-sm break-words">{game.name}</h3>
                          <span className="text-xs font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 break-words">{t("landing_id_prefix") || "ID: "}{game.schema_id}</span>
                        </div>

                        <div className="shrink-0 z-10 w-full sm:w-auto">
                          <div className="w-full sm:w-auto px-6 py-3 md:py-4 rounded-xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs md:text-sm font-black uppercase tracking-widest text-[var(--text)] opacity-80 group-hover:opacity-100 group-hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] group-hover:text-[var(--accent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] transition-all flex items-center justify-center gap-3">
                            {t("launch") || "Launch Workspace"}
                            <span className="material-symbols-outlined !text-[20px] group-hover:translate-x-1 transition-transform duration-300">arrow_forward</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>

          <section id="sanctuary_foundry_news" className="flex flex-col gap-6 scroll-mt-24 mt-8">
            <div className="flex items-center justify-between w-full gap-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-4 drop-shadow-md">
                <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]">
                  <span className="material-symbols-outlined text-[var(--accent)]">campaign</span>
                </div>
                {t("landing_news") || "Sanctuary Foundry News"}
              </h2>
            </div>
            <div className="w-full">
              <WebNewsFeed />
            </div>
          </section>

        </div>

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

        {!isDesktop() && (
          <section id="download" className="w-full mt-12 mb-12 scroll-mt-24 z-10 relative">

            <div className="flex items-center gap-4 mb-4 px-2">
              <span className="material-symbols-outlined text-[var(--text)] opacity-80 !text-[24px]">system_update_alt</span>
              <h2 className="text-sm md:text-base font-black uppercase tracking-widest text-[var(--text)] drop-shadow-md">
                {t("landing_download") || "DOWNLOAD DESKTOP CLIENT"}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">

              <div className="col-span-full md:hidden flex flex-col">
                <UniversalCard
                  layout="vertical"
                  icon="desktop_windows"
                  title={<span className="text-[var(--text)]">{t("landing_desktop_only_title") || "Desktop Application"}</span>}
                  subtitle={<span className="text-[10px] font-mono tracking-widest text-[var(--text)]">{t("landing_desktop_only_footer") || "UNSUPPORTED DEVICE"}</span>}
                  className="h-full bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--text)] opacity-80 uppercase tracking-widest">
                      <span></span>
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">warning</span> {t("landing_desktop_only_footer") || "UNSUPPORTED DEVICE"}</span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--text)] leading-relaxed mt-2 opacity-80">
                    {t("landing_desktop_only_desc") || "Sanctuary OS is a native desktop client. Please visit this page on a PC or Mac to install the application."}
                  </p>
                </UniversalCard>
              </div>

              <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64-setup.exe`} className="hidden md:block group">
                <UniversalCard
                  layout="vertical"
                  icon="rocket_launch"
                  title={<span className="group-hover:text-[var(--accent)] transition-colors">{t("landing_download_native_title") || "Sanctuary OS Native"}</span>}
                  subtitle={<span className="text-[10px] font-mono tracking-widest">{t("landing_download_native_subtitle") || "Windows (.exe)"}</span>}
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_20px_40px_rgba(var(--accent-rgb),0.1)] transition-all duration-500 hover:-translate-y-1"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                      <span>v{packageJson.version}</span>
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">download</span> {t("landing_download_native_footer") || "STANDARD INSTALL"}</span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t("landing_download_desc")}
                  </p>
                </UniversalCard>
              </a>

              <a href={`https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${packageJson.version}/Sanctuary.OS_${packageJson.version}_x64_en-US.msi`} className="hidden md:block group">
                <UniversalCard
                  layout="vertical"
                  icon="api"
                  title={<span className="group-hover:text-[var(--text)] transition-colors">{t("landing_download_enterprise_title") || "Enterprise Deploy"}</span>}
                  subtitle={<span className="text-[10px] font-mono tracking-widest">{t("landing_download_enterprise_subtitle") || "Windows (.msi)"}</span>}
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] transition-all duration-500 hover:-translate-y-1"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                      <span>v{packageJson.version}</span>
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">business</span> {t("landing_download_enterprise_footer") || "SILENT DEPLOY"}</span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t("landing_download_enterprise_desc") || "Designed for automated environments and mass deployment. Includes silent installation flags and registry provisioning."}
                  </p>
                </UniversalCard>
              </a>

            </div>
          </section>
        )}

      </main>

      <footer className="w-full py-12 mt-8 flex flex-col md:flex-row items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 max-md:pb-[100px] gap-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <span className="material-symbols-outlined text-[20px] text-[var(--text)] opacity-80">shield</span>
          </div>
          <div className="text-xs font-black uppercase tracking-widest opacity-60 text-[var(--text)]">
            {t("landing_copyright") || "Sanctuary OS \u00A9 2026 Sanctuary Foundry"}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-end gap-8 text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--text)]">
          <a href="#eula" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_eula") || "End User License Agreement"}
          </a>
          <a href="#terms" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_terms") || "Terms of Service"}
          </a>
          <a href="#privacy" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_privacy") || "Privacy Policy"}
          </a>
        </div>
      </footer>
    </div>
  );
}
