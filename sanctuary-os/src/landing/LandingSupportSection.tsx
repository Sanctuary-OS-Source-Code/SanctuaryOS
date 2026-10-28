import { useLexicon } from '../LexiconContext';
import { PanelHeaderGroup, PanelHeaderButton } from '../shared';
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
}

export function LandingSupportSection({
  hasAuthenticatedCitizen,
  myTicketsCount,
  onOpenMyTickets,
  onOpenFeedbackChannel,
  onOpenDirectContact,
  onOpenKeeperApplication,
}: LandingSupportSectionProps) {
  const { t } = useLexicon();

  return (
    <div className="w-full flex flex-col gap-10">
      {/* =====================================================================
          OFFICIAL CORE PLATFORM FEEDBACK & BUG SUPPORT SECTION
          Clean 3-Card UniversalCard Row: [Alert -> Feedback -> Bugs]
         ===================================================================== */}
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
          {/* Card 1: [Alert / Warning] Core Platform Scope Notice (Non-Clickable Advisory Card) */}
          <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full text-left">
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background:
                  'radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)',
              }}
            />
            <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
              {t('icon_gpp_maybe', 'gpp_maybe')}
            </span>

            {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[22px]">
                  {t('icon_warning', 'warning')}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t('icon_gpp_maybe', 'gpp_maybe')}
                </span>
                <span>
                  {t('landing_feedback_alert_badge', 'CORE PLATFORM ONLY')}
                </span>
              </span>
            </div>

            {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
            <div className="flex flex-col gap-1 relative z-10">
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                {t('landing_banner_scope_top', 'Core OS Scope Directive')}
              </span>
              <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                {t(
                  'landing_feedback_alert_card_title',
                  'Core Platform Scope Notice'
                )}
              </h3>
            </div>

            {/* Row 3: Recessed Warning Callout Strip */}
            <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                {t('icon_block', 'block')}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                {t(
                  'landing_banner_scope_bottom',
                  'No Spoke Drama • Core Platform Only'
                )}
              </span>
            </div>

            {/* Row 4: Body Notice */}
            <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
              {t(
                'landing_feedback_scope_desc',
                "This channel is strictly for positive or constructive feedback and bug reports regarding the Core Sanctuary OS Platform (Desktop App, Website, and Mobile PWA). Do not submit individual game spoke {mod} disputes, {mason} drama, or spoke moderation appeals here—use the Support desk inside that game's workspace."
              )}
            </p>

            {/* Row 5: Static Advisory Footer */}
            <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
              <span>{t('keepers_title', 'Keepers Core')}</span>
              <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                <span className="material-symbols-outlined !text-[13px]">
                  {t('icon_shield', 'shield')}
                </span>
                <span>
                  {t('landing_feedback_alert_badge', 'CORE PLATFORM ONLY')}
                </span>
              </span>
            </div>
          </div>

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
                    '3 PLATFORMS • 3 STREAMS'
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
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
              {t(
                'landing_feedback_card_desc',
                'Share positive or constructive feedback, Feature Requests, Public Build Feedback, or Beta Build Feedback across our Desktop App, Website, and Mobile PWA via our guided step-by-step ticket flow.'
              )}
            </p>
          </UniversalCard>

          {/* Card 3: [Bugs] Core Platform Bug Reports -> Keepers Core */}
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
              'Keepers Core Ticket System'
            )}
            bannerBottomLabel={t(
              'landing_banner_bug_bottom',
              'Direct Engineering Bug Triage'
            )}
            title={t('landing_fb_bug_title', 'Core Platform Bug Reports')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t('landing_fb_bug_sub', 'Keepers Core Ticket System')}
              </span>
            }
            className="h-full"
            footer={
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                  {t('keepers_title', 'Keepers Core')}
                </span>
                <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                  <span>{t('landing_fb_btn_bug', 'Report Core Bug')}</span>
                  <span className="material-symbols-outlined !text-[14px]">
                    {t('icon_arrow_forward', 'arrow_forward')}
                  </span>
                </span>
              </div>
            }
          >
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
              {t(
                'landing_fb_bug_desc',
                'Encountered a reproducible bug, UI glitch, or crash in Sanctuary OS? Open a direct diagnostic ticket routed straight to Keepers Core.'
              )}
            </p>
          </UniversalCard>
        </div>
      </section>

      {/* =====================================================================
          DIRECT HUMAN CONTACT & KEEPERS CORE STEWARDSHIP
          Clean 3-Card Row: [Alert -> Direct Human Contact -> Apply to Join Keepers Core]
         ===================================================================== */}
      <section
        id="contact"
        className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative"
      >
        <CommandScreenSectionHeading
          title={t(
            'landing_contact_section_title',
            'Direct Human Contact & Sanctuary Foundry'
          )}
          icon={t('icon_support_agent', 'support_agent')}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: [Alert / Warning] Human Review & Qualification Notice */}
          <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full text-left">
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background:
                  'radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)',
              }}
            />
            <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
              {t('icon_verified_user', 'verified_user')}
            </span>

            {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[22px]">
                  {t('icon_warning', 'warning')}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t('icon_verified_user', 'verified_user')}
                </span>
                <span>
                  {t('landing_contact_alert_badge', '100% HUMAN-REVIEWED')}
                </span>
              </span>
            </div>

            {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
            <div className="flex flex-col gap-1 relative z-10">
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                {t(
                  'landing_contact_alert_overline',
                  'Human Contact & Spoke Governance'
                )}
              </span>
              <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                {t(
                  'landing_contact_alert_title',
                  'Direct Human Review & Spoke Qualification Notice'
                )}
              </h3>
            </div>

            {/* Row 3: Recessed Warning Callout Strip */}
            <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                {t('icon_gpp_maybe', 'gpp_maybe')}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                {t(
                  'landing_contact_alert_callout',
                  'No AI Deflection Bots • Community Spokes Only'
                )}
              </span>
            </div>

            {/* Row 4: Body Notice */}
            <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
              {t(
                'landing_contact_alert_desc',
                'Every Direct Contact inquiry is read by a human Keeper in Keepers Core and replied to directly via our in-app email dispatch—never routed to AI bots. Partner Spoke applications are strictly for community-moderated Game Workspaces, not personal creator or streamer badges.'
              )}
            </p>

            {/* Row 5: Static Advisory Footer */}
            <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
              <span>{t('sanctuary_foundry', 'Sanctuary Foundry')}</span>
              <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                <span className="material-symbols-outlined !text-[13px]">
                  {t('icon_shield', 'shield')}
                </span>
                <span>
                  {t('landing_contact_alert_badge', '100% HUMAN-REVIEWED')}
                </span>
              </span>
            </div>
          </div>

          {/* Card 2: [Contact] Direct Human Contact */}
          <UniversalCard
            layout="vertical"
            onClick={onOpenDirectContact}
            icon={t('icon_support_agent', 'support_agent')}
            bannerTopLabel={t(
              'landing_contact_human_badge',
              '100% Human-Reviewed • Never Routed to AI Bots'
            )}
            bannerBottomLabel={t(
              'landing_banner_contact_bottom',
              'General • Legal & DMCA • Security Disclosures'
            )}
            title={t('landing_contact_card_title', 'Direct Human Contact')}
            subtitle={
              <span className="text-[10px] font-mono tracking-widest">
                {t(
                  'landing_contact_card_sub',
                  '100% Human-Reviewed • Never Routed to AI Bots'
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
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
              {t(
                'landing_contact_card_desc',
                'Need to reach Sanctuary Foundry for general inquiries, legal/DMCA compliance notices, privacy requests, or responsible security disclosures? Every message is read by a human Keeper.'
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
            <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
              {t(
                'landing_keeper_apply_desc',
                'Apply to join Sanctuary Foundry as a Keeper—building Sanctuary OS, authoring multi-game Master Schemas, analyzing malware heuristics, or handling direct human support in Keepers Core.'
              )}
            </p>
          </UniversalCard>
        </div>
      </section>
    </div>
  );
}

