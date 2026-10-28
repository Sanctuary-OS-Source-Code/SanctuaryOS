import { useLexicon } from '../LexiconContext';
import { KeepersPipelineConfig } from '../utils/supporterManager';
import { isDesktop } from '../utils/envUtils';
import { isMobileDevice } from '../utils/pwaManager';
import { UniversalCard } from '../components/universal/UniversalCard';
import { ReleaseNotesShowcase } from '../components/ReleaseNotesShowcase';
import { CommandScreenSectionHeading } from '../hub-components/SharedCommandScreenLayout';

interface LandingDownloadSectionProps {
  isStandalone: boolean;
  triggerInstall: () => void;
  webDevChannelEnabled: boolean;
  onToggleWebDevStream: (nextVal: boolean) => void;
  keepersConfig: KeepersPipelineConfig;
  stableVersion: string;
  isDevUnlocked: boolean;
  hasUserSession: boolean;
}

export function LandingDownloadSection({
  isStandalone,
  triggerInstall,
  webDevChannelEnabled,
  onToggleWebDevStream,
  keepersConfig,
  stableVersion,
  isDevUnlocked,
  hasUserSession,
}: LandingDownloadSectionProps) {
  const { t } = useLexicon();

  if (isDesktop()) return null;

  const showDesktopDownloadCards = !isStandalone && !isMobileDevice();

  return (
    <div className="w-full flex flex-col gap-10">
      <section
        id="download"
        className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
      >
        <CommandScreenSectionHeading
          title={t('landing_download_sidebar', 'Download Sanctuary OS')}
          icon={t('icon_system_update_alt', 'system_update_alt')}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {!isDesktop() && (
            <>
              <div className="flex flex-col group cursor-pointer">
                <UniversalCard
                  layout="vertical"
                  onClick={() => {
                    if (!isStandalone) triggerInstall();
                  }}
                  icon={t('icon_install_mobile', 'install_mobile')}
                  bannerTopLabel={t(
                    'landing_banner_pwa_top',
                    'iOS • Android • Web'
                  )}
                  bannerBottomLabel={t(
                    'landing_banner_pwa_bottom',
                    'Standalone Web App'
                  )}
                  title={t(
                    'pwa_install_title',
                    'Install Sanctuary Web App'
                  )}
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t(
                        'pwa_install_subtitle',
                        'Progressive Web App (iOS / Android / Web)'
                      )}
                    </span>
                  }
                  className="h-full"
                  footer={
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                        {t('pwa_badge_standalone', 'STANDALONE PWA')}
                      </span>
                      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        <span>
                          {isStandalone
                            ? t('pwa_btn_installed', 'App Installed')
                            : t('pwa_btn_install', 'Install App')}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {isStandalone
                            ? t('icon_check_circle', 'check_circle')
                            : t('icon_arrow_forward', 'arrow_forward')}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      'pwa_install_desc',
                      'Install Sanctuary OS directly to your home screen or app drawer for a full-screen standalone experience with instant workspace access.'
                    )}
                  </p>
                </UniversalCard>
              </div>

              {/* Website & Mobile PWA Public vs. Beta / Dev Build Stream Switcher Card */}
              <div className="flex flex-col group cursor-pointer">
                <UniversalCard
                  layout="vertical"
                  onClick={() => onToggleWebDevStream(!webDevChannelEnabled)}
                  icon={
                    webDevChannelEnabled
                      ? t('icon_science', 'science')
                      : t('icon_public', 'public')
                  }
                  statusColor={webDevChannelEnabled ? 'emerald' : undefined}
                  bannerTopLabel={t(
                    'landing_web_stream_banner_top',
                    'Website & Mobile PWA • Build Stream'
                  )}
                  bannerBottomLabel={
                    webDevChannelEnabled
                      ? `${t('landing_fb_stream_beta', 'Beta Build Feedback')} • v${keepersConfig.dev_build_version || `${stableVersion}-dev`}`
                      : `${t('landing_fb_stream_public', 'Public Build Feedback')} • v${stableVersion}`
                  }
                  title={
                    webDevChannelEnabled
                      ? t(
                          'landing_web_stream_beta_title',
                          'Web & PWA: Beta / Dev Build Active'
                        )
                      : t(
                          'landing_web_stream_public_title',
                          'Web & PWA: Public Build Active'
                        )
                  }
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {isDevUnlocked
                        ? t(
                            'landing_web_stream_sub_unlocked',
                            'Click to Toggle Between Public & Daily Dev Build Stream'
                          )
                        : t(
                            'landing_web_stream_sub_locked',
                            'Supporter Stream ($5 = +30 Days Global Daily Dev Builds)'
                          )}
                    </span>
                  }
                  className="h-full"
                  footer={
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                        {webDevChannelEnabled
                          ? `v${keepersConfig.dev_build_version || `${stableVersion}-dev`}`
                          : `v${stableVersion}`}
                      </span>
                      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        <span>
                          {webDevChannelEnabled
                            ? t(
                                'landing_web_stream_btn_switch_public',
                                'Switch to Public Stream'
                              )
                            : t(
                                'landing_web_stream_btn_switch_beta',
                                'Switch to Beta / Dev Stream'
                              )}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {t('icon_arrow_forward', 'arrow_forward')}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      'landing_web_stream_desc',
                      'Switch your live Website and Mobile PWA session between the verified Public Build and the Supporter Daily Dev Build channel.'
                    )}
                  </p>
                </UniversalCard>
              </div>
            </>
          )}

          {showDesktopDownloadCards && (
            <>
              <a
                href={
                  keepersConfig.stable_exe_url ||
                  `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${stableVersion}/Sanctuary.OS_${stableVersion}_x64-setup.exe`
                }
                className="block group"
              >
                <UniversalCard
                  layout="vertical"
                  onClick={() => {}}
                  icon={t('icon_rocket_launch', 'rocket_launch')}
                  bannerTopLabel={t(
                    'landing_banner_win_top',
                    'Windows 10 / 11 (64-Bit)'
                  )}
                  bannerBottomLabel={`${t('landing_banner_win_bottom', 'Native Setup (.exe)')} • v${stableVersion}`}
                  title={t('landing_download_native_title', 'Sanctuary OS Native')}
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t('landing_win_exe', 'Windows (.exe)')}
                    </span>
                  }
                  className="h-full"
                  footer={
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                        {`v${stableVersion}`}
                      </span>
                      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        <span>
                          {t('landing_download_native_footer', 'Standard Install')}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {t('icon_arrow_forward', 'arrow_forward')}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      'landing_download_desc',
                      'Install the Native Client to access full hardware integration, heuristic threat scanning, and deep OS-level modifications.'
                    )}
                  </p>
                </UniversalCard>
              </a>

              <a
                href={
                  keepersConfig.stable_dmg_url ||
                  `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/download/v${stableVersion}/Sanctuary.OS_${stableVersion}_aarch64.dmg`
                }
                className="block group"
              >
                <UniversalCard
                  layout="vertical"
                  onClick={() => {}}
                  icon={t('icon_laptop_mac', 'laptop_mac')}
                  bannerTopLabel={t(
                    'landing_banner_mac_top',
                    'Apple Silicon & Intel'
                  )}
                  bannerBottomLabel={`${t('landing_banner_mac_bottom', 'macOS Disk Image (.dmg)')} • v${stableVersion}`}
                  title={t('landing_download_mac_title', 'Sanctuary OS for Mac')}
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t('landing_mac_dmg', 'macOS (.dmg)')}
                    </span>
                  }
                  className="h-full"
                  footer={
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                        {`v${stableVersion}`}
                      </span>
                      <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                        <span>
                          {t(
                            'landing_download_mac_footer',
                            'Apple Silicon & Intel'
                          )}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {t('icon_arrow_forward', 'arrow_forward')}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      'landing_download_mac_desc',
                      'Native macOS Universal application bundle engineered for Apple Silicon and Intel Macs with full Metal glass acceleration.'
                    )}
                  </p>
                </UniversalCard>
              </a>

              {hasUserSession && isDevUnlocked && (
                <>
                  <a
                    href={
                      keepersConfig.dev_build_download_url ||
                      'https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <UniversalCard
                      layout="vertical"
                      onClick={() => {}}
                      icon={t('icon_bolt', 'bolt')}
                      statusColor="emerald"
                      bannerTopLabel={t(
                        'landing_banner_dev_win_top',
                        'Supporter Dev Stream • Win'
                      )}
                      bannerBottomLabel={`${t('landing_banner_dev_win_bottom', 'Early Preview (.exe)')} • v${keepersConfig.dev_build_version || 'dev-latest'}`}
                      title={t(
                        'landing_download_dev_title',
                        'Daily Dev Build (Supporter)'
                      )}
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {t(
                            'landing_download_dev_subtitle',
                            'Supporter Preview Channel (.exe)'
                          )}
                        </span>
                      }
                      className="h-full"
                      footer={
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                            {`v${keepersConfig.dev_build_version || 'dev-latest'}`}
                          </span>
                          <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                            <span>
                              {t(
                                'landing_download_dev_footer',
                                'SUPPORTER STREAM'
                              )}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {t('icon_arrow_forward', 'arrow_forward')}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                        {t(
                          'landing_download_dev_desc',
                          'Nightly preview build unlocked by your active Global Daily Dev Build supporter time.'
                        )}
                      </p>
                    </UniversalCard>
                  </a>

                  <a
                    href={
                      keepersConfig.dev_build_dmg_url ||
                      keepersConfig.dev_release_url ||
                      'https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <UniversalCard
                      layout="vertical"
                      onClick={() => {}}
                      icon={t('icon_laptop_mac', 'laptop_mac')}
                      statusColor="emerald"
                      bannerTopLabel={t(
                        'landing_banner_dev_mac_top',
                        'Supporter Dev Stream • Mac'
                      )}
                      bannerBottomLabel={`${t('landing_banner_dev_mac_bottom', 'Early Preview (.dmg)')} • v${keepersConfig.dev_build_version || 'dev-latest'}`}
                      title={t(
                        'landing_download_dev_mac_title',
                        'Dev Build for Mac'
                      )}
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {t(
                            'landing_download_dev_mac_subtitle',
                            'Supporter Early Preview (.dmg)'
                          )}
                        </span>
                      }
                      className="h-full"
                      footer={
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                            {`v${keepersConfig.dev_build_version || 'dev-latest'}`}
                          </span>
                          <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                            <span>
                              {t(
                                'landing_download_dev_mac_footer',
                                'Download Mac Dev .dmg'
                              )}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {t('icon_arrow_forward', 'arrow_forward')}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                        {t(
                          'landing_download_dev_mac_desc',
                          'Early preview macOS disk image unlocked by your active Global Dev Build supporter time—featuring the latest experimental features on Apple Silicon and Intel.'
                        )}
                      </p>
                    </UniversalCard>
                  </a>
                </>
              )}
            </>
          )}
        </div>
      </section>

      <section
        id="release_notes"
        className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
      >
        <CommandScreenSectionHeading
          title={t(
            'release_notes_section_title',
            'Current Build Release Notes'
          )}
          icon={t('icon_new_releases', 'new_releases')}
        />
        <ReleaseNotesShowcase
          versionLabel={
            !isDesktop() && webDevChannelEnabled
              ? keepersConfig.dev_build_version || `${stableVersion}-dev`
              : stableVersion
          }
        />
      </section>
    </div>
  );
}

