import { useLexicon } from '../LexiconContext';
import MarkdownRenderer from '../MarkdownRenderer';
import {
  CANONICAL_LEGAL_DOCS,
  fetchSyncedLegalAndCovenants,
} from '../utils/directivesSync';
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  CustomDropdown,
  DashboardStatTile,
  StatTileCarousel,
  UniversalGroup,
} from '../shared';
import {
  UniversalInput,
  UniversalTextArea,
  StatBox,
} from '../components/universal/UniversalLayout';
import { SidePanelPillToggle } from '../components/layouts/ElevatedHubLayout';
import {
  StructuredReleaseNotesView,
  LegalDocVersionInfoBlock,
  cleanPostBodyForViewer,
} from '../components/ReleaseNotesShowcase';

interface LandingApplicationDrawersProps {
  // Partner Spoke Application Drawer
  isPartnerDrawerOpen: boolean;
  setIsPartnerDrawerOpen: (open: boolean) => void;
  resetPartnerFlow: () => void;
  isSubmittingPartner: boolean;
  handleSubmitPartnerApplication: () => void;
  partnerGate1: boolean;
  setPartnerGate1: (v: boolean) => void;
  partnerGate2: boolean;
  setPartnerGate2: (v: boolean) => void;
  partnerGate3: boolean;
  setPartnerGate3: (v: boolean) => void;
  partnerGate4: boolean;
  setPartnerGate4: (v: boolean) => void;
  reviewedPartnersDoc: boolean;
  setReviewedPartnersDoc: (v: boolean) => void;
  reviewedComplianceDoc: boolean;
  setReviewedComplianceDoc: (v: boolean) => void;
  partnerGameTitle: string;
  setPartnerGameTitle: (v: string) => void;
  partnerExtensions: string;
  setPartnerExtensions: (v: string) => void;
  partnerLeadContact: string;
  setPartnerLeadContact: (v: string) => void;
  partnerCommunityUrl: string;
  setPartnerCommunityUrl: (v: string) => void;
  partnerTeamSize: string;
  setPartnerTeamSize: (v: string) => void;
  partnerInfraReadiness: string;
  setPartnerInfraReadiness: (v: string) => void;
  partnerVision: string;
  setPartnerVision: (v: string) => void;
  activePartnerStep: number;
  setActivePartnerStep: (v: number) => void;
  maxPartnerStep: number;
  setMaxPartnerStep: (fn: (prev: number) => number) => void;

  // Stacked Partner Spoke Covenants Drawer
  activePartnerCovenant: 'PartnersAgreement' | 'ComplianceProtocol' | null;
  setActivePartnerCovenant: (
    v: 'PartnersAgreement' | 'ComplianceProtocol' | null
  ) => void;
  covenantViewMode: 'ui' | 'normal';
  setCovenantViewMode: (v: 'ui' | 'normal') => void;
  syncedCovenantDocs: Partial<
    Awaited<ReturnType<typeof fetchSyncedLegalAndCovenants>>
  >;
  stableVersion: string;

  // Apply to Sanctuary Foundry Drawer
  isKeeperAppDrawerOpen: boolean;
  setIsKeeperAppDrawerOpen: (open: boolean) => void;
  resetKeeperFlow: () => void;
  isSubmittingKeeper: boolean;
  handleSubmitKeeperApplication: () => void;
  keeperGate1: boolean;
  setKeeperGate1: (v: boolean) => void;
  keeperGate2: boolean;
  setKeeperGate2: (v: boolean) => void;
  keeperGate3: boolean;
  setKeeperGate3: (v: boolean) => void;
  keeperFocus: string;
  setKeeperFocus: (v: string) => void;
  keeperHandle: string;
  setKeeperHandle: (v: string) => void;
  keeperContact: string;
  setKeeperContact: (v: string) => void;
  keeperPortfolio: string;
  setKeeperPortfolio: (v: string) => void;
  keeperAvailability: string;
  setKeeperAvailability: (v: string) => void;
  keeperExperienceLevel: string;
  setKeeperExperienceLevel: (v: string) => void;
  keeperTimezone: string;
  setKeeperTimezone: (v: string) => void;
  keeperSkills: string[];
  setKeeperSkills: (v: string[]) => void;
  keeperExperience: string;
  setKeeperExperience: (v: string) => void;
  keeperMotivation: string;
  setKeeperMotivation: (v: string) => void;
  activeKeeperStep: number;
  setActiveKeeperStep: (v: number) => void;
  maxKeeperStep: number;
  setMaxKeeperStep: (fn: (prev: number) => number) => void;
  sessionEmail?: string;
}

export function LandingApplicationDrawers({
  isPartnerDrawerOpen,
  setIsPartnerDrawerOpen,
  resetPartnerFlow,
  isSubmittingPartner,
  handleSubmitPartnerApplication,
  partnerGate1,
  setPartnerGate1,
  partnerGate2,
  setPartnerGate2,
  partnerGate3,
  setPartnerGate3,
  partnerGate4,
  setPartnerGate4,
  reviewedPartnersDoc,
  setReviewedPartnersDoc,
  reviewedComplianceDoc,
  setReviewedComplianceDoc,
  partnerGameTitle,
  setPartnerGameTitle,
  partnerExtensions,
  setPartnerExtensions,
  partnerLeadContact,
  setPartnerLeadContact,
  partnerCommunityUrl,
  setPartnerCommunityUrl,
  partnerTeamSize,
  setPartnerTeamSize,
  partnerInfraReadiness,
  setPartnerInfraReadiness,
  partnerVision,
  setPartnerVision,
  activePartnerStep,
  setActivePartnerStep,
  maxPartnerStep,
  setMaxPartnerStep,
  activePartnerCovenant,
  setActivePartnerCovenant,
  covenantViewMode,
  setCovenantViewMode,
  syncedCovenantDocs,
  stableVersion,
  isKeeperAppDrawerOpen,
  setIsKeeperAppDrawerOpen,
  resetKeeperFlow,
  isSubmittingKeeper,
  handleSubmitKeeperApplication,
  keeperGate1,
  setKeeperGate1,
  keeperGate2,
  setKeeperGate2,
  keeperGate3,
  setKeeperGate3,
  keeperFocus,
  setKeeperFocus,
  keeperHandle,
  setKeeperHandle,
  keeperContact,
  setKeeperContact,
  keeperPortfolio,
  setKeeperPortfolio,
  keeperAvailability,
  setKeeperAvailability,
  keeperExperienceLevel,
  setKeeperExperienceLevel,
  keeperTimezone,
  setKeeperTimezone,
  keeperSkills,
  setKeeperSkills,
  keeperExperience,
  setKeeperExperience,
  keeperMotivation,
  setKeeperMotivation,
  activeKeeperStep,
  setActiveKeeperStep,
  maxKeeperStep,
  setMaxKeeperStep,
  sessionEmail,
}: LandingApplicationDrawersProps) {
  const { t } = useLexicon();

  return (
    <>
      {/* =====================================================================
          DRAWER 3: PARTNER GAME SPOKE APPLICATION (CHAT-LIKE GUIDED FLOW)
         ===================================================================== */}
      <SidePanel
        isOpen={isPartnerDrawerOpen}
        onClose={() => setIsPartnerDrawerOpen(false)}
        title={t(
          'landing_partner_drawer_title',
          'Partner Game Spoke Application'
        )}
        subtitle={t(
          'landing_partner_drawer_sub',
          'New Game Workspace Qualification & Onboarding Pipeline'
        )}
        icon={t('icon_handshake', 'handshake')}
        widthClass="w-[90vw] md:w-[700px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_restart_alt', 'restart_alt')}
              tooltip={t('reset', 'Reset')}
              onClick={resetPartnerFlow}
            />
            <PanelHeaderButton
              icon={
                isSubmittingPartner
                  ? t('icon_sync', 'sync')
                  : t('icon_rocket_launch', 'rocket_launch')
              }
              tooltip={t(
                'landing_partner_submit_btn',
                'Submit Partner Spoke Dossier'
              )}
              onClick={handleSubmitPartnerApplication}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={t('icon_handshake', 'handshake')}
            overline={t(
              'landing_partner_badge',
              'Readiness-Gated Dossier • Anti-Spam Verified'
            )}
            title={t(
              'landing_partner_card_title',
              'Apply to Launch a Partner Game Spoke'
            )}
            description={t(
              'landing_partner_card_desc',
              'Represent an established modding community and want to launch an official game workspace on Sanctuary OS? Complete our readiness check and submit your technical dossier to the Keepers.'
            )}
            variant="accent"
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t(
                  'landing_partner_game_title',
                  'Target Game Title & Engine'
                )}
                value={partnerGameTitle.trim() || '--'}
                icon={t('icon_sports_esports', 'sports_esports')}
                iconColorClass="text-[var(--accent)]"
                colorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t('step_progress', 'Step Progress')}
                value={`${Math.min(activePartnerStep + 1, 4)} / 4`}
                icon={t('icon_checklist', 'checklist')}
                iconColorClass="text-[var(--success)]"
                colorClass="text-[var(--text)]"
              />
            </div>
          </SidePanelHeroCard>

          {/* STEP 1: READINESS GATE & COVENANTS */}
          {activePartnerStep > 0 ? (
            <div
              onClick={() => setActivePartnerStep(0)}
              className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
            >
              <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-xs">
                    {t('icon_check_circle', 'check_circle')}
                  </span>
                  {t('step_completed', 'Step Completed')}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] truncate">
                  {t(
                    'landing_partner_gate_hdr',
                    'Step 1: Partner Spoke Readiness Check'
                  )}
                </h4>
                <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                  {t(
                    'landing_partner_badge',
                    'Readiness-Gated Dossier • Anti-Spam Verified'
                  )}
                </p>
              </div>
              <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                {t('icon_edit', 'edit')}
              </span>
            </div>
          ) : (
            <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                  {`${t('step', 'STEP')} 1 / 4`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_partner_gate_hdr',
                    'Step 1: Partner Spoke Readiness Check'
                  )}
                </h3>
                <p className="text-xs text-[var(--subtext)] opacity-80">
                  {t(
                    'landing_partner_gate_desc',
                    'To prevent spam and clarify what a Partner Spoke is, confirm all three operational requirements below to unlock the application dossier:'
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <SidePanelPillToggle
                  label={t(
                    'landing_partner_gate_1_title',
                    'Game Workspace — Not a Personal Creator Badge'
                  )}
                  description={t(
                    'landing_partner_gate_1_desc',
                    'I understand that a Partner Spoke is a dedicated Game Workspace (e.g. Skyrim, GTA V, Stardew Valley) governed by community Wayfinders & Architects—not an individual creator verification badge or mod help desk.'
                  )}
                  icon={t('icon_dns', 'dns')}
                  checked={partnerGate1}
                  onChange={setPartnerGate1}
                />
                <SidePanelPillToggle
                  label={t(
                    'landing_partner_gate_2_title',
                    'Active Moderation & Schema Commitment'
                  )}
                  description={t(
                    'landing_partner_gate_2_desc',
                    "We have a committed team (or established community) ready to maintain our game's Master Schema (extensions, install routes, load order) and moderate {Mod} submissions."
                  )}
                  icon={t('icon_groups', 'groups')}
                  checked={partnerGate2}
                  onChange={setPartnerGate2}
                />
                <SidePanelPillToggle
                  label={t(
                    'landing_partner_gate_3_title',
                    'Anti-Malware & 0% Fee Charter Compliance'
                  )}
                  description={t(
                    'landing_partner_gate_3_desc',
                    "Our spoke will uphold Sanctuary OS's cryptographic hash verification, zero-malware tolerance, and non-custodial 0% platform fee policy."
                  )}
                  icon={t('icon_shield', 'shield')}
                  checked={partnerGate3}
                  onChange={setPartnerGate3}
                />

                {/* REQUIRED PARTNER SPOKE COVENANTS CONTAINER */}
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex flex-col gap-3.5 mt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                        {t('icon_gavel', 'gavel')}
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                        {t(
                          'partner_covenants_title',
                          'Partners Agreement & Compliance Protocol'
                        )}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                        partnerGate4
                          ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]'
                          : 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]'
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        {partnerGate4
                          ? t('icon_verified', 'verified')
                          : t('icon_menu_book', 'menu_book')}
                      </span>
                      <span>
                        {partnerGate4
                          ? t('partner_covenants_agreed_badge', 'Agreed & Verified')
                          : t('partner_covenants_review_badge', 'Review Required')}
                      </span>
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--subtext)] opacity-85 leading-relaxed">
                    {t(
                      'partner_covenants_desc',
                      'Inspect the binding Sanctuary OS Partners Agreement and Compliance Protocol governing Spoke sovereignty, 0% non-custodial donations, heuristic malware enforcement, and cryptographic {mod} integrity.'
                    )}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewedPartnersDoc(true);
                        setActivePartnerCovenant('PartnersAgreement');
                      }}
                      className={`p-3.5 rounded-2xl glass-panel border text-left flex flex-col gap-2 cursor-pointer transition-all group ${
                        reviewedPartnersDoc || partnerGate4
                          ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]'
                          : 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[15px]">
                            {t('icon_handshake', 'handshake')}
                          </span>
                          <span>
                            {t('partner_agreement_badge', 'Spoke Charter')}
                          </span>
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                            reviewedPartnersDoc || partnerGate4
                              ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]'
                              : 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]'
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[11px]">
                            {reviewedPartnersDoc || partnerGate4
                              ? t('icon_check_circle', 'check_circle')
                              : t('icon_open_in_new', 'open_in_new')}
                          </span>
                          <span>
                            {reviewedPartnersDoc || partnerGate4
                              ? t('verified', 'Verified')
                              : t('btn_view', 'View')}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {t('partner_agreement_title', 'Partners Agreement')}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80 leading-relaxed">
                          {t(
                            'partner_agreement_desc',
                            'Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries.'
                          )}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReviewedComplianceDoc(true);
                        setActivePartnerCovenant('ComplianceProtocol');
                      }}
                      className={`p-3.5 rounded-2xl glass-panel border text-left flex flex-col gap-2 cursor-pointer transition-all group ${
                        reviewedComplianceDoc || partnerGate4
                          ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]'
                          : 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[15px]">
                            {t('icon_verified_user', 'verified_user')}
                          </span>
                          <span>
                            {t('compliance_protocol_badge', 'Safety & Privacy')}
                          </span>
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                            reviewedComplianceDoc || partnerGate4
                              ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]'
                              : 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]'
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[11px]">
                            {reviewedComplianceDoc || partnerGate4
                              ? t('icon_check_circle', 'check_circle')
                              : t('icon_open_in_new', 'open_in_new')}
                          </span>
                          <span>
                            {reviewedComplianceDoc || partnerGate4
                              ? t('verified', 'Verified')
                              : t('btn_view', 'View')}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {t(
                            'compliance_protocol_title',
                            'Compliance Protocol'
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80 leading-relaxed">
                          {t(
                            'compliance_protocol_desc',
                            'Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards.'
                          )}
                        </span>
                      </div>
                    </button>
                  </div>

                  <SidePanelPillToggle
                    label={t(
                      'partner_covenants_agree_label',
                      'I have read and agree to the Partners Agreement & Compliance Protocol'
                    )}
                    description={t(
                      'partner_covenants_agree_desc',
                      'Required before continuing: Review and accept both the Sanctuary OS Partners Agreement and Compliance Protocol to unlock and submit the Spoke application dossier.'
                    )}
                    icon={t('icon_verified', 'verified')}
                    checked={partnerGate4}
                    onChange={(nextVal: boolean) => {
                      setPartnerGate4(nextVal);
                      if (nextVal) {
                        setReviewedPartnersDoc(true);
                        setReviewedComplianceDoc(true);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_done', 'done')}
                  label={t('confirm', 'Confirm')}
                  disabled={
                    !partnerGate1 ||
                    !partnerGate2 ||
                    !partnerGate3 ||
                    !partnerGate4
                  }
                  onClick={() => {
                    setActivePartnerStep(1);
                    setMaxPartnerStep((prev) => Math.max(prev, 1));
                  }}
                />
              </div>
            </div>
          )}

          {/* STEP 2: TARGET GAME, EXTENSIONS & LEAD CONTACT */}
          {maxPartnerStep >= 1 &&
            (activePartnerStep > 1 ? (
              <div
                onClick={() => setActivePartnerStep(1)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {partnerGameTitle}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {`${partnerExtensions} • ${partnerLeadContact}`}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activePartnerStep === 1 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 2 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t(
                      'landing_partner_dossier_hdr',
                      'Step 2: Spoke Technical & Community Dossier'
                    )}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <UniversalInput
                    label={`${t('landing_partner_game_title', 'Target Game Title & Engine')} *`}
                    value={partnerGameTitle}
                    onChange={setPartnerGameTitle}
                    placeholder={t(
                      'landing_partner_game_title_ph',
                      'e.g. Fallout 4 (Creation Engine) / Terraria (tModLoader)'
                    )}
                  />
                  <UniversalInput
                    label={`${t('landing_partner_extensions', 'Primary {Mod} File Formats / Extensions')} *`}
                    value={partnerExtensions}
                    onChange={setPartnerExtensions}
                    placeholder={t(
                      'landing_partner_extensions_ph',
                      'e.g. .esp, .ba2, .dll, .pak, .archive'
                    )}
                  />
                  <UniversalInput
                    label={`${t('landing_partner_lead_contact', 'Lead Wayfinder Handle & Direct Contact (Discord / Email)')} *`}
                    value={partnerLeadContact}
                    onChange={setPartnerLeadContact}
                    placeholder={t(
                      'landing_partner_lead_contact_ph',
                      'e.g. @wayfinder (Discord) & lead@community.org'
                    )}
                  />
                  <UniversalInput
                    label={t(
                      'landing_partner_community_url',
                      'Existing Community, Forum, or GitHub URL'
                    )}
                    value={partnerCommunityUrl}
                    onChange={setPartnerCommunityUrl}
                    placeholder={t(
                      'landing_partner_community_url_ph',
                      'https://discord.gg/... or https://github.com/...'
                    )}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
                    disabled={
                      !partnerGameTitle.trim() ||
                      !partnerExtensions.trim() ||
                      !partnerLeadContact.trim()
                    }
                    onClick={() => {
                      setActivePartnerStep(2);
                      setMaxPartnerStep((prev) => Math.max(prev, 2));
                    }}
                  />
                </div>
              </div>
            ) : null)}

          {/* STEP 3: TEAM SIZE, INFRASTRUCTURE & GOVERNANCE PLAN */}
          {maxPartnerStep >= 2 &&
            (activePartnerStep > 2 ? (
              <div
                onClick={() => setActivePartnerStep(2)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {`${partnerTeamSize} • ${partnerInfraReadiness}`}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {partnerVision}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activePartnerStep === 2 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 3 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t(
                      'landing_partner_vision',
                      'Workspace Scope, Install Routing & Governance Plan'
                    )}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex flex-col justify-end gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                      {t(
                        'landing_partner_team_size',
                        'Active Moderation / Architect Team Size'
                      )}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={partnerTeamSize}
                      onChange={(v: string[]) =>
                        setPartnerTeamSize(
                          v[0] || '2-3 Moderators / Architects'
                        )
                      }
                      options={[
                        {
                          id: 'Solo Founder (Recruiting Team)',
                          label: t(
                            'landing_partner_team_solo',
                            'Solo Founder (Recruiting Team)'
                          ),
                        },
                        {
                          id: '2-3 Moderators / Architects',
                          label: t(
                            'landing_partner_team_small',
                            '2–3 Moderators / Architects'
                          ),
                        },
                        {
                          id: '4-10 Established Staff',
                          label: t(
                            'landing_partner_team_medium',
                            '4–10 Established Staff'
                          ),
                        },
                        {
                          id: '10+ Large Community Staff',
                          label: t(
                            'landing_partner_team_large',
                            '10+ Large Community Staff'
                          ),
                        },
                      ]}
                    />
                  </div>

                  <div className="flex flex-col justify-end gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                      {t(
                        'landing_partner_infra_ready',
                        'Supabase Spoke Infrastructure Readiness'
                      )}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={partnerInfraReadiness}
                      onChange={(v: string[]) =>
                        setPartnerInfraReadiness(
                          v[0] ||
                            'Ready to Provision Dedicated Supabase Project'
                        )
                      }
                      options={[
                        {
                          id: 'Ready to Provision Dedicated Supabase Project',
                          label: t(
                            'landing_partner_infra_ready_yes',
                            'Ready to Provision Dedicated Supabase Project'
                          ),
                        },
                        {
                          id: 'Need Keeper Guidance on Uplink Bootstrap',
                          label: t(
                            'landing_partner_infra_ready_help',
                            'Need Keeper Guidance on Uplink Bootstrap'
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {`${t('landing_partner_vision', 'Workspace Scope, Install Routing & Governance Plan')} *`}
                    </label>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        partnerVision.trim().length >= 50
                          ? 'text-[var(--success)]'
                          : 'text-[var(--warning)]'
                      }`}
                    >
                      {`${partnerVision.trim().length} / 50+ ${t('landing_partner_min_chars_hint', 'Minimum 50 characters required')}`}
                    </span>
                  </div>
                  <UniversalTextArea
                    value={partnerVision}
                    onChange={setPartnerVision}
                    placeholder={t(
                      'landing_partner_vision_ph',
                      'Describe how mods are installed for this game, your existing community or tooling experience, and how your team plans to curate and verify {Mods}...'
                    )}
                    className="min-h-[160px] sm:min-h-[180px]"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
                    disabled={partnerVision.trim().length < 50}
                    onClick={() => {
                      setActivePartnerStep(3);
                      setMaxPartnerStep((prev) => Math.max(prev, 3));
                    }}
                  />
                </div>
              </div>
            ) : null)}

          {/* STEP 4: REVIEW & SUBMIT PARTNER DOSSIER */}
          {maxPartnerStep >= 3 && activePartnerStep === 3 && (
            <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] w-max">
                  {`${t('step', 'STEP')} 4 / 4`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_partner_submit_btn',
                    'Submit Partner Spoke Dossier'
                  )}
                </h3>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_rocket_launch', 'rocket_launch')}
                  label={
                    isSubmittingPartner
                      ? t('btn_submitting', 'Submitting...')
                      : t(
                          'landing_partner_submit_btn',
                          'Submit Partner Spoke Dossier'
                        )
                  }
                  onClick={handleSubmitPartnerApplication}
                  disabled={isSubmittingPartner}
                />
              </div>
            </div>
          )}
        </div>
      </SidePanel>

      {/* =====================================================================
          DRAWER 3B: STACKED PARTNER SPOKE COVENANTS PANEL (2 TABS)
         ===================================================================== */}
      <SidePanel
        isOpen={!!activePartnerCovenant}
        onClose={() => setActivePartnerCovenant(null)}
        icon={
          activePartnerCovenant === 'ComplianceProtocol'
            ? t('icon_verified_user', 'verified_user')
            : t('icon_handshake', 'handshake')
        }
        iconColorClass="text-[var(--accent)]"
        title={
          activePartnerCovenant === 'ComplianceProtocol'
            ? syncedCovenantDocs.ComplianceProtocol?.title ||
              CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
            : syncedCovenantDocs.PartnersAgreement?.title ||
              CANONICAL_LEGAL_DOCS.PartnersAgreement.title
        }
        subtitle={t(
          'partner_covenants_subtitle',
          'Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants'
        )}
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_check_circle', 'check_circle')}
              tooltip={t(
                'partner_covenants_agree_btn',
                'Agree to Both Covenants & Continue'
              )}
              variant="accent"
              onClick={() => {
                setReviewedPartnersDoc(true);
                setReviewedComplianceDoc(true);
                setPartnerGate4(true);
                setActivePartnerCovenant(null);
              }}
            />
            <PanelHeaderButton
              icon={t('icon_dashboard', 'dashboard')}
              tooltip={t('tab_visual', 'Visual')}
              onClick={() => setCovenantViewMode('ui')}
              variant={covenantViewMode === 'ui' ? 'accent' : 'default'}
            />
            <PanelHeaderButton
              icon={t('icon_menu_book', 'menu_book')}
              tooltip={t('btn_post', 'Post')}
              onClick={() => setCovenantViewMode('normal')}
              variant={covenantViewMode === 'normal' ? 'accent' : 'default'}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <StatTileCarousel innerClassName="px-0">
            <DashboardStatTile
              variant="filter"
              icon={t('icon_handshake', 'handshake')}
              label={`V${stableVersion} • ${t(
                'partner_agreement_badge',
                'Spoke Charter'
              )}`}
              number={t('partner_agreement_title', 'Partners Agreement')}
              isActive={activePartnerCovenant === 'PartnersAgreement'}
              onClick={() => {
                setReviewedPartnersDoc(true);
                setActivePartnerCovenant('PartnersAgreement');
              }}
            />
            <DashboardStatTile
              variant="filter"
              icon={t('icon_verified_user', 'verified_user')}
              label={`V${stableVersion} • ${t(
                'compliance_protocol_badge',
                'Safety & Privacy'
              )}`}
              number={t('compliance_protocol_title', 'Compliance Protocol')}
              isActive={activePartnerCovenant === 'ComplianceProtocol'}
              onClick={() => {
                setReviewedComplianceDoc(true);
                setActivePartnerCovenant('ComplianceProtocol');
              }}
            />
          </StatTileCarousel>

          <SidePanelHeroCard
            icon={
              activePartnerCovenant === 'ComplianceProtocol'
                ? t('icon_verified_user', 'verified_user')
                : t('icon_handshake', 'handshake')
            }
            overline={t(
              'partner_covenants_subtitle',
              'Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants'
            )}
            title={
              activePartnerCovenant === 'ComplianceProtocol'
                ? syncedCovenantDocs.ComplianceProtocol?.title ||
                  CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
                : syncedCovenantDocs.PartnersAgreement?.title ||
                  CANONICAL_LEGAL_DOCS.PartnersAgreement.title
            }
            description={
              activePartnerCovenant === 'ComplianceProtocol'
                ? t(
                    'compliance_protocol_desc',
                    'Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards.'
                  )
                : t(
                    'partner_agreement_desc',
                    'Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries.'
                  )
            }
            badge={
              activePartnerCovenant === 'ComplianceProtocol'
                ? `V${stableVersion} • ${t(
                    'compliance_protocol_badge',
                    'Safety & Privacy'
                  )}`
                : `V${stableVersion} • ${t(
                    'partner_agreement_badge',
                    'Spoke Charter'
                  )}`
            }
            badgeIcon={t('icon_verified', 'verified')}
            variant="accent"
          >
            <LegalDocVersionInfoBlock />
          </SidePanelHeroCard>

          <UniversalGroup
            title={
              activePartnerCovenant === 'ComplianceProtocol'
                ? syncedCovenantDocs.ComplianceProtocol?.title ||
                  CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
                : syncedCovenantDocs.PartnersAgreement?.title ||
                  CANONICAL_LEGAL_DOCS.PartnersAgreement.title
            }
            icon={t('icon_description', 'description')}
          >
            {(() => {
              const activeBody =
                activePartnerCovenant === 'ComplianceProtocol'
                  ? syncedCovenantDocs.ComplianceProtocol?.content ||
                    CANONICAL_LEGAL_DOCS.ComplianceProtocol.bundledContent
                  : syncedCovenantDocs.PartnersAgreement?.content ||
                    CANONICAL_LEGAL_DOCS.PartnersAgreement.bundledContent;
              return covenantViewMode === 'ui' ? (
                <StructuredReleaseNotesView
                  content={activeBody}
                  hideIntro={true}
                />
              ) : (
                <div className="glass-panel rounded-3xl p-5 sm:p-6 prose prose-invert max-w-none text-[var(--text)]">
                  <MarkdownRenderer
                    content={cleanPostBodyForViewer(activeBody)}
                  />
                </div>
              );
            })()}
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* =====================================================================
          DRAWER 3D: APPLY TO SANCTUARY FOUNDRY SIDEPANEL (GUIDED ROLE APPLICATION)
         ===================================================================== */}
      <SidePanel
        isOpen={isKeeperAppDrawerOpen}
        onClose={() => setIsKeeperAppDrawerOpen(false)}
        title={t('landing_keeper_drawer_title', 'Apply to Sanctuary Foundry')}
        subtitle={t(
          'landing_keeper_drawer_sub',
          'Sanctuary Foundry Organization • Open Keeper Roles & Technical Application'
        )}
        icon={t('icon_admin_panel_settings', 'admin_panel_settings')}
        widthClass="w-[90vw] md:w-[740px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_restart_alt', 'restart_alt')}
              tooltip={t('reset', 'Reset')}
              onClick={resetKeeperFlow}
            />
            <PanelHeaderButton
              icon={
                isSubmittingKeeper
                  ? t('icon_sync', 'sync')
                  : t('icon_rocket_launch', 'rocket_launch')
              }
              tooltip={t(
                'landing_keeper_submit_btn',
                'Submit Application to Sanctuary Foundry'
              )}
              onClick={handleSubmitKeeperApplication}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={t('icon_admin_panel_settings', 'admin_panel_settings')}
            overline={t(
              'landing_keeper_apply_overline',
              'Sanctuary Foundry • Open Positions'
            )}
            title={t(
              'landing_keeper_apply_title',
              'Apply to Sanctuary Foundry'
            )}
            description={t(
              'landing_keeper_apply_desc',
              'Apply to join Sanctuary Foundry as a Keeper—building Sanctuary OS, authoring multi-game Master Schemas, analyzing malware heuristics, or handling direct human support in Keepers Core.'
            )}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <StatBox
                label={t('landing_keeper_focus_label', 'Open Position / Role')}
                value={keeperFocus}
                icon={t('icon_work', 'work')}
                iconColorClass="text-[var(--accent)]"
                colorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t('step_progress', 'Step Progress')}
                value={`${Math.min(activeKeeperStep + 1, 3)} / 3`}
                icon={t('icon_checklist', 'checklist')}
                iconColorClass="text-[var(--success)]"
                colorClass="text-[var(--text)]"
              />
            </div>
          </SidePanelHeroCard>

          {/* STEP 1: OPEN POSITION, COMMITMENT & FOUNDRY STANDARDS */}
          {activeKeeperStep > 0 ? (
            <div
              onClick={() => setActiveKeeperStep(0)}
              className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
            >
              <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-xs">
                    {t('icon_check_circle', 'check_circle')}
                  </span>
                  {t('step_completed', 'Step Completed')}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] truncate">
                  {keeperFocus}
                </h4>
                <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                  {`${keeperAvailability} • ${keeperExperienceLevel}`}
                </p>
              </div>
              <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                {t('icon_edit', 'edit')}
              </span>
            </div>
          ) : (
            <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                  {`${t('step', 'STEP')} 1 / 3`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_keeper_gate_hdr',
                    'Step 1: Open Position, Commitment & Foundry Standards'
                  )}
                </h3>
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    'landing_keeper_gate_desc',
                    'Sanctuary Foundry is the organization behind Sanctuary OS. Keepers are our developers, security analysts, schema architects, and support staff operating out of Keepers Core. Select a position and confirm all three standards below:'
                  )}
                </p>
              </div>

              {/* 6 Real Sanctuary Foundry Open Positions */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1">
                  {t('landing_keeper_focus_label', 'Open Position / Role')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'Systems & Backend Engineer (Rust / Tauri)',
                      icon: t('icon_terminal', 'terminal'),
                      dept: t(
                        'landing_keeper_role_systems_dept',
                        'Core Engineering'
                      ),
                      title: t(
                        'landing_keeper_role_systems_title',
                        'Systems & Backend Engineer (Rust / Tauri)'
                      ),
                      desc: t(
                        'landing_keeper_role_systems_desc',
                        'Native desktop runtime, SQLite state engine, symlink/hardlink deployment, archive extraction, and Windows/macOS parity.'
                      ),
                    },
                    {
                      id: 'Frontend & Graphics Engineer (TypeScript / React / WebGL2)',
                      icon: t('icon_code', 'code'),
                      dept: t(
                        'landing_keeper_role_frontend_dept',
                        'UI & Graphics'
                      ),
                      title: t(
                        'landing_keeper_role_frontend_title',
                        'Frontend & Graphics Engineer (TypeScript / React / WebGL2)'
                      ),
                      desc: t(
                        'landing_keeper_role_frontend_desc',
                        '3D WebGL2 Liquid Glass surfaces, Chameleon theme engine, Mobile PWA, and high-concurrency UI architecture.'
                      ),
                    },
                    {
                      id: 'Malware & Reverse-Engineering Analyst (Heuristics)',
                      icon: t('icon_shield_lock', 'shield_lock'),
                      dept: t(
                        'landing_keeper_role_security_dept',
                        'Threat Intelligence'
                      ),
                      title: t(
                        'landing_keeper_role_security_title',
                        'Malware & Reverse-Engineering Analyst (Heuristics)'
                      ),
                      desc: t(
                        'landing_keeper_role_security_desc',
                        'Bytecode/binary inspection, Base64/hex deobfuscation, Zlib/Zstd stream analysis, and global heuristic threat signatures.'
                      ),
                    },
                    {
                      id: 'Multi-Game Schema & Tooling Architect',
                      icon: t('icon_architecture', 'architecture'),
                      dept: t(
                        'landing_keeper_role_schema_dept',
                        'Game Integration'
                      ),
                      title: t(
                        'landing_keeper_role_schema_title',
                        'Multi-Game Schema & Tooling Architect'
                      ),
                      desc: t(
                        'landing_keeper_role_schema_desc',
                        'Mapping game folder structures, load-order engines, config formats, and authoring Master Schemas & Workbench templates.'
                      ),
                    },
                    {
                      id: 'Platform Support & Technical Triage Specialist',
                      icon: t('icon_support_agent', 'support_agent'),
                      dept: t(
                        'landing_keeper_role_support_dept',
                        'Support & Triage'
                      ),
                      title: t(
                        'landing_keeper_role_support_title',
                        'Platform Support & Technical Triage Specialist'
                      ),
                      desc: t(
                        'landing_keeper_role_support_desc',
                        'Investigating Sanctuary OS bug reports, analyzing diagnostic logs, assisting {Citizens}, and handling direct human inquiries.'
                      ),
                    },
                    {
                      id: 'Partner Spoke Relations & Documentation Lead',
                      icon: t('icon_handshake', 'handshake'),
                      dept: t(
                        'landing_keeper_role_spokes_dept',
                        'Operations & Docs'
                      ),
                      title: t(
                        'landing_keeper_role_spokes_title',
                        'Partner Spoke Relations & Documentation Lead'
                      ),
                      desc: t(
                        'landing_keeper_role_spokes_desc',
                        'Onboarding Partner Game Communities, verifying Spoke readiness, and authoring plain-English {Citizen} Guides & Directives.'
                      ),
                    },
                  ].map((role) => {
                    const active = keeperFocus === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setKeeperFocus(role.id)}
                        className={`p-3.5 rounded-2xl glass-surface border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                          active
                            ? 'border-[var(--accent)] sa-glass-active'
                            : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div
                            className={`w-8 h-8 rounded-xl glass-surface border flex items-center justify-center shrink-0 ${
                              active
                                ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]'
                                : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)]'
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[18px]">
                              {role.icon}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                            <span
                              className={`material-symbols-outlined !text-[11px] ${
                                active
                                  ? 'text-[var(--accent)]'
                                  : 'text-[var(--subtext)]'
                              }`}
                            >
                              {role.icon}
                            </span>
                            <span>{role.dept}</span>
                          </span>
                        </div>
                        <span
                          className={`text-xs font-black leading-snug ${
                            active
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--text)]'
                          }`}
                        >
                          {role.title}
                        </span>
                        <p className="text-[10px] text-[var(--subtext)] opacity-80 leading-relaxed m-0">
                          {role.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2-Column Aligned Dropdowns: Weekly Availability & Experience Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col justify-end gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                    {t(
                      'landing_keeper_availability_label',
                      'Weekly Availability'
                    )}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={keeperAvailability}
                    onChange={(v: string[]) =>
                      setKeeperAvailability(
                        v[0] || 'Part-Time (5–15 hrs/wk)'
                      )
                    }
                    options={[
                      {
                        id: 'Core Team (15+ hrs/wk)',
                        label: t(
                          'landing_keeper_avail_core',
                          'Core Team (15+ hrs/wk)'
                        ),
                      },
                      {
                        id: 'Part-Time (5–15 hrs/wk)',
                        label: t(
                          'landing_keeper_avail_part',
                          'Part-Time (5–15 hrs/wk)'
                        ),
                      },
                      {
                        id: 'Advisory / Triage (2–5 hrs/wk)',
                        label: t(
                          'landing_keeper_avail_advisory',
                          'Advisory / Triage (2–5 hrs/wk)'
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="flex flex-col justify-end gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                    {t(
                      'landing_keeper_exp_level_label',
                      'Experience Level & Background'
                    )}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={keeperExperienceLevel}
                    onChange={(v: string[]) =>
                      setKeeperExperienceLevel(
                        v[0] || 'Mid-Level (2–5 Years)'
                      )
                    }
                    options={[
                      {
                        id: 'Senior / Lead (5+ Years)',
                        label: t(
                          'landing_keeper_level_senior',
                          'Senior / Lead (5+ Years)'
                        ),
                      },
                      {
                        id: 'Mid-Level (2–5 Years)',
                        label: t(
                          'landing_keeper_level_mid',
                          'Mid-Level (2–5 Years)'
                        ),
                      },
                      {
                        id: 'Indie Tool / Mod Creator',
                        label: t(
                          'landing_keeper_level_indie',
                          'Indie Tool / {Mod} Creator'
                        ),
                      },
                      {
                        id: 'Support, QA & Operations',
                        label: t(
                          'landing_keeper_level_ops',
                          'Support, QA & Operations'
                        ),
                      },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <SidePanelPillToggle
                  label={t(
                    'landing_keeper_gate_1_title',
                    'Sanctuary Foundry Organization & Keeper Role'
                  )}
                  description={t(
                    'landing_keeper_gate_1_desc',
                    'I understand I am applying to Sanctuary Foundry to serve as a Keeper—working on Sanctuary OS engineering, malware heuristics, schemas, or platform support in Keepers Core.'
                  )}
                  icon={t(
                    'icon_admin_panel_settings',
                    'admin_panel_settings'
                  )}
                  checked={keeperGate1}
                  onChange={setKeeperGate1}
                />
                <SidePanelPillToggle
                  label={t(
                    'landing_keeper_gate_2_title',
                    'Zero-Trust FIDO2 Passkey & Anti-Malware Integrity'
                  )}
                  description={t(
                    'landing_keeper_gate_2_desc',
                    'I commit to hardware-backed FIDO2 Passkey authentication, impartial heuristic malware analysis, and append-only audit log transparency across Keepers Core.'
                  )}
                  icon={t('icon_shield_lock', 'shield_lock')}
                  checked={keeperGate2}
                  onChange={setKeeperGate2}
                />
                <SidePanelPillToggle
                  label={t(
                    'landing_keeper_gate_3_title',
                    'Human-First Support & Zero-PII Privacy Standard'
                  )}
                  description={t(
                    'landing_keeper_gate_3_desc',
                    'I will handle {Citizen} support tickets, bug diagnostics, and Partner Spoke applications with genuine human care and zero tolerance for data harvesting.'
                  )}
                  icon={t('icon_verified_user', 'verified_user')}
                  checked={keeperGate3}
                  onChange={setKeeperGate3}
                />
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_done', 'done')}
                  label={t('confirm', 'Confirm')}
                  disabled={!keeperGate1 || !keeperGate2 || !keeperGate3}
                  onClick={() => {
                    setActiveKeeperStep(1);
                    setMaxKeeperStep((prev) => Math.max(prev, 1));
                  }}
                />
              </div>
            </div>
          )}

          {/* STEP 2: APPLICANT PROFILE, TECHNICAL STACK & EXPERIENCE */}
          {maxKeeperStep >= 1 &&
            (activeKeeperStep > 1 ? (
              <div
                onClick={() => setActiveKeeperStep(1)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {`${keeperHandle || sessionEmail || ''} • ${keeperContact}`}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {keeperSkills.length > 0
                      ? `${keeperSkills.join(', ')} — ${keeperExperience}`
                      : keeperExperience}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activeKeeperStep === 1 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 2 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t(
                      'landing_keeper_step2_hdr',
                      'Step 2: Applicant Profile, Technical Stack & Experience'
                    )}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      'landing_keeper_step2_desc',
                      'Provide your contact credentials, technical stack, and background for the Sanctuary Foundry review team in Keepers Core.'
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <UniversalInput
                    label={`${t('landing_keeper_handle_label', 'Your Name or Handle')} *`}
                    value={keeperHandle}
                    onChange={setKeeperHandle}
                    placeholder="@handle"
                  />
                  <UniversalInput
                    label={`${t('landing_keeper_contact_label', 'Direct Email or Discord')} *`}
                    value={keeperContact}
                    onChange={setKeeperContact}
                    placeholder="you@example.com"
                  />
                </div>

                {/* Aligned 2-Column Row: Portfolio Input + Primary Timezone Dropdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <UniversalInput
                    label={t(
                      'landing_keeper_portfolio_label',
                      'GitHub, Portfolio, or Profile URL'
                    )}
                    value={keeperPortfolio}
                    onChange={setKeeperPortfolio}
                    placeholder="https://github.com/..."
                  />
                  <div className="flex flex-col justify-end gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                      {t(
                        'landing_keeper_tz_label',
                        'Primary Timezone / Region'
                      )}
                    </label>
                    <CustomDropdown
                      disableTint={true}
                      value={keeperTimezone}
                      onChange={(v: string[]) =>
                        setKeeperTimezone(
                          v[0] || 'Americas (UTC-8 to UTC-3)'
                        )
                      }
                      options={[
                        {
                          id: 'Americas (UTC-8 to UTC-3)',
                          label: t(
                            'landing_keeper_tz_americas',
                            'Americas (UTC-8 to UTC-3)'
                          ),
                        },
                        {
                          id: 'Europe / UK / Africa (UTC+0 to UTC+3)',
                          label: t(
                            'landing_keeper_tz_emea',
                            'Europe / UK / Africa (UTC+0 to UTC+3)'
                          ),
                        },
                        {
                          id: 'Asia-Pacific / Oceania (UTC+5 to UTC+12)',
                          label: t(
                            'landing_keeper_tz_apac',
                            'Asia-Pacific / Oceania (UTC+5 to UTC+12)'
                          ),
                        },
                        {
                          id: 'Flexible / Global Async',
                          label: t(
                            'landing_keeper_tz_flex',
                            'Flexible / Global Async'
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* Interactive Technical Stack & Core Domains Multi-Select Chips */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                    {t(
                      'landing_keeper_skills_label',
                      'Technical Stack & Core Domains (Select All That Apply)'
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        id: 'Rust',
                        icon: t('icon_terminal', 'terminal'),
                        label: 'Rust',
                      },
                      {
                        id: 'TypeScript / React',
                        icon: t('icon_code', 'code'),
                        label: 'TypeScript / React',
                      },
                      {
                        id: 'Tauri / Desktop',
                        icon: t('icon_desktop_windows', 'desktop_windows'),
                        label: 'Tauri / Desktop',
                      },
                      {
                        id: 'SQL / Supabase',
                        icon: t('icon_database', 'database'),
                        label: 'SQL / Supabase',
                      },
                      {
                        id: 'WebGL2 / Shaders',
                        icon: t('icon_blur_on', 'blur_on'),
                        label: 'WebGL2 / Shaders',
                      },
                      {
                        id: 'Reverse Engineering',
                        icon: t('icon_shield_lock', 'shield_lock'),
                        label: 'Reverse Engineering',
                      },
                      {
                        id: 'Python / Bytecode',
                        icon: t('icon_memory', 'memory'),
                        label: 'Python / Bytecode',
                      },
                      {
                        id: 'Game Schema Design',
                        icon: t('icon_architecture', 'architecture'),
                        label: 'Game Schema Design',
                      },
                      {
                        id: 'QA & Log Triage',
                        icon: t('icon_bug_report', 'bug_report'),
                        label: 'QA & Log Triage',
                      },
                      {
                        id: 'Technical Writing',
                        icon: t('icon_menu_book', 'menu_book'),
                        label: 'Technical Writing',
                      },
                    ].map((skill) => {
                      const selected = keeperSkills.includes(skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setKeeperSkills(
                                keeperSkills.filter((s) => s !== skill.id)
                              );
                            } else {
                              setKeeperSkills([...keeperSkills, skill.id]);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-surface border text-[11px] font-black transition-all cursor-pointer ${
                            selected
                              ? 'border-[var(--accent)] sa-glass-active text-[var(--text)]'
                              : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[14px] ${
                              selected
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--subtext)] opacity-70'
                            }`}
                          >
                            {selected
                              ? t('icon_check_circle', 'check_circle')
                              : skill.icon}
                          </span>
                          <span>{skill.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 leading-tight">
                      {`${t('landing_keeper_exp_label', 'Shipped Projects, Technical Background & Relevant Experience (Min 40 chars)')} *`}
                    </label>
                    <span
                      className={`text-[10px] font-mono font-bold shrink-0 ${
                        keeperExperience.trim().length >= 40
                          ? 'text-[var(--success)]'
                          : 'text-[var(--warning)]'
                      }`}
                    >
                      {`${keeperExperience.trim().length} / 40+`}
                    </span>
                  </div>
                  <UniversalTextArea
                    value={keeperExperience}
                    onChange={setKeeperExperience}
                    placeholder={t(
                      'landing_keeper_exp_ph',
                      'Share shipped projects, GitHub repos, reverse-engineering or modding tool work, support/triage experience, or systems you have built...'
                    )}
                    className="min-h-[170px] sm:min-h-[190px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 px-1 leading-tight">
                    {t(
                      'landing_keeper_motivation_label',
                      'Role Approach / Why Sanctuary Foundry (Optional)'
                    )}
                  </label>
                  <UniversalTextArea
                    value={keeperMotivation}
                    onChange={setKeeperMotivation}
                    placeholder={t(
                      'landing_keeper_motivation_ph',
                      'What would you focus on first in this role at Sanctuary Foundry, or what part of Sanctuary OS excites you most?'
                    )}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
                    disabled={
                      !keeperHandle.trim() ||
                      !keeperContact.trim() ||
                      keeperExperience.trim().length < 40
                    }
                    onClick={() => {
                      setActiveKeeperStep(2);
                      setMaxKeeperStep((prev) => Math.max(prev, 2));
                    }}
                  />
                </div>
              </div>
            ) : null)}

          {/* STEP 3: REVIEW DOSSIER & SUBMIT TO SANCTUARY FOUNDRY */}
          {maxKeeperStep >= 2 && activeKeeperStep === 2 && (
            <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] w-max">
                  {`${t('step', 'STEP')} 3 / 3`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_keeper_step3_hdr',
                    'Step 3: Review Dossier & Submit to Sanctuary Foundry'
                  )}
                </h3>
                <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed">
                  {t(
                    'landing_keeper_step3_desc',
                    'Verify your selected position, technical stack, and application details below before transmitting your dossier to Sanctuary Foundry.'
                  )}
                </p>
              </div>

              {/* Structured Application Dossier Summary */}
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t('landing_keeper_focus_label', 'Open Position / Role')}
                    </span>
                    <span className="text-xs font-black text-[var(--accent)]">
                      {keeperFocus}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t(
                        'landing_keeper_availability_label',
                        'Weekly Availability'
                      )}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {keeperAvailability}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t(
                        'landing_keeper_exp_level_label',
                        'Experience Level & Background'
                      )}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {keeperExperienceLevel}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t(
                        'landing_keeper_tz_label',
                        'Primary Timezone / Region'
                      )}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {keeperTimezone}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t('landing_keeper_handle_label', 'Your Name or Handle')}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {keeperHandle}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t(
                        'landing_keeper_contact_label',
                        'Direct Email or Discord'
                      )}
                    </span>
                    <span className="text-xs font-bold text-[var(--text)]">
                      {keeperContact}
                    </span>
                  </div>
                </div>

                {keeperSkills.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                      {t(
                        'landing_keeper_skills_label',
                        'Technical Stack & Core Domains (Select All That Apply)'
                      )}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {keeperSkills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] font-bold"
                        >
                          <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                            {t('icon_check_circle', 'check_circle')}
                          </span>
                          <span>{skill}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
                    {t(
                      'landing_keeper_exp_label',
                      'Shipped Projects, Technical Background & Relevant Experience (Min 40 chars)'
                    )}
                  </span>
                  <p className="text-xs text-[var(--subtext)] leading-relaxed m-0 whitespace-pre-wrap">
                    {keeperExperience}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_rocket_launch', 'rocket_launch')}
                  label={
                    isSubmittingKeeper
                      ? t('btn_submitting', 'Submitting...')
                      : t(
                          'landing_keeper_submit_btn',
                          'Submit Application to Sanctuary Foundry'
                        )
                  }
                  onClick={handleSubmitKeeperApplication}
                  disabled={isSubmittingKeeper}
                />
              </div>
            </div>
          )}
        </div>
      </SidePanel>
    </>
  );
}

