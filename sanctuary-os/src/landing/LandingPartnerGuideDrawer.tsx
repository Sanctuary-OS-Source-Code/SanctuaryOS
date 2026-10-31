import { useLexicon } from '../LexiconContext';
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
} from '../shared';
import { LegalDocVersionInfoBlock } from '../components/ReleaseNotesShowcase';

export type PartnerGuideStageId = 'what' | 'setup' | 'connect' | 'maintain';

interface LandingPartnerGuideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeStage: PartnerGuideStageId | null;
  setActiveStage: (stage: PartnerGuideStageId | null) => void;
  stableVersion: string;
  onInspectCovenants: () => void;
  onStartPartnerApplication: () => void;
}

export function LandingPartnerGuideDrawer({
  isOpen,
  onClose,
  activeStage,
  setActiveStage,
  stableVersion,
  onInspectCovenants,
  onStartPartnerApplication,
}: LandingPartnerGuideDrawerProps) {
  const { t } = useLexicon();

  const stages: Array<{
    id: PartnerGuideStageId;
    overline: string;
    title: string;
    subtitle: string;
    badge: string;
    icon: string;
    badgeIcon: string;
    items: Array<{
      icon: string;
      title: string;
      desc: string;
    }>;
  }> = [
    {
      id: 'what',
      overline: t('landing_partners_stage_1', 'STAGE 01 • ARCHITECTURE'),
      title: t('landing_partners_tab_what', 'What is a Partner'),
      subtitle: t(
        'landing_partners_tab_what_sub',
        '100% Sovereignty & 0% Tax'
      ),
      badge: t('landing_partners_tab_what_sub', '100% Sovereignty & 0% Tax'),
      icon: t('icon_handshake', 'handshake'),
      badgeIcon: t('icon_verified', 'verified'),
      items: [
        {
          icon: t('icon_dns', 'dns'),
          title: t(
            'landing_partners_what_h1',
            '1. Sovereign Game Workspace — Never a Central Silo'
          ),
          desc: t(
            'landing_partners_what_p1',
            "A Sanctuary OS Partner Spoke is an independent, community-governed game workspace (e.g. Skyrim, GTA V, Stardew Valley, Baldur's Gate 3). Unlike legacy modding portals, your community owns its own Supabase PostgreSQL database, Master Schema, {Mod} registry, and Chameleon themes. Either side can sever the uplink ('Cut the Cord') at any time with zero data loss."
          ),
        },
        {
          icon: t('icon_volunteer_activism', 'volunteer_activism'),
          title: t(
            'landing_partners_what_h2',
            '2. Zero Platform Tax (0% Cut) & Mutual Supporter Perks'
          ),
          desc: t(
            'landing_partners_what_p2',
            'Sanctuary Foundry takes 0% of {Mason} or Partner Community revenue. Partner Spokes link their own non-custodial Stripe, Ko-fi, or Patreon checkout directly in Wayfinder Operations, and every $5 a {Citizen} contributes to a verified Partner Spoke automatically grants them +30 days of Global Dev Build access across Sanctuary OS.'
          ),
        },
        {
          icon: t('icon_admin_panel_settings', 'admin_panel_settings'),
          title: t(
            'landing_partners_what_h3',
            '3. Community-Owned Governance & Roles'
          ),
          desc: t(
            'landing_partners_what_p3',
            "Your Wayfinders and Architects control your workspace's Master Schema, {Mod} verification standards, Chameleon themes, and moderation clearances independently inside your own database."
          ),
        },
        {
          icon: t('icon_devices', 'devices'),
          title: t(
            'landing_partners_what_h4',
            '4. Native Desktop, Web & Mobile PWA Reach'
          ),
          desc: t(
            'landing_partners_what_p4',
            'Connecting a Partner Spoke mounts your game workspace across the Sanctuary OS Desktop Client (Windows & macOS), Web Portal, and Mobile PWA with conflict detection, {Backups}, and {Blueprints}.'
          ),
        },
      ],
    },
    {
      id: 'setup',
      overline: t('landing_partners_stage_2', 'STAGE 02 • PROVISIONING'),
      title: t('landing_partners_tab_setup', 'How to Set Up'),
      subtitle: t('landing_partners_tab_setup_sub', 'Supabase & schema.sql'),
      badge: t('landing_partners_tab_setup_sub', 'Supabase & schema.sql'),
      icon: t('icon_dns', 'dns'),
      badgeIcon: t('icon_terminal', 'terminal'),
      items: [
        {
          icon: t('icon_storage', 'storage'),
          title: t(
            'landing_partners_setup_h1',
            '1. Provision Your Supabase Instance & Run schema.sql'
          ),
          desc: t(
            'landing_partners_setup_p1',
            "Create a dedicated Supabase project owned by your community team. Open the SQL Editor and execute Sanctuary OS's 36-table schema.sql bootstrap script to initialize profiles, {mods}, {mod}_versions, {masons}, {blueprints}, audit_logs, and row-level security (RLS) policies."
          ),
        },
        {
          icon: t('icon_schema', 'schema'),
          title: t(
            'landing_partners_setup_h2',
            "2. Configure Your Game's Master Schema"
          ),
          desc: t(
            'landing_partners_setup_p2',
            "Define your game's supported {Mod} file extensions (.package, .ts4script, .pak, .esp, .rpf, .asi), installation target folders, load-order rules, and conflict radar heuristics inside your Master Schema JSON."
          ),
        },
        {
          icon: t('icon_category', 'category'),
          title: t(
            'landing_partners_setup_h3',
            '3. Seed Categories, Tags & {Vault} Rules'
          ),
          desc: t(
            'landing_partners_setup_p3',
            "Populate your game's categories, subcategories, load-order priority tiers, and {Lab} isolation rules using the built-in Master Schema Studio in Architect Console."
          ),
        },
        {
          icon: t('icon_palette', 'palette'),
          title: t(
            'landing_partners_setup_h4',
            '4. Customize Spoke Aesthetics & {Lexicon}'
          ),
          desc: t(
            'landing_partners_setup_p4',
            "Tailor your workspace's default Chameleon theme, terminology ({Mods}, {Masons}, {Citizens}), and community branding from Wayfinder Operations -> Spoke Aesthetics."
          ),
        },
      ],
    },
    {
      id: 'connect',
      overline: t('landing_partners_stage_3', 'STAGE 03 • UPLINK HANDSHAKE'),
      title: t('landing_partners_tab_connect', 'How to Connect'),
      subtitle: t(
        'landing_partners_tab_connect_sub',
        'SANCTUARY-UPLINK:// Handshake'
      ),
      badge: t(
        'landing_partners_tab_connect_sub',
        'SANCTUARY-UPLINK:// Handshake'
      ),
      icon: t('icon_hub', 'hub'),
      badgeIcon: t('icon_link', 'link'),
      items: [
        {
          icon: t('icon_key', 'key'),
          title: t(
            'landing_partners_connect_h1',
            '1. Generate Your SANCTUARY-UPLINK:// Handshake Token'
          ),
          desc: t(
            'landing_partners_connect_p1',
            'Once your Partner Spoke application is approved by Keepers Core, open Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance to generate your SANCTUARY-UPLINK:// bundle containing your Project URL, Anon Key, and Service Role Key.'
          ),
        },
        {
          icon: t('icon_verified_user', 'verified_user'),
          title: t(
            'landing_partners_connect_h2',
            '2. Cryptographic Verification & Live Hub Mounting'
          ),
          desc: t(
            'landing_partners_connect_p2',
            'Keepers Core runs a live schema and RLS handshake check against your Spoke. Once verified, your workspace goes live on the Sanctuary OS Hub switcher for Desktop, Web, and Mobile PWA {Citizens}.'
          ),
        },
        {
          icon: t('icon_assignment_turned_in', 'assignment_turned_in'),
          title: t(
            'landing_partners_connect_h3',
            '3. Submit Your Partner Spoke Application'
          ),
          desc: t(
            'landing_partners_connect_p3',
            'Complete the 4-step Partner Spoke Readiness Check & Dossier on this page. Human Keepers review your game metadata and Master Schema readiness in Keepers Core.'
          ),
        },
        {
          icon: t('icon_shield_lock', 'shield_lock'),
          title: t(
            'landing_partners_connect_h4',
            '4. Bilateral Threat & Malware Sync'
          ),
          desc: t(
            'landing_partners_connect_p4',
            'Once linked, your Spoke automatically receives global heuristic malware definitions while keeping all community {Mod} records, {Citizens}, and dispatches hosted strictly on your own Supabase instance.'
          ),
        },
      ],
    },
    {
      id: 'maintain',
      overline: t('landing_partners_stage_4', 'STAGE 04 • OPERATIONS'),
      title: t('landing_partners_tab_maintain', 'How to Maintain'),
      subtitle: t(
        'landing_partners_tab_maintain_sub',
        'Wayfinder Operations & Perks'
      ),
      badge: t(
        'landing_partners_tab_maintain_sub',
        'Wayfinder Operations & Perks'
      ),
      icon: t('icon_security', 'security'),
      badgeIcon: t('icon_shield', 'shield'),
      items: [
        {
          icon: t('icon_tune', 'tune'),
          title: t(
            'landing_partners_maintain_h1',
            '1. Wayfinder Operations, Key Rotation & Oversight'
          ),
          desc: t(
            'landing_partners_maintain_p1',
            'Manage your workspace day-to-day from Wayfinder Operations: appoint Architects and Oversight moderators, verify {Masons}, triage community reports, review heuristic malware flags, and rotate your Supabase keys anytime with zero downtime.'
          ),
        },
        {
          icon: t('icon_history_edu', 'history_edu'),
          title: t(
            'landing_partners_maintain_h2',
            '2. Append-Only Audit Integrity & Cut-the-Cord Freedom'
          ),
          desc: t(
            'landing_partners_maintain_p2',
            "Every administrative action is recorded in your Spoke's immutable audit_logs table. If your community ever wishes to operate standalone, click 'Cut the Cord' in Spoke Control to sever the Hub uplink immediately while keeping 100% of your database."
          ),
        },
        {
          icon: t('icon_payments', 'payments'),
          title: t(
            'landing_partners_maintain_h3',
            '3. Non-Custodial Community Donations'
          ),
          desc: t(
            'landing_partners_maintain_p3',
            "Link your community's Stripe, Ko-fi, or Patreon checkout URL in Wayfinder Operations. 100% of funds go directly to your processor (0% platform cut) while automatically crediting {Citizens} +30 days of Dev Builds per $5."
          ),
        },
        {
          icon: t('icon_bolt', 'bolt'),
          title: t(
            'landing_partners_maintain_h4',
            '4. Schema Evolution & Zero-Downtime Updates'
          ),
          desc: t(
            'landing_partners_maintain_p4',
            "Push game patch updates, new {Mod} file format rules, and compatibility alerts directly to your {Citizens}' Desktop and Web clients in real time without waiting on central platform releases."
          ),
        },
      ],
    },
  ];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t(
        'landing_partners_about_drawer_title',
        'Sanctuary OS — Partner Spoke Architecture & Guide'
      )}
      subtitle={t(
        'landing_partners_about_drawer_sub',
        '100% Data Sovereignty • Turnkey Setup • Bilateral Uplink • Governance'
      )}
      icon={t('icon_menu_book', 'menu_book')}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t('icon_gavel', 'gavel')}
            tooltip={t('partner_covenants_open_btn', 'Inspect Covenants')}
            onClick={onInspectCovenants}
          />
          <PanelHeaderButton
            icon={t('icon_rocket_launch', 'rocket_launch')}
            variant="accent"
            tooltip={t(
              'landing_partner_btn_open',
              'Start Partner Spoke Application'
            )}
            onClick={onStartPartnerApplication}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        <SidePanelHeroCard
          icon={t('icon_handshake', 'handshake')}
          overline={t(
            'landing_partners_about_sub',
            'Architecture • Supabase Bootstrap • Uplink Handshake • Governance'
          )}
          title={t(
            'landing_partners_about_title',
            'About Partner Spokes & Setup Guide'
          )}
          description={t(
            'landing_partners_about_desc',
            'Learn what a Sanctuary OS Partner Spoke is, how 100% data sovereignty and 0% non-custodial donations work, and how to provision, connect, and maintain a community game workspace.'
          )}
          badge={`V${stableVersion}`}
          badgeIcon={t('icon_verified', 'verified')}
          variant="accent"
        >
          <LegalDocVersionInfoBlock />
        </SidePanelHeroCard>

        {/* Roadmap Timeline-Like Collapsible Stage Stack */}
        <div className="flex flex-col gap-3.5 w-full">
          {stages.map((stage) => {
            const isExpanded = activeStage === stage.id;
            return (
              <div
                key={stage.id}
                onClick={() => {
                  if (!isExpanded) setActiveStage(stage.id);
                }}
                className={`glass-panel rounded-2xl transition-all duration-300 flex flex-col relative overflow-hidden ${
                  isExpanded
                    ? 'p-5 gap-4 opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]'
                    : 'px-4 py-3.5 opacity-55 hover:opacity-90 !border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_20%,transparent)] group cursor-pointer'
                }`}
              >
                {/* Stage Header Row */}
                <div
                  onClick={(e) => {
                    if (isExpanded) {
                      e.stopPropagation();
                      setActiveStage(null);
                    }
                  }}
                  className={`flex flex-col gap-2.5 w-full ${
                    isExpanded ? 'cursor-pointer group/hdr' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`${
                          isExpanded ? 'w-11 h-11' : 'w-10 h-10'
                        } rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] flex items-center justify-center shrink-0 transition-transform ${
                          !isExpanded ? 'group-hover:scale-105' : ''
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined ${
                            isExpanded
                              ? '!text-[22px] text-[var(--accent)]'
                              : '!text-[19px] text-[var(--text)] opacity-80'
                          }`}
                        >
                          {stage.icon}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-[10px] font-black uppercase tracking-[0.2em] truncate ${
                            isExpanded
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--subtext)]'
                          }`}
                        >
                          {stage.overline}
                        </span>
                        <h3
                          className={`${
                            isExpanded ? 'text-base sm:text-lg' : 'text-sm'
                          } font-black text-[var(--text)] tracking-tight leading-snug truncate`}
                        >
                          {stage.title}
                        </h3>
                        {!isExpanded && (
                          <span className="text-[11px] text-[var(--subtext)] opacity-75 truncate">
                            {stage.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Status Badge + Expand/Collapse Chevron */}
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] text-[10px] font-black uppercase tracking-wider">
                        <span className="material-symbols-outlined !text-[13px] text-[var(--accent)]">
                          {stage.badgeIcon}
                        </span>
                        <span>{stage.badge}</span>
                      </span>

                      <span
                        className={`w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] transition-colors ${
                          isExpanded
                            ? 'group-hover/hdr:text-[var(--text)] group-hover/hdr:border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                            : 'group-hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {isExpanded
                            ? t('icon_expand_less', 'expand_less')
                            : t('icon_expand_more', 'expand_more')}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Stage 2x2 Milestone Grid */}
                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-col gap-3.5 pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] animate-in fade-in duration-200 cursor-default"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {stage.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] transition-all flex flex-col gap-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-outlined !text-[18px] mt-0.5 shrink-0 text-[var(--accent)]">
                              {item.icon}
                            </span>
                            <h4 className="text-xs sm:text-sm font-black text-[var(--text)] leading-snug m-0">
                              {item.title}
                            </h4>
                          </div>
                          <p className="text-xs text-[var(--subtext)] leading-relaxed pl-7 m-0 opacity-90">
                            {item.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SidePanel>
  );
}

