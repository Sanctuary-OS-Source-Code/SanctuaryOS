import { useLexicon, normalizeAllCapsForThemeCase } from '../LexiconContext';
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  SidePanelTitleInput,
} from '../shared';
import { isDesktop } from '../utils/envUtils';
import { UniversalCard } from '../components/universal/UniversalCard';
import {
  KeepersPipelineConfig,
  isSandboxDonationUrl,
} from '../utils/supporterManager';
import { CommandScreenSectionHeading } from '../hub-components/SharedCommandScreenLayout';

interface LandingDonationsSectionProps {
  hasUserSession: boolean;
  pendingWebCheckout: {
    targetId: string;
    targetName: string;
    startedAt: number;
  } | null;
  keepersConfig: KeepersPipelineConfig;
  games: any[];
  onOpenVerifyDrawer: () => void;
  onNavigateAuth: () => void;
  onDonateCardClick: (
    targetId: string,
    targetName: string,
    rawDonationUrl?: string
  ) => void;
}

export function LandingDonationsSection({
  hasUserSession,
  pendingWebCheckout,
  keepersConfig,
  games,
  onOpenVerifyDrawer,
  onNavigateAuth,
  onDonateCardClick,
}: LandingDonationsSectionProps) {
  const { t } = useLexicon();

  return (
    <section
      id="donations"
      className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
    >
      <CommandScreenSectionHeading
        title={t(
          'landing_support_section_title',
          'Support Sanctuary OS & Partner Communities'
        )}
        icon={t('icon_volunteer_activism', 'volunteer_activism')}
        rightSlot={
          !isDesktop() && hasUserSession ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t('icon_verified', 'verified')}
                tooltip={t(
                  'supporter_web_verify_btn',
                  'Verify Completed Donation (+30 Days / $5)'
                )}
                onClick={onOpenVerifyDrawer}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {/* Leading Section Alert Card: Pending Web Checkout OR 100% Direct Support Advisory */}
        {!isDesktop() && pendingWebCheckout ? (
          <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full">
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background:
                  'radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)',
              }}
            />
            <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
              {t('icon_bolt', 'bolt')}
            </span>

            {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[22px] animate-pulse">
                  {t('icon_bolt', 'bolt')}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t('icon_warning', 'warning')}
                </span>
                <span>{t('status', 'Status')}</span>
              </span>
            </div>

            {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
            <div className="flex flex-col gap-1 relative z-10">
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                {t(
                  'landing_banner_support_os_top',
                  '$5 = +30 Days Dev Builds'
                )}
              </span>
              <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                {t(
                  'supporter_web_pending_title',
                  'Checkout Opened in Browser Tab'
                )}
              </h3>
            </div>

            {/* Row 3: Recessed Warning Callout Strip */}
            <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                {t('icon_verified', 'verified')}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                {t(
                  'supporter_liability_title',
                  '100% Non-Custodial • 0% Platform Fee'
                )}
              </span>
            </div>

            {/* Row 4: Body Notice */}
            <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
              {hasUserSession
                ? t(
                    'supporter_web_pending_desc',
                    'Every $5 contribution adds +30 days of Global Daily Dev Build access. Once completed, your account syncs automatically via webhook or you can verify your Stripe checkout receipt below.'
                  )
                : t(
                    'supporter_auth_required_for_dev_builds',
                    'Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.'
                  )}
            </p>

            {/* Row 5: Action Footer */}
            <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
              {hasUserSession ? (
                <ActionButton
                  variant="primary"
                  icon={t('icon_verified', 'verified')}
                  label={t(
                    'supporter_web_verify_btn',
                    'Verify Completed Donation (+30 Days / $5)'
                  )}
                  onClick={onOpenVerifyDrawer}
                  className="w-full justify-center"
                />
              ) : (
                <ActionButton
                  variant="primary"
                  icon={t('icon_key', 'key')}
                  label={t('sidebar_authenticate', 'Authenticate')}
                  onClick={onNavigateAuth}
                  className="w-full justify-center"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full">
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
                  {t('icon_verified', 'verified')}
                </span>
                <span>{t('supporter_rate_badge', '$5 = +30 Days')}</span>
              </span>
            </div>

            {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
            <div className="flex flex-col gap-1 relative z-10">
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                {t(
                  'landing_banner_support_partner_top',
                  '100% Direct To Community'
                )}
              </span>
              <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                {t(
                  'supporter_liability_title',
                  '100% Non-Custodial • 0% Platform Fee'
                )}
              </h3>
            </div>

            {/* Row 3: Recessed Warning Callout Strip */}
            <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                {t('icon_bolt', 'bolt')}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                {t(
                  'landing_support_card_badge',
                  '0% Platform Fee • +30 Days Dev Builds Per $5'
                )}
              </span>
            </div>

            {/* Row 4: Body Notice */}
            <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
              {t(
                'supporter_combined_partner_notice',
                "Partner Communities run their own payment processors and receive 100% of your donation (0% platform fee, no chargebacks covered by Sanctuary OS). Payment webhooks automatically credit your account with +30 days per $5. If a community isn't listed yet, its Wayfinders can link their payment processor in Wayfinder Operations."
              )}
            </p>

            {/* Row 5: Footer Row */}
            <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
              <span>
                {t(
                  'supporter_zero_fee_badge',
                  '0% Platform Fee • Non-Custodial'
                )}
              </span>
              <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                <span className="material-symbols-outlined !text-[13px]">
                  {t('icon_volunteer_activism', 'volunteer_activism')}
                </span>
                <span>{t('supporter_rate_badge', '$5 = +30 Days')}</span>
              </span>
            </div>
          </div>
        )}

        <UniversalCard
          layout="vertical"
          onClick={() =>
            onDonateCardClick(
              'keepers_core',
              t('supporter_keepers_title', 'Sanctuary OS (Keepers Core)'),
              keepersConfig.keepers_donation_url || 'sandbox://checkout'
            )
          }
          icon={t('icon_rocket_launch', 'rocket_launch')}
          bannerTopLabel={t(
            'landing_banner_support_os_top',
            '$5 = +30 Days Dev Builds'
          )}
          bannerBottomLabel={t(
            'landing_banner_support_os_bottom',
            '100% Core OS Development'
          )}
          title={t(
            'supporter_keepers_title',
            'Sanctuary OS (Keepers Core)'
          )}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t(
                'supporter_keepers_subtitle',
                'Core OS Infrastructure • 0% Platform Fee • Stacks Global Daily Dev Builds'
              )}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('supporter_rate_badge', '$5 = +30 Days')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>
                  {t('supporter_keepers_btn', 'Support Sanctuary OS')}
                </span>
                <span className="material-symbols-outlined !text-[14px]">
                  {isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                    ? t('icon_science', 'science')
                    : t('icon_arrow_forward', 'arrow_forward')}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
            {t(
              'supporter_keepers_desc',
              'Directly support the Keepers building Sanctuary OS. Every $5 contribution dynamically stacks +30 days of Global Daily Dev Build access onto your account.'
            )}
          </p>
        </UniversalCard>

        {games
          .filter((g) =>
            Boolean(g.donation_url && String(g.donation_url).trim().length > 0)
          )
          .map((g) => (
            <UniversalCard
              key={`support-${g.id}`}
              layout="vertical"
              onClick={() =>
                onDonateCardClick(
                  g.schema_id || g.id,
                  g.name,
                  g.donation_url
                )
              }
              icon={
                g.icon
                  ? undefined
                  : t('icon_sports_esports', 'sports_esports')
              }
              bannerTopLabel={t(
                'landing_banner_support_partner_top',
                '100% Direct To Community'
              )}
              bannerBottomLabel={`${g.name} • ${t('landing_banner_support_partner_bottom', 'Server & {Mason} Support')}`}
              customIcon={
                g.icon ? (
                  <img
                    src={g.icon}
                    alt=""
                    className="w-10 h-10 object-contain drop-shadow-md opacity-80 group-hover/card:opacity-100 transition-opacity"
                  />
                ) : undefined
              }
              title={g.name}
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {`${normalizeAllCapsForThemeCase((g.payment_processor || 'Stripe').toUpperCase())} • ${t('supporter_zero_fee_badge', '0% Platform Fee • Non-Custodial')}`}
                </span>
              }
              className="h-full"
              footer={
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                    {t('supporter_rate_badge', '$5 = +30 Days')}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    <span>
                      {t(
                        'supporter_btn_donate_partner',
                        'Donate to Partner'
                      )}
                    </span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {isSandboxDonationUrl(g.donation_url)
                        ? t('icon_science', 'science')
                        : t('icon_arrow_forward', 'arrow_forward')}
                    </span>
                  </span>
                </div>
              }
            />
          ))}
      </div>
    </section>
  );
}

interface LandingVerifyDonationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isVerifyingDonation: boolean;
  onVerifyWebDonation: () => void;
  isDevUnlocked: boolean;
  devBuildUntil: number;
  pendingTargetName?: string;
  verifyReceiptInput: string;
  setVerifyReceiptInput: (val: string) => void;
  verifyAmountUsd: number;
  setVerifyAmountUsd: (val: number) => void;
}

export function LandingVerifyDonationDrawer({
  isOpen,
  onClose,
  isVerifyingDonation,
  onVerifyWebDonation,
  isDevUnlocked,
  devBuildUntil,
  pendingTargetName,
  verifyReceiptInput,
  setVerifyReceiptInput,
  verifyAmountUsd,
  setVerifyAmountUsd,
}: LandingVerifyDonationDrawerProps) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        'supporter_web_verify_btn',
        'Verify Completed Donation (+30 Days / $5)'
      )}
      subtitle={t(
        'landing_support_card_badge',
        '0% Platform Fee • +30 Days Dev Builds Per $5'
      )}
      icon={t('icon_verified', 'verified')}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={
              isVerifyingDonation
                ? t('icon_sync', 'sync')
                : t('icon_verified', 'verified')
            }
            tooltip={t('supporter_web_claim_btn', 'Verify & Unlock Dev Builds')}
            onClick={onVerifyWebDonation}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5">
        <SidePanelHeroCard
          icon={t('icon_volunteer_activism', 'volunteer_activism')}
          overline={
            isDevUnlocked
              ? `${Math.max(1, Math.ceil((devBuildUntil - Math.floor(Date.now() / 1000)) / 86400))} ${t('supporter_days_remaining_suffix', 'Days Remaining')}`
              : t('supporter_rate_badge', '$5 = +30 Days')
          }
          title={
            pendingTargetName ||
            t('supporter_keepers_title', 'Sanctuary OS (Keepers Core)')
          }
          description={t(
            'supporter_web_pending_desc',
            'Every $5 contribution adds +30 days of Global Daily Dev Build access. Once completed, your account syncs automatically via webhook or you can verify your Stripe checkout receipt below.'
          )}
          variant={isDevUnlocked ? 'success' : 'accent'}
        />

        <SidePanelTitleInput
          label={t(
            'supporter_web_receipt_label',
            'Stripe Checkout URL or Receipt ID'
          )}
          icon={t('icon_receipt_long', 'receipt_long')}
          value={verifyReceiptInput}
          onChange={setVerifyReceiptInput}
          placeholder={t(
            'supporter_web_receipt_ph',
            'Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...'
          )}
        />

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
            {t('supporter_web_amount_label', 'Contribution Amount (USD)')}
          </span>
          <div className="grid grid-cols-4 gap-2.5">
            {[5, 10, 15, 25].map((amt) => {
              const selected = verifyAmountUsd === amt;
              const days = Math.floor(amt / 5) * 30;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setVerifyAmountUsd(amt)}
                  className={`p-3 rounded-xl glass-surface border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    selected
                      ? 'border-[var(--accent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]'
                      : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="text-sm font-black">{`$${amt}`}</span>
                  <span className="text-[9px] font-mono uppercase tracking-wider opacity-80">
                    {`+${days} ${t('supporter_celebration_days_unit', 'Days')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

