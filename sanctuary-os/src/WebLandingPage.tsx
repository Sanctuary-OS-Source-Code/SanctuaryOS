import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useLexicon, normalizeAllCapsForThemeCase } from './LexiconContext';
import { useStore } from './store';
import { scrollToLandingSection } from './utils/routingUtils';
import WebNewsFeed from './WebNewsFeed';
import WebDocumentFeed from './WebDocumentFeed';
import WebLegalViewer from './WebLegalViewer';
import { handleOpenUrl, ViewHeader } from './shared';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import packageJson from '../package.json';
import { UniversalCard } from './components/universal/UniversalCard';
import { usePwaInstall } from './utils/pwaManager';
import { getKeepersPipelineConfig, getSupporterState, buildPartnerCheckoutUrl, DEFAULT_KEEPERS_PIPELINE_CONFIG, KeepersPipelineConfig } from './utils/supporterManager';
import { ReleaseNotesShowcase } from './components/ReleaseNotesShowcase';
import { CommandScreenSectionHeading } from './hub-components/SharedCommandScreenLayout';

export default function WebLandingPage() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);
  const setView = useStore((state: any) => state.setView);
  const setIsConfigured = useStore((state: any) => state.setIsConfigured);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keepersConfig, setKeepersConfig] = useState<KeepersPipelineConfig>(DEFAULT_KEEPERS_PIPELINE_CONFIG);
  const [isDevUnlocked, setIsDevUnlocked] = useState(false);
  const { isStandalone, triggerInstall } = usePwaInstall();

  useEffect(() => {
    const fetchGames = async () => {
      const [{ data }, pipelineCfg, supState] = await Promise.all([
        supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor'),
        getKeepersPipelineConfig(),
        getSupporterState('web', session?.user?.id),
      ]);
      if (data) setGames(data);
      if (pipelineCfg) setKeepersConfig(pipelineCfg);
      if (supState?.dev_build?.dev_build_until) {
        setIsDevUnlocked(supState.dev_build.dev_build_until > Math.floor(Date.now() / 1000));
      }
      setLoading(false);
    };
    fetchGames();
  }, [session?.user?.id]);

  const stableVersion = (keepersConfig.stable_version || packageJson.version.split('-')[0] || packageJson.version).replace(/^v/i, '').trim();

  useEffect(() => {
    const handleInitialHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['workspaces', 'news', 'sanctuary_foundry_news', 'release_notes', 'system_directives', 'download'].includes(hash)) {
        setTimeout(() => scrollToLandingSection(hash), 150);
      }
    };
    handleInitialHash();
    window.addEventListener('hashchange', handleInitialHash);
    return () => window.removeEventListener('hashchange', handleInitialHash);
  }, []);

  const navigateToGame = async (gameId: string) => {
    if (isDesktop()) {
      if (gameId === activeWorkspaceId) {
        setIsConfigured(true);
        setView("dashboard");
        return;
      }
      try {
        const globalConfig: any = await invoke("get_global_config");
        globalConfig.active_workspace_id = gameId;
        await invoke("save_coordinates", { config: globalConfig });
        localStorage.setItem('sanctuary_last_active_workspace', gameId);
        setIsConfigured(true);
        setView("dashboard");
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
    <div className="w-full flex flex-col items-center justify-start relative pt-0 px-0 pb-0">
      <WebLegalViewer />

      <main className="w-full flex flex-col gap-0 relative z-10 px-0 pb-12">
        <div className="absolute top-6 right-6 z-[100] hidden md:flex items-center gap-4">
        </div>

        <ViewHeader
          title={t("landing_welcome", "Welcome to Sanctuary OS")}
          subtitle={t("landing_subtitle", "Your centralized hub for community-driven game modifications, {blueprints}, and assets. Select a workspace below to enter.")}
          icon={t("icon_shield", "shield")}
        />

        <div className="flex flex-col gap-8 md:gap-12 w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-150 fill-mode-both">

          <section id="workspaces" className="flex flex-col gap-6 scroll-mt-24">
            <CommandScreenSectionHeading
              title={t("landing_workspaces", "Active Workspaces")}
              icon={t("icon_public", "public")}
            />

            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                  <div className="col-span-full py-12 flex justify-center">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]">{t("icon_autorenew", "autorenew")}</span>
                  </div>
                ) : games.length === 0 ? (
                  <div className="col-span-full py-12 flex items-center justify-center opacity-50 font-bold uppercase tracking-widest glass-panel rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                    {t("landing_no_workspaces", "No Active Workspaces")}
                  </div>
                ) : (
                  <>
                    {games.map(game => {
                      const isActive = isDesktop() && game.schema_id === activeWorkspaceId;
                      const matchingWs = (workspaces || []).find(
                        (w: any) => w.schema_id === game.schema_id || w.id === game.schema_id
                      );
                      const isWorkspaceConfigured = Boolean(
                        matchingWs?.mods_path ||
                          matchingWs?.live_path ||
                          matchingWs?.vault_path ||
                          isActive
                      );

                      return (
                        <div
                          key={game.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigateToGame(game.schema_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigateToGame(game.schema_id);
                            }
                          }}
                          className={`relative glass-panel p-5 rounded-2xl flex flex-col gap-3.5 border text-left group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 ${
                            isActive
                              ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_65%,transparent)]"
                              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          }`}
                        >
                          {/* Top Row: Icon Box on Left + Outline Status Badge on Right */}
                          <div className="flex justify-between items-start gap-3 relative z-10">
                            <div
                              className={`w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 transition-colors duration-300 ${
                                isActive
                                  ? "text-[var(--accent)]"
                                  : "text-[var(--subtext)] group-hover:text-[var(--accent)]"
                              }`}
                            >
                              {game.icon ? (
                                <img
                                  src={game.icon}
                                  alt=""
                                  className="w-6 h-6 object-contain drop-shadow-sm"
                                />
                              ) : (
                                <span className="material-symbols-outlined !text-[22px]">
                                  {t("icon_sports_esports", "sports_esports")}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  <span>{t("active", "Active")}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  <span>
                                    {isWorkspaceConfigured
                                      ? t("workspace_badge_configured", "Configured")
                                      : t("workspace_badge_ready", "Ready")}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Middle Block: Overline + Prominent Title + Concise Description */}
                          <div className="flex flex-col gap-1 relative z-10 mt-0.5">
                            <span
                              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                                isActive
                                  ? "text-[var(--accent)]"
                                  : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)] group-hover:opacity-100"
                              }`}
                            >
                              {t("workspace_card_overline", "Game Workspace")}
                            </span>
                            <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors truncate m-0">
                              {game.name}
                            </h3>
                            <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0">
                              {isActive
                                ? t("workspace_card_desc_active", "Currently active environment for {mod} deployment, diagnostics, and backups.")
                                : t("workspace_card_desc_available", "Select to mount this game workspace and load its {vault}, {blueprints}, and tools.")}
                            </p>
                          </div>

                          {/* Bottom Footer Row: Schema Code + Action Label */}
                          <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                              {game.schema_id}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 transition-colors ${
                                isActive
                                  ? "text-[var(--accent)]"
                                  : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--accent)] group-hover:opacity-100"
                              }`}
                            >
                              <span>
                                {isActive
                                  ? t("workspace_btn_enter", "Enter Workspace")
                                  : t("launch", "Launch")}
                              </span>
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_arrow_forward", "arrow_forward")}
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </section>

          <section id="news" className="flex flex-col gap-6 scroll-mt-24 mt-8">
            <div id="sanctuary_foundry_news" className="hidden" />
            <CommandScreenSectionHeading
              title={t("landing_news", "Sanctuary Foundry News")}
              icon={t("icon_campaign", "campaign")}
            />
            <div className="w-full">
              <WebNewsFeed />
            </div>
          </section>

          <section id="release_notes" className="flex flex-col gap-6 scroll-mt-24 mt-8">
            <CommandScreenSectionHeading
              title={t("release_notes_section_title", "Current Build Release Notes")}
              icon={t("icon_new_releases", "new_releases")}
            />
            <ReleaseNotesShowcase versionLabel={stableVersion} />
          </section>

        </div>

        <section id="system_directives" className="w-full flex flex-col gap-6 mt-16 mb-8 scroll-mt-24">
          <CommandScreenSectionHeading
            title={t("landing_system_directives", "Public Documents")}
            icon={t("icon_folder_special", "folder_special")}
          />
          <div className="w-full">
            <WebDocumentFeed />
          </div>
        </section>

        {!isDesktop() && (
          <section id="download" className="w-full flex flex-col gap-6 mt-12 mb-12 scroll-mt-24 z-10 relative">

            <CommandScreenSectionHeading
              title={
                <>
                  <span className="md:hidden">
                    {t("landing_install_pwa", "Install the PWA")}
                  </span>
                  <span className="hidden md:inline">
                    {t("landing_download", "Download the Desktop Client")}
                  </span>
                </>
              }
              icon={t("icon_system_update_alt", "system_update_alt")}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">

              <div className="flex flex-col group cursor-pointer" onClick={() => { if (!isStandalone) triggerInstall(); }}>
                <UniversalCard
                  layout="vertical"
                  icon={t("icon_install_mobile", "install_mobile")}
                  title={
                    <span className="group-hover:text-[var(--accent)] transition-colors">
                      {t("pwa_install_title", "Install Sanctuary Web App")}
                    </span>
                  }
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t("pwa_install_subtitle", "Progressive Web App (iOS / Android / Web)")}
                    </span>
                  }
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_20px_40px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all duration-500 hover:-translate-y-1"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--accent)] uppercase tracking-widest transition-all">
                      <span>{t("pwa_badge_standalone", "STANDALONE PWA")}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-[14px]">
                          {isStandalone
                            ? t("icon_check_circle", "check_circle")
                            : t("icon_add_to_home_screen", "add_to_home_screen")}
                        </span>
                        {isStandalone
                          ? t("pwa_btn_installed", "App Installed")
                          : t("pwa_btn_install", "Install App")}
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      "pwa_install_desc",
                      "Install Sanctuary OS directly to your home screen or app drawer for a full-screen standalone experience with instant workspace access."
                    )}
                  </p>
                </UniversalCard>
              </div>

              <a href={keepersConfig.stable_exe_url || `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${stableVersion}/Sanctuary.OS_${stableVersion}_x64-setup.exe`} className="hidden md:block group">
                <UniversalCard
                  layout="vertical"
                  icon="rocket_launch"
                  title={<span className="group-hover:text-[var(--accent)] transition-colors">{t("landing_download_native_title", "Sanctuary OS Native") || "Sanctuary OS Native"}</span>}
                  subtitle={<span className="text-[10px] font-mono tracking-widest">{t("landing_win_exe", "Windows (.exe)") || "Windows (.exe)"}</span>}
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_20px_40px_color-mix(in srgb, var(--accent) 10%, transparent)] transition-all duration-500 hover:-translate-y-1"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                      <span>v{stableVersion}</span>
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">download</span> {t("landing_download_native_footer", "STANDARD INSTALL") || "STANDARD INSTALL"}</span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t("landing_download_desc", "Install the Native Client to access full hardware integration, heuristic threat scanning, and deep OS-level modifications.")}
                  </p>
                </UniversalCard>
              </a>

              <a href={keepersConfig.stable_msi_url || `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${stableVersion}/Sanctuary.OS_${stableVersion}_x64_en-US.msi`} className="hidden md:block group">
                <UniversalCard
                  layout="vertical"
                  icon="api"
                  title={<span className="group-hover:text-[var(--text)] transition-colors">{t("landing_download_enterprise_title", "Enterprise Deploy") || "Enterprise Deploy"}</span>}
                  subtitle={<span className="text-[10px] font-mono tracking-widest">{t("landing_win_msi", "Windows (.msi)") || "Windows (.msi)"}</span>}
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] transition-all duration-500 hover:-translate-y-1"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-50 uppercase tracking-widest">
                      <span>v{stableVersion}</span>
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">business</span> {t("landing_download_enterprise_footer", "SILENT DEPLOY") || "SILENT DEPLOY"}</span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t("landing_download_enterprise_desc", "Designed for automated environments and mass deployment. Includes silent installation flags and registry provisioning.") || "Designed for automated environments and mass deployment. Includes silent installation flags and registry provisioning."}
                  </p>
                </UniversalCard>
              </a>

              {isDevUnlocked && (
                <a href={keepersConfig.dev_build_download_url || "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"} target="_blank" rel="noopener noreferrer" className="hidden md:block group">
                  <UniversalCard
                    layout="vertical"
                    icon={t("icon_bolt", "bolt")}
                    title={<span className="group-hover:text-[var(--success)] transition-colors">{t("landing_download_dev_title", "Daily Dev Build (Supporter)")}</span>}
                    subtitle={<span className="text-[10px] font-mono tracking-widest">{t("landing_download_dev_subtitle", "Supporter Preview Channel (.exe)")}</span>}
                    className="h-full bg-[color-mix(in_srgb,var(--success)_4%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_55%,transparent)] hover:shadow-[0_20px_40px_color-mix(in_srgb,var(--success)_15%,transparent)] transition-all duration-500 hover:-translate-y-1"
                    footer={
                      <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--success)] opacity-80 uppercase tracking-widest">
                        <span>v{keepersConfig.dev_build_version || "dev-latest"}</span>
                        <span className="flex items-center gap-1.5"><span className="material-symbols-outlined !text-[14px]">{t("icon_bolt", "bolt")}</span> {t("landing_download_dev_footer", "SUPPORTER STREAM")}</span>
                      </div>
                    }
                  >
                    <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                      {t("landing_download_dev_desc", "Nightly preview build unlocked by your active Global Daily Dev Build supporter time.")}
                    </p>
                  </UniversalCard>
                </a>
              )}

            </div>
          </section>
        )}

        <section id="support" className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative">
          <CommandScreenSectionHeading
            title={t("landing_support_section_title", "Support Sanctuary OS & Partner Communities")}
            icon={t("icon_volunteer_activism", "volunteer_activism")}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            <UniversalCard
              layout="vertical"
              onClick={() =>
                handleOpenUrl(
                  buildPartnerCheckoutUrl(
                    keepersConfig.keepers_donation_url ||
                      "https://github.com/sponsors/Sanctuary-OS-Source-Code",
                    session?.user?.id,
                    session?.user?.email
                  )
                )
              }
              icon={t("icon_rocket_launch", "rocket_launch")}
              title={
                <span className="group-hover/card:text-[var(--accent)] transition-colors">
                  {t("supporter_keepers_title", "Sanctuary OS (Keepers Core)")}
                </span>
              }
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {t("supporter_keepers_subtitle", "Core OS Infrastructure • 0% Platform Fee • Stacks Global Daily Dev Builds")}
                </span>
              }
              className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_20px_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 hover:-translate-y-1 cursor-pointer"
              footer={
                <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-60 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-all">
                  <span>{t("landing_support_card_badge", "0% Platform Fee • +30 Days Dev Builds Per $5")}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_open_in_new", "open_in_new")}
                    </span>
                    {t("supporter_keepers_btn", "Support Sanctuary OS")}
                  </span>
                </div>
              }
            >
              <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                {t(
                  "supporter_keepers_desc",
                  "Directly support the Keepers building Sanctuary OS. Every $5 contribution dynamically stacks +30 days of Global Daily Dev Build access onto your account.",
                )}
              </p>
            </UniversalCard>

            {games
              .filter((g) => Boolean(g.donation_url && String(g.donation_url).trim().length > 0))
              .map((g) => (
                <UniversalCard
                  key={`support-${g.id}`}
                  layout="vertical"
                  onClick={() =>
                    handleOpenUrl(
                      buildPartnerCheckoutUrl(
                        g.donation_url,
                        session?.user?.id,
                        session?.user?.email
                      )
                    )
                  }
                  icon={g.icon ? undefined : t("icon_sports_esports", "sports_esports")}
                  customIcon={
                    g.icon ? (
                      <img
                        src={g.icon}
                        alt=""
                        className="w-10 h-10 object-contain drop-shadow-md opacity-80 group-hover/card:opacity-100 transition-opacity"
                      />
                    ) : undefined
                  }
                  title={
                    <span className="group-hover/card:text-[var(--accent)] transition-colors">
                      {g.name}
                    </span>
                  }
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {`${normalizeAllCapsForThemeCase((g.payment_processor || "Stripe").toUpperCase())} • ${t("supporter_zero_fee_badge", "0% Platform Fee • Non-Custodial")}`}
                    </span>
                  }
                  className="h-full bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:shadow-[0_20px_40px_color-mix(in_srgb,var(--accent)_10%,transparent)] transition-all duration-500 hover:-translate-y-1 cursor-pointer"
                  footer={
                    <div className="w-full flex items-center justify-between text-[9px] font-mono font-bold text-[var(--subtext)] opacity-60 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-all">
                      <span>{t("landing_support_card_badge", "0% Platform Fee • +30 Days Dev Builds Per $5")}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_open_in_new", "open_in_new")}
                        </span>
                        {t("supporter_btn_donate_partner", "Donate to Partner")}
                      </span>
                    </div>
                  }
                />
              ))}
          </div>
        </section>

      </main>

      <footer id="eula" className="w-full py-12 mt-8 flex flex-col md:flex-row items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 max-md:pb-[100px] gap-6 scroll-mt-24">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px] text-[var(--accent)]">{t("icon_shield", "shield")}</span>
          </div>
          <div className="text-xs font-black uppercase tracking-widest opacity-60 text-[var(--text)]">
            {t("landing_copyright", "Sanctuary OS © 2026 Sanctuary Foundry") || "Sanctuary OS \u00A9 2026 Sanctuary Foundry"}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-end gap-8 text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--text)]">
          <a href="#eula" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_eula", "System EULA") || "End User License Agreement"}
          </a>
          <a href="#terms" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_terms", "Terms of Service") || "Terms of Service"}
          </a>
          <a href="#privacy" className="hover:text-[var(--accent)] hover:opacity-100 transition-colors duration-300">
            {t("landing_privacy", "Privacy Protocol") || "Privacy Policy"}
          </a>
        </div>
      </footer>
    </div>
  );
}

