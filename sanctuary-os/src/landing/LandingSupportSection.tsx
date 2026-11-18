import { useLexicon } from '../LexiconContext';
import { PanelHeaderGroup, PanelHeaderButton, EmptyState, VAULT_CHIP_CLASS } from '../shared';
import { isDesktop } from '../utils/envUtils';
import { UniversalCard } from '../components/universal/UniversalCard';
import { CommandScreenSectionHeading } from '../hub-components/SharedCommandScreenLayout';

interface LandingSupportSectionProps {
  hasAuthenticatedCitizen: boolean;
  myTicketsCount: number;
  onOpenMyTickets: () => void;
  onOpenFeedbackChannel: (
    platform: 'Desktop App' | 'Website' | 'Mobile PWA',
    stream:
      | 'Feature Request'
      | 'Public Build Feedback'
      | 'Beta Build Feedback'
      | 'Core Bug Report'
  ) => void;
  onOpenDirectContact: () => void;
  onOpenKeeperApplication: () => void;
  searchQuery?: string;
  supportFilter?: string;
}

export function LandingSupportSection({
  hasAuthenticatedCitizen,
  myTicketsCount,
  onOpenMyTickets,
  onOpenFeedbackChannel,
  onOpenDirectContact,
  onOpenKeeperApplication,
  searchQuery = '',
  supportFilter = 'ALL',
}: LandingSupportSectionProps) {
  const { t } = useLexicon();
  const q = searchQuery.trim().toLowerCase();
  const showFeedbackSection =
    (supportFilter === 'ALL' || supportFilter === 'feedback') &&
    (!q ||
      'platform feedback core support bug reports feature request public beta desktop website mobile pwa keepers core'.includes(
        q
      ));
  const showContactSection =
    (supportFilter === 'ALL' || supportFilter === 'contact') &&
    (!q ||
      'direct human contact sanctuary foundry apply keeper roles positions engineering security legal dmca'.includes(
        q
      ));

  return (
    <div className="w-full flex flex-col gap-10">
      {!showFeedbackSection && !showContactSection && (
        <EmptyState
          icon={t('icon_support_agent', 'support_agent')}
          title={t('no_results', 'No matching items found.')}
        />
      )}
      {/* =====================================================================
          OFFICIAL CORE PLATFORM FEEDBACK & BUG SUPPORT SECTION
          Clean 3-Card UniversalCard Row: [Alert -> Feedback -> Bugs]
         ===================================================================== */}
      {showFeedbackSection && (
      <section
        id="feedback"
        className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative"
      >
        <CommandScreenSectionHeading
          title={t(
            'landing_feedback_section_title',
            'Platform Feedback & Core Support'
          )}
          icon={t('icon_rate_review', 'rate_review')}
          rightSlot={
            hasAuthenticatedCitizen ? (
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t('icon_inbox', 'inbox')}
                  tooltip={`${t('landing_my_platform_tickets', 'My Platform Tickets & Feedback')} (${myTicketsCount})`}
                  onClick={onOpenMyTickets}
                />
              </PanelHeaderGroup>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: Core Platform Scope Notice */}
          <UniversalCard
            layout="vertical"
            statusColor="warning"
            icon={t('icon_info', 'info')}
            bannerTopLabel={t('landing_banner_scope_clean_top', 'Sanctuary OS Platform')}
            bannerBottomLabel={t('landing_banner_scope_clean_bottom', 'Desktop • Web Portal • Mobile')}
            title={t('landing_feedback_scope_title', 'Platform Support Scope')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t('landing_feedback_scope_sub', 'Sanctuary OS • Core Platform')}
              </span>
            }
            imageOverlay={
              <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                    {t('icon_info', 'info')}
                  </span>
                  <span>{t('landing_feedback_scope_chip', 'Platform Scope')}</span>
                </span>
              </div>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)]">
                  {t('sanctuary_os_name', 'Sanctuary OS')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--warning)] shrink-0">
                  {t('landing_feedback_scope_chip', 'Platform Scope')}
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-85 no-text-case">
              {t(
                'landing_feedback_scope_desc',
                "Submit feedback, feature requests, and bug reports about the Sanctuary OS platform (Desktop App, Website, and Mobile PWA). For game-specific {mod} or community support, use that game workspace's Support tab."
              )}
            </p>
          </UniversalCard>

          {/* Card 2: [Feedback] Desktop App • Website • Mobile PWA */}
          <UniversalCard
            layout="vertical"
            onClick={() =>
              onOpenFeedbackChannel(
                isDesktop() ? 'Desktop App' : 'Website',
                'Feature Request'
              )
            }
            icon={t('icon_rate_review', 'rate_review')}
            bannerTopLabel={t(
              'landing_banner_fb_top',
              'Desktop App • Website • Mobile PWA'
            )}
            bannerBottomLabel={t(
              'landing_banner_fb_bottom',
              'Feature Requests • Public & Beta Builds'
            )}
            title={t('landing_feedback_card_title', 'Submit Platform Feedback')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t(
                  'landing_feedback_card_sub',
                  'Desktop App • Website • Mobile PWA'
                )}
              </span>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                  {t(
                    'landing_feedback_card_badge',
                    '3 Platforms • 3 Streams'
                  )}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  <span>{t('landing_fb_btn_open', 'Submit Feedback')}</span>
                  <span className="material-symbols-outlined !text-[14px]">
                    {t('icon_arrow_forward', 'arrow_forward')}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 no-text-case">
              {t(
                'landing_feedback_card_desc',
                'Share feedback, feature requests, or public and beta build impressions across the Desktop App, Website, and Mobile PWA.'
              )}
            </p>
          </UniversalCard>

          {/* Card 3: [Bugs] Core Platform Bug Reports */}
          <UniversalCard
            layout="vertical"
            onClick={() =>
              onOpenFeedbackChannel(
                isDesktop() ? 'Desktop App' : 'Website',
                'Core Bug Report'
              )
            }
            icon={t('icon_bug_report', 'bug_report')}
            bannerTopLabel={t(
              'landing_banner_bug_top',
              'Sanctuary OS Engineering'
            )}
            bannerBottomLabel={t(
              'landing_banner_bug_clean_bottom',
              'Desktop, Web & Mobile Issues'
            )}
            title={t('landing_fb_bug_title', 'Core Platform Bug Reports')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t('landing_fb_bug_sub', 'Sanctuary OS Engineering')}
              </span>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                  {t('sanctuary_foundry', 'Sanctuary Foundry')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  <span>{t('landing_fb_btn_bug', 'Report Bug')}</span>
                  <span className="material-symbols-outlined !text-[14px]">
                    {t('icon_arrow_forward', 'arrow_forward')}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 no-text-case">
              {t(
                'landing_fb_bug_desc',
                'Found a reproducible bug, UI issue, or crash in Sanctuary OS? Submit a direct diagnostic report to the engineering team.'
              )}
            </p>
          </UniversalCard>
        </div>
      </section>
      )}

      {/* =====================================================================
          DIRECT CONTACT & SANCTUARY FOUNDRY
         ===================================================================== */}
      {showContactSection && (
      <section
        id="contact"
        className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative"
      >
        <CommandScreenSectionHeading
          title={t(
            'landing_contact_section_title',
            'Direct Contact & Sanctuary Foundry'
          )}
          icon={t('icon_support_agent', 'support_agent')}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: Human Review & Spoke Qualification */}
          <UniversalCard
            layout="vertical"
            statusColor="accent"
            icon={t('icon_verified_user', 'verified_user')}
            bannerTopLabel={t('sanctuary_foundry', 'Sanctuary Foundry')}
            bannerBottomLabel={t('landing_contact_scope_bottom', 'Direct Human Review')}
            title={t('landing_contact_scope_title', 'Human Support Policy')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t('landing_contact_scope_sub', 'Sanctuary Foundry • Human Staff')}
              </span>
            }
            imageOverlay={
              <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
                <span className={VAULT_CHIP_CLASS}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t('icon_verified_user', 'verified_user')}
                  </span>
                  <span>{t('landing_contact_scope_chip', 'Human Support')}</span>
                </span>
              </div>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)]">
                  {t('sanctuary_foundry', 'Sanctuary Foundry')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--accent)] shrink-0">
                  {t('landing_contact_scope_chip', 'Human Support')}
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-85 no-text-case">
              {t(
                'landing_contact_alert_desc',
                'Every Direct Contact message is reviewed and answered by a human member of Sanctuary Foundry. Partner Spoke applications are reserved for community-managed game workspaces.'
              )}
            </p>
          </UniversalCard>

          {/* Card 2: [Contact] Direct Contact */}
          <UniversalCard
            layout="vertical"
            onClick={onOpenDirectContact}
            icon={t('icon_support_agent', 'support_agent')}
            bannerTopLabel={t('sanctuary_foundry', 'Sanctuary Foundry')}
            bannerBottomLabel={t(
              'landing_banner_contact_bottom',
              'General • Legal & DMCA • Security'
            )}
            title={t('landing_contact_short_title', 'Direct Contact')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t(
                  'landing_contact_short_sub',
                  'General • Legal & DMCA • Security'
                )}
              </span>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                  {t('sanctuary_foundry', 'Sanctuary Foundry')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  <span>
                    {t('landing_contact_btn_open', 'Open Direct Contact')}
                  </span>
                  <span className="material-symbols-outlined !text-[14px]">
                    {t('icon_arrow_forward', 'arrow_forward')}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 no-text-case">
              {t(
                'landing_contact_card_desc',
                'Reach Sanctuary Foundry for general inquiries, DMCA or privacy notices, or responsible security disclosures.'
              )}
            </p>
          </UniversalCard>

          {/* Card 3: [Foundry Apply] Apply to Sanctuary Foundry */}
          <UniversalCard
            layout="vertical"
            onClick={onOpenKeeperApplication}
            icon={t('icon_admin_panel_settings', 'admin_panel_settings')}
            bannerTopLabel={t(
              'landing_keeper_apply_overline',
              'Sanctuary Foundry • Open Positions'
            )}
            bannerBottomLabel={t(
              'landing_keeper_apply_sub',
              'Engineering • Security & Heuristics • Schemas • Support'
            )}
            title={t(
              'landing_keeper_apply_title',
              'Apply to Sanctuary Foundry'
            )}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t(
                  'landing_keeper_apply_sub',
                  'Engineering • Security & Heuristics • Schemas • Support'
                )}
              </span>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                  {t('sanctuary_foundry', 'Sanctuary Foundry')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  <span>
                    {t(
                      'landing_keeper_apply_btn',
                      'Apply to Sanctuary Foundry'
                    )}
                  </span>
                  <span className="material-symbols-outlined !text-[14px]">
                    {t('icon_rocket_launch', 'rocket_launch')}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 no-text-case">
              {t(
                'landing_keeper_apply_desc',
                'Apply to join Sanctuary Foundry—building Sanctuary OS, authoring multi-game schemas, analyzing malware heuristics, or helping with direct human support.'
              )}
            </p>
          </UniversalCard>
        </div>
      </section>
      )}
    </div>
  );
}

