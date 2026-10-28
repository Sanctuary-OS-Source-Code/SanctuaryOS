import { useLexicon } from '../LexiconContext';
import { PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import { CommandScreenSectionHeading } from '../hub-components/SharedCommandScreenLayout';

interface LandingPartnersSectionProps {
  stableVersion: string;
  onOpenPartnerGuide: () => void;
  onOpenPartnerApplication: () => void;
  onOpenPartnerCovenants: () => void;
}

export function LandingPartnersSection({
  stableVersion,
  onOpenPartnerGuide,
  onOpenPartnerApplication,
  onOpenPartnerCovenants,
}: LandingPartnersSectionProps) {
  const { t } = useLexicon();

  return (
    <section
      id="partners"
      className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
    >
      <CommandScreenSectionHeading
        title={t('landing_partners_tab', 'Partner Spokes')}
        icon={t('icon_handshake', 'handshake')}
        rightSlot={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_menu_book', 'menu_book')}
              tooltip={t('landing_partners_about_btn', 'Open Partner Guide')}
              onClick={onOpenPartnerGuide}
            />
            <PanelHeaderButton
              icon={t('icon_rocket_launch', 'rocket_launch')}
              tooltip={t(
                'landing_partner_btn_open',
                'Start Partner Spoke Application'
              )}
              onClick={onOpenPartnerApplication}
            />
          </PanelHeaderGroup>
        }
      />

      {/* 3 Compact Cards in a Single Row: [About Guide • Apply • Combined Covenants] */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {/* Card 1: About Partner Spokes & Setup Guide */}
        <UniversalCard
          layout="vertical"
          onClick={onOpenPartnerGuide}
          icon={t('icon_menu_book', 'menu_book')}
          bannerTopLabel={t(
            'landing_partners_tab_what_sub',
            '100% Sovereignty & 0% Tax'
          )}
          bannerBottomLabel={t(
            'landing_partners_about_sub',
            'Architecture • Supabase Bootstrap • Uplink Handshake • Governance'
          )}
          title={t(
            'landing_partners_about_title',
            'About Partner Spokes & Setup Guide'
          )}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t(
                'landing_partners_about_sub',
                'Architecture • Supabase Bootstrap • Uplink Handshake • Governance'
              )}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('landing_partners_tab', 'Partner Spokes')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>
                  {t('landing_partners_about_btn', 'Open Partner Guide')}
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
              'landing_partners_about_desc',
              'Learn what a Sanctuary OS Partner Spoke is, how 100% data sovereignty and 0% non-custodial donations work, and how to provision, connect, and maintain a community game workspace.'
            )}
          </p>
        </UniversalCard>

        {/* Card 2: Apply to Launch a Partner Game Spoke */}
        <UniversalCard
          layout="vertical"
          onClick={onOpenPartnerApplication}
          icon={t('icon_handshake', 'handshake')}
          bannerTopLabel={t(
            'landing_partner_badge',
            'Readiness-Gated Dossier • Anti-Spam Verified'
          )}
          bannerBottomLabel={t(
            'landing_banner_partner_bottom',
            'Community Workspace Operators • 0% Platform Fee'
          )}
          title={t(
            'landing_partner_card_title',
            'Apply to Launch a Partner Game Spoke'
          )}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t(
                'landing_partner_card_sub',
                'Dedicated Game Workspaces • Operated by Community Wayfinders & Architects'
              )}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('keepers_tab_partner_apps', 'Partner Applications')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>
                  {t(
                    'landing_partner_btn_open',
                    'Start Partner Spoke Application'
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
              'landing_partner_card_desc',
              'Represent an established modding community and want to launch an official game workspace on Sanctuary OS? Complete our readiness check and submit your technical dossier to the Keepers.'
            )}
          </p>
        </UniversalCard>

        {/* Card 3: Combined Partners Agreement & Compliance Protocol (Opens 2-Tabbed Covenants Drawer) */}
        <UniversalCard
          layout="vertical"
          onClick={onOpenPartnerCovenants}
          icon={t('icon_gavel', 'gavel')}
          bannerTopLabel={`V${stableVersion} • ${t(
            'partner_agreement_badge',
            'Spoke Charter'
          )} & ${t('compliance_protocol_badge', 'Safety & Privacy')}`}
          bannerBottomLabel={t(
            'partner_covenants_subtitle',
            'Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants'
          )}
          title={t(
            'partner_covenants_title',
            'Partners Agreement & Compliance Protocol'
          )}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {`V${stableVersion} • ${t(
                'partner_agreement_title',
                'Partners Agreement'
              )} • ${t('compliance_protocol_title', 'Compliance Protocol')}`}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('keepers_title', 'Keepers Core')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>
                  {t('partner_covenants_open_btn', 'Inspect Covenants')}
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
              'partner_covenants_desc',
              'Inspect the binding Sanctuary OS Partners Agreement and Compliance Protocol governing Spoke sovereignty, 0% non-custodial donations, heuristic malware enforcement, and cryptographic {mod} integrity.'
            )}
          </p>
        </UniversalCard>
      </div>
    </section>
  );
}

export function LandingLegalSection() {
  const { t } = useLexicon();

  return (
    <section
      id="legal"
      className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
    >
      <CommandScreenSectionHeading
        title={t('landing_legal_tab', 'Legal')}
        icon={t('icon_gavel', 'gavel')}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        <UniversalCard
          layout="vertical"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('open_legal_doc', { detail: 'eula' })
            )
          }
          icon={t('icon_gavel', 'gavel')}
          bannerTopLabel={t('legal_subtitle', 'Sanctuary Foundry OS')}
          bannerBottomLabel={t('landing_eula', 'System EULA')}
          title={t('landing_eula', 'System EULA')}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t(
                'subtitle_sanctuary_alerts',
                'Official legal terms, privacy policy, and end-user license agreement.'
              )}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('legal_subtitle', 'Sanctuary Foundry OS')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>{t('btn_view', 'View')}</span>
                <span className="material-symbols-outlined !text-[14px]">
                  {t('icon_arrow_forward', 'arrow_forward')}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
            {t(
              'subtitle_sanctuary_alerts',
              'Official legal terms, privacy policy, and end-user license agreement.'
            )}
          </p>
        </UniversalCard>

        <UniversalCard
          layout="vertical"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('open_legal_doc', { detail: 'terms' })
            )
          }
          icon={t('icon_description', 'description')}
          bannerTopLabel={t('legal_subtitle', 'Sanctuary Foundry OS')}
          bannerBottomLabel={t('landing_terms', 'Terms of Service')}
          title={t('landing_terms', 'Terms of Service')}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t('legal_subtitle', 'Sanctuary Foundry OS')}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('legal_subtitle', 'Sanctuary Foundry OS')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>{t('btn_view', 'View')}</span>
                <span className="material-symbols-outlined !text-[14px]">
                  {t('icon_arrow_forward', 'arrow_forward')}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
            {t(
              'subtitle_sanctuary_alerts',
              'Official legal terms, privacy policy, and end-user license agreement.'
            )}
          </p>
        </UniversalCard>

        <UniversalCard
          layout="vertical"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('open_legal_doc', { detail: 'privacy' })
            )
          }
          icon={t('icon_shield', 'shield')}
          bannerTopLabel={t('legal_subtitle', 'Sanctuary Foundry OS')}
          bannerBottomLabel={t('landing_privacy', 'Privacy Protocol')}
          title={t('landing_privacy', 'Privacy Protocol')}
          subtitle={
            <span className="text-[10px] font-mono tracking-widest">
              {t('legal_subtitle', 'Sanctuary Foundry OS')}
            </span>
          }
          className="h-full"
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                {t('legal_subtitle', 'Sanctuary Foundry OS')}
              </span>
              <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                <span>{t('btn_view', 'View')}</span>
                <span className="material-symbols-outlined !text-[14px]">
                  {t('icon_arrow_forward', 'arrow_forward')}
                </span>
              </span>
            </div>
          }
        >
          <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
            {t(
              'subtitle_sanctuary_alerts',
              'Official legal terms, privacy policy, and end-user license agreement.'
            )}
          </p>
        </UniversalCard>
      </div>
    </section>
  );
}

