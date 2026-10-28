import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import {
  scrollToLandingSection,
  getActiveLandingTab,
  normalizeLandingTab,
  LandingTabId,
} from './utils/routingUtils';
import WebNewsFeed from './WebNewsFeed';
import WebDocumentFeed from './WebDocumentFeed';
import WebLegalViewer from './WebLegalViewer';
import { fetchSyncedLegalAndCovenants } from './utils/directivesSync';
import {
  handleOpenUrl,
  ViewHeader,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  StatTileCarousel,
} from './shared';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import packageJson from '../package.json';
import { usePwaInstall, isMobileDevice } from './utils/pwaManager';
import {
  getKeepersPipelineConfig,
  getSupporterState,
  buildPartnerCheckoutUrl,
  isSandboxDonationUrl,
  stackGlobalDevBuildDonation,
  presentSupporterCelebrationModal,
  extractCheckoutReceiptNonce,
  getLocalPartnerDonationOverride,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
  hasDevBuildAccessClearance,
  isClientOnDevBuildStream,
  setDevBuildChannelPreference,
} from './utils/supporterManager';
import { scrubLogUserData } from './utils/logScrubber';
import { ReleaseNotesShowcase } from './components/ReleaseNotesShowcase';
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
} from './hub-components/SharedCommandScreenLayout';
import { LandingWorkspaceGrid } from './landing/LandingWorkspaceGrid';
import { LandingDownloadSection } from './landing/LandingDownloadSection';
import { LandingSupportSection } from './landing/LandingSupportSection';
import {
  LandingPartnersSection,
  LandingLegalSection,
} from './landing/LandingPartnersAndLegalSection';
import {
  LandingDonationsSection,
  LandingVerifyDonationDrawer,
} from './landing/LandingDonationsSection';
import {
  LandingPartnerGuideDrawer,
  PartnerGuideStageId,
} from './landing/LandingPartnerGuideDrawer';
import { LandingApplicationDrawers } from './landing/LandingApplicationDrawers';
import { LandingSupportDrawers } from './landing/LandingSupportDrawers';

export default function WebLandingPage() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);
  const setView = useStore((state: any) => state.setView);
  const setIsConfigured = useStore((state: any) => state.setIsConfigured);
  const pushToast = useStore((state: any) => state.pushStatus);
  const [games, setGames] = useState<any[]>([]);
  const [, setNewsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeLandingTab, setActiveLandingTab] = useState<LandingTabId>(() =>
    getActiveLandingTab()
  );
  const [keepersConfig, setKeepersConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );
  const [isDevUnlocked, setIsDevUnlocked] = useState(false);
  const [devBuildUntil, setDevBuildUntil] = useState(0);
  const [pendingWebCheckout, setPendingWebCheckout] = useState<{
    targetId: string;
    targetName: string;
    startedAt: number;
  } | null>(null);
  const [isVerifyDrawerOpen, setIsVerifyDrawerOpen] = useState(false);
  const [verifyReceiptInput, setVerifyReceiptInput] = useState('');
  const [verifyAmountUsd, setVerifyAmountUsd] = useState<number>(5);
  const [isVerifyingDonation, setIsVerifyingDonation] = useState(false);
  const devBuildUntilRef = useRef<number>(0);
  const { isStandalone, triggerInstall } = usePwaInstall();
  const [webDevChannelEnabled, setWebDevChannelEnabled] = useState<boolean>(() =>
    isClientOnDevBuildStream()
  );

  // Official Core Platform Feedback & Bug Support Drawer State (Chat-Like Guided Flow)
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);
  const [feedbackPlatform, setFeedbackPlatform] = useState<
    'Desktop App' | 'Website' | 'Mobile PWA'
  >(isDesktop() ? 'Desktop App' : isStandalone ? 'Mobile PWA' : 'Website');
  const [feedbackStream, setFeedbackStream] = useState<
    | 'Feature Request'
    | 'Public Build Feedback'
    | 'Beta Build Feedback'
    | 'Core Bug Report'
  >('Feature Request');
  const [feedbackSentiment, setFeedbackSentiment] = useState<
    'Positive' | 'Constructive' | 'Critical'
  >('Constructive');
  const [feedbackBugChannel, setFeedbackBugChannel] = useState<
    'Public Build' | 'Beta / Dev Build'
  >(isClientOnDevBuildStream() ? 'Beta / Dev Build' : 'Public Build');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackBody, setFeedbackBody] = useState('');
  const [feedbackDiagnostics, setFeedbackDiagnostics] = useState('');
  const [feedbackAutoLogs, setFeedbackAutoLogs] = useState('');
  const [isEditingAutoTelemetry, setIsEditingAutoTelemetry] = useState(false);
  const [activeFbStep, setActiveFbStep] = useState(0);
  const [maxFbStep, setMaxFbStep] = useState(0);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // My Platform Tickets & Feedback Drawer State
  const [isMyTicketsDrawerOpen, setIsMyTicketsDrawerOpen] = useState(false);
  const [myPlatformTickets, setMyPlatformTickets] = useState<any[]>([]);
  const [selectedMyTicket, setSelectedMyTicket] = useState<any | null>(null);

  // Direct Human Contact Drawer State (Chat-Like Guided Flow)
  const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);
  const [contactChannel, setContactChannel] = useState<
    | 'Direct Contact - General'
    | 'Direct Contact - Legal & Compliance'
    | 'Direct Contact - Security'
  >('Direct Contact - General');
  const [contactReplyTo, setContactReplyTo] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');
  const [activeContactStep, setActiveContactStep] = useState(0);
  const [maxContactStep, setMaxContactStep] = useState(0);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Partner Game Spoke Application Pipeline Drawer State (Chat-Like Guided Flow)
  const [isPartnerDrawerOpen, setIsPartnerDrawerOpen] = useState(false);
  const [partnerGate1, setPartnerGate1] = useState(false);
  const [partnerGate2, setPartnerGate2] = useState(false);
  const [partnerGate3, setPartnerGate3] = useState(false);
  const [partnerGate4, setPartnerGate4] = useState(false);
  const [partnerGameTitle, setPartnerGameTitle] = useState('');
  const [partnerExtensions, setPartnerExtensions] = useState('');
  const [partnerLeadContact, setPartnerLeadContact] = useState('');
  const [partnerCommunityUrl, setPartnerCommunityUrl] = useState('');
  const [partnerTeamSize, setPartnerTeamSize] = useState(
    '2-3 Moderators / Architects'
  );
  const [partnerInfraReadiness, setPartnerInfraReadiness] = useState(
    'Ready to Provision Dedicated Supabase Project'
  );
  const [partnerVision, setPartnerVision] = useState('');
  const [activePartnerStep, setActivePartnerStep] = useState(0);
  const [maxPartnerStep, setMaxPartnerStep] = useState(0);
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);

  // About Partner Spokes & Setup Guide Drawer State (Roadmap Timeline Flow)
  const [isAboutPartnerDrawerOpen, setIsAboutPartnerDrawerOpen] =
    useState(false);
  const [aboutPartnerStage, setAboutPartnerStage] =
    useState<PartnerGuideStageId | null>('what');

  // Apply to Sanctuary Foundry Drawer State (Guided Role Application Flow)
  const [isKeeperAppDrawerOpen, setIsKeeperAppDrawerOpen] = useState(false);
  const [keeperGate1, setKeeperGate1] = useState(false);
  const [keeperGate2, setKeeperGate2] = useState(false);
  const [keeperGate3, setKeeperGate3] = useState(false);
  const [keeperFocus, setKeeperFocus] = useState<string>(
    'Systems & Backend Engineer (Rust / Tauri)'
  );
  const [keeperHandle, setKeeperHandle] = useState('');
  const [keeperContact, setKeeperContact] = useState('');
  const [keeperPortfolio, setKeeperPortfolio] = useState('');
  const [keeperAvailability, setKeeperAvailability] = useState(
    'Part-Time Specialist (5–15 hrs/wk)'
  );
  const [keeperExperienceLevel, setKeeperExperienceLevel] = useState(
    'Mid-Level (2–5 Years Engineering / Security / Modding)'
  );
  const [keeperTimezone, setKeeperTimezone] = useState(
    'Americas (UTC-8 to UTC-3)'
  );
  const [keeperSkills, setKeeperSkills] = useState<string[]>([
    'Rust',
    'TypeScript / React',
  ]);
  const [keeperExperience, setKeeperExperience] = useState('');
  const [keeperMotivation, setKeeperMotivation] = useState('');
  const [activeKeeperStep, setActiveKeeperStep] = useState(0);
  const [maxKeeperStep, setMaxKeeperStep] = useState(0);
  const [isSubmittingKeeper, setIsSubmittingKeeper] = useState(false);

  // Stacked Partner Spoke Covenants Drawer State (2 Tabs: Partners Agreement & Compliance Protocol)
  const [activePartnerCovenant, setActivePartnerCovenant] = useState<
    'PartnersAgreement' | 'ComplianceProtocol' | null
  >(null);
  const [covenantViewMode, setCovenantViewMode] = useState<'ui' | 'normal'>(
    'ui'
  );
  const [reviewedPartnersDoc, setReviewedPartnersDoc] = useState(false);
  const [reviewedComplianceDoc, setReviewedComplianceDoc] = useState(false);
  const [syncedCovenantDocs, setSyncedCovenantDocs] = useState<
    Partial<Awaited<ReturnType<typeof fetchSyncedLegalAndCovenants>>>
  >({});

  useEffect(() => {
    if (!isPartnerDrawerOpen && !activePartnerCovenant) return;
    let cancelled = false;
    fetchSyncedLegalAndCovenants()
      .then((map) => {
        if (!cancelled) {
          setSyncedCovenantDocs({
            PartnersAgreement: map.PartnersAgreement,
            ComplianceProtocol: map.ComplianceProtocol,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isPartnerDrawerOpen, activePartnerCovenant]);

  const autoCapturePlatformDiagnostics = useCallback(async () => {
    const detectedPlatform: 'Desktop App' | 'Website' | 'Mobile PWA' =
      isDesktop() ? 'Desktop App' : isStandalone ? 'Mobile PWA' : 'Website';
    const onDevStream = isClientOnDevBuildStream(devBuildUntilRef.current);
    const detectedChannel: 'Public Build' | 'Beta / Dev Build' = onDevStream
      ? 'Beta / Dev Build'
      : 'Public Build';
    const verLabel = onDevStream
      ? keepersConfig.dev_build_version || `${packageJson.version}-dev`
      : keepersConfig.stable_version || packageJson.version;

    setFeedbackPlatform(detectedPlatform);
    setFeedbackBugChannel(detectedChannel);

    let sysHeader = `Sanctuary OS v${verLabel} (${detectedChannel}) • ${detectedPlatform}`;
    if (isDesktop()) {
      try {
        const rawSys = await invoke<string>('get_system_info');
        if (rawSys) sysHeader = `${sysHeader}\n${rawSys}`;
      } catch {
        // fallback to navigator
      }
    } else if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || 'Browser';
      const viewport =
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight}`
          : 'N/A';
      sysHeader = `${sysHeader} • Viewport ${viewport} • ${ua}`;
    }

    const logEntries = useStore.getState().statusLog || [];
    const formattedLogs = logEntries
      .map(
        (l: any) =>
          `[${new Date(l.timestamp).toISOString()}] [${String(l.type || 'info').toUpperCase()}] ${l.message}`
      )
      .join('\n');

    const fullLogPayload = scrubLogUserData(
      `${sysHeader}\n\n--- RUNTIME TELEMETRY LOGS (${logEntries.length} entries) ---\n${
        formattedLogs || 'No runtime errors recorded in current session.'
      }`
    );

    setFeedbackDiagnostics(sysHeader.split('\n')[0]);
    setFeedbackAutoLogs(fullLogPayload);
  }, [
    isStandalone,
    keepersConfig.dev_build_version,
    keepersConfig.stable_version,
  ]);

  const handleManualLogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        const scrubbed = scrubLogUserData(content);
        setFeedbackAutoLogs((prev) =>
          prev
            ? `${prev}\n\n--- ATTACHED LOG FILE (${file.name}) ---\n${scrubbed}`
            : scrubbed
        );
        pushToast(
          t('support_log_loaded', 'Loaded and scrubbed log file:') +
            ` ${file.name}`,
          'success'
        );
      }
    };
    reader.readAsText(file);
  };

  const fetchMyPlatformTickets = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid || uid === 'local_citizen') {
      setMyPlatformTickets([]);
      return;
    }
    const { data } = await supabaseAuth
      .from('keeper_tickets')
      .select('*')
      .eq('author_id', uid)
      .order('created_at', { ascending: false });
    if (data) setMyPlatformTickets(data);
  }, [session?.user?.id]);

  useEffect(() => {
    fetchMyPlatformTickets();
  }, [fetchMyPlatformTickets]);

  const openFeedbackChannel = (
    platform: 'Desktop App' | 'Website' | 'Mobile PWA',
    stream:
      | 'Feature Request'
      | 'Public Build Feedback'
      | 'Beta Build Feedback'
      | 'Core Bug Report'
  ) => {
    setFeedbackPlatform(platform);
    setFeedbackStream(stream);
    setIsEditingAutoTelemetry(false);
    if (stream === 'Core Bug Report') {
      autoCapturePlatformDiagnostics();
      setActiveFbStep(2);
      setMaxFbStep(2);
    } else {
      setActiveFbStep(0);
      setMaxFbStep(0);
    }
    setIsFeedbackDrawerOpen(true);
  };

  const resetFeedbackFlow = () => {
    setFeedbackPlatform(
      isDesktop() ? 'Desktop App' : isStandalone ? 'Mobile PWA' : 'Website'
    );
    setFeedbackStream('Feature Request');
    setFeedbackSentiment('Constructive');
    setFeedbackBugChannel(
      isClientOnDevBuildStream() ? 'Beta / Dev Build' : 'Public Build'
    );
    setFeedbackTitle('');
    setFeedbackBody('');
    setFeedbackDiagnostics('');
    setFeedbackAutoLogs('');
    setIsEditingAutoTelemetry(false);
    setActiveFbStep(0);
    setMaxFbStep(0);
  };

  const resetContactFlow = () => {
    setContactChannel('Direct Contact - General');
    setContactSubject('');
    setContactBody('');
    setActiveContactStep(0);
    setMaxContactStep(0);
  };

  const resetPartnerFlow = () => {
    setPartnerGate1(false);
    setPartnerGate2(false);
    setPartnerGate3(false);
    setPartnerGate4(false);
    setReviewedPartnersDoc(false);
    setReviewedComplianceDoc(false);
    setActivePartnerCovenant(null);
    setPartnerGameTitle('');
    setPartnerExtensions('');
    setPartnerLeadContact('');
    setPartnerCommunityUrl('');
    setPartnerVision('');
    setActivePartnerStep(0);
    setMaxPartnerStep(0);
  };

  const handleSubmitPlatformFeedback = async () => {
    if (!feedbackTitle.trim() || !feedbackBody.trim()) {
      pushToast(
        t('fill_required_fields', 'Please fill all required fields'),
        'warning'
      );
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen'
          ? session.user.id
          : null;
      const ticketCategory =
        feedbackStream === 'Core Bug Report'
          ? 'Bug Report'
          : `${feedbackPlatform} - ${feedbackStream}`;
      const prefixTag =
        feedbackStream === 'Core Bug Report'
          ? `[Core Bug • ${feedbackPlatform} • ${feedbackBugChannel}]`
          : `[${feedbackPlatform} • ${feedbackStream}]`;

      const combinedLogs =
        feedbackStream === 'Core Bug Report'
          ? [feedbackDiagnostics.trim(), feedbackAutoLogs.trim()]
              .filter(Boolean)
              .join('\n\n')
          : feedbackDiagnostics.trim();

      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: ticketCategory,
        title: `${prefixTag} ${feedbackTitle.trim()}`,
        description: feedbackBody.trim(),
        status: 'NEW',
        metadata: {
          logs: combinedLogs || null,
          feedback_meta: {
            platform: feedbackPlatform,
            stream: feedbackStream,
            sentiment:
              feedbackStream === 'Core Bug Report'
                ? 'Bug Report'
                : feedbackSentiment,
            bug_channel:
              feedbackStream === 'Core Bug Report'
                ? feedbackBugChannel
                : undefined,
            build_version: packageJson.version,
            auto_captured: feedbackStream === 'Core Bug Report',
            author_label:
              session?.user?.user_metadata?.username ||
              session?.user?.email?.split('@')[0] ||
              'Community Member',
          },
        },
      });
      if (error) throw error;
      pushToast(
        t(
          'landing_feedback_toast_success',
          'Dispatched to Keepers Core! Thank you for helping shape Sanctuary OS.'
        ),
        'success'
      );
      resetFeedbackFlow();
      setIsFeedbackDrawerOpen(false);
      fetchMyPlatformTickets();
    } catch (err: any) {
      pushToast(
        err?.message ||
          t(
            'landing_feedback_toast_err',
            'Failed to dispatch feedback. Please try again.'
          ),
        'error'
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSubmitDirectContact = async () => {
    const replyContact = contactReplyTo.trim() || session?.user?.email || '';
    if (!replyContact || !contactSubject.trim() || !contactBody.trim()) {
      pushToast(
        t('fill_required_fields', 'Please fill all required fields'),
        'warning'
      );
      return;
    }
    setIsSubmittingContact(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen'
          ? session.user.id
          : null;
      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: contactChannel,
        title: `[${contactChannel.replace('Direct Contact - ', 'Contact • ')}] ${contactSubject.trim()}`,
        description: `${contactBody.trim()}\n\n---\nReply Contact: ${replyContact}`,
        status: 'NEW',
        metadata: {
          contact_meta: {
            channel: contactChannel,
            reply_contact: replyContact,
            human_review_guaranteed: true,
          },
        },
      });
      if (error) throw error;
      pushToast(
        t(
          'landing_contact_toast_success',
          'Direct inquiry dispatched to the Keepers human review queue.'
        ),
        'success'
      );
      setContactSubject('');
      setContactBody('');
      setIsContactDrawerOpen(false);
      fetchMyPlatformTickets();
    } catch (err: any) {
      pushToast(
        err?.message ||
          t(
            'landing_feedback_toast_err',
            'Failed to dispatch feedback. Please try again.'
          ),
        'error'
      );
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const handleSubmitPartnerApplication = async () => {
    if (!partnerGate1 || !partnerGate2 || !partnerGate3 || !partnerGate4) {
      pushToast(
        t('landing_partner_gate_hdr', 'Step 1: Partner Spoke Readiness Check'),
        'warning'
      );
      return;
    }
    const lastSent = Number(
      localStorage.getItem('sanctuary_partner_app_last_ts') || '0'
    );
    if (Date.now() - lastSent < 10 * 60 * 1000) {
      pushToast(
        t(
          'landing_partner_err_cooldown',
          'A Partner Spoke application was recently submitted from this device. Keepers are reviewing your dossier.'
        ),
        'warning'
      );
      return;
    }
    if (
      !partnerGameTitle.trim() ||
      !partnerExtensions.trim() ||
      !partnerLeadContact.trim() ||
      partnerVision.trim().length < 50
    ) {
      pushToast(
        t('fill_required_fields', 'Please fill all required fields'),
        'warning'
      );
      return;
    }
    setIsSubmittingPartner(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen'
          ? session.user.id
          : null;
      const formattedDossier = [
        `Target Game & Engine: ${partnerGameTitle.trim()}`,
        `Primary Mod File Formats: ${partnerExtensions.trim()}`,
        `Lead Wayfinder & Direct Contact: ${partnerLeadContact.trim()}`,
        `Community / Repository URL: ${partnerCommunityUrl.trim() || 'N/A'}`,
        `Moderation Team Size: ${partnerTeamSize}`,
        `Supabase Infrastructure Readiness: ${partnerInfraReadiness}`,
        ``,
        `Workspace Scope & Governance Plan:`,
        partnerVision.trim(),
      ].join('\n');

      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: 'Partner Spoke Application',
        title: `[Partner Spoke] ${partnerGameTitle.trim()}`,
        description: formattedDossier,
        status: 'NEW',
        metadata: {
          partner_application: {
            game_title: partnerGameTitle.trim(),
            primary_extensions: partnerExtensions.trim(),
            lead_contact: partnerLeadContact.trim(),
            community_url: partnerCommunityUrl.trim(),
            team_size: partnerTeamSize,
            infra_readiness: partnerInfraReadiness,
            vision_summary: partnerVision.trim(),
            readiness_gates_verified: true,
            partners_covenant_accepted: true,
          },
        },
      });
      if (error) throw error;
      localStorage.setItem('sanctuary_partner_app_last_ts', String(Date.now()));
      pushToast(
        t(
          'landing_partner_toast_success',
          'Partner Spoke Dossier transmitted to Keepers Core for architectural review!'
        ),
        'success'
      );
      setPartnerGameTitle('');
      setPartnerExtensions('');
      setPartnerCommunityUrl('');
      setPartnerVision('');
      setIsPartnerDrawerOpen(false);
      fetchMyPlatformTickets();
    } catch (err: any) {
      pushToast(
        err?.message ||
          t(
            'landing_feedback_toast_err',
            'Failed to dispatch feedback. Please try again.'
          ),
        'error'
      );
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  const resetKeeperFlow = () => {
    setKeeperGate1(false);
    setKeeperGate2(false);
    setKeeperGate3(false);
    setKeeperFocus('Systems & Backend Engineer (Rust / Tauri)');
    setKeeperHandle(
      session?.user?.user_metadata?.username ||
        session?.user?.email?.split('@')[0] ||
        ''
    );
    setKeeperContact(session?.user?.email || '');
    setKeeperPortfolio('');
    setKeeperAvailability('Part-Time Specialist (5–15 hrs/wk)');
    setKeeperExperienceLevel(
      'Mid-Level (2–5 Years Engineering / Security / Modding)'
    );
    setKeeperTimezone('Americas (UTC-8 to UTC-3)');
    setKeeperSkills(['Rust', 'TypeScript / React']);
    setKeeperExperience('');
    setKeeperMotivation('');
    setActiveKeeperStep(0);
    setMaxKeeperStep(0);
  };

  const handleSubmitKeeperApplication = async () => {
    if (!keeperGate1 || !keeperGate2 || !keeperGate3) {
      pushToast(
        t(
          'landing_keeper_gate_hdr',
          'Step 1: Open Position, Commitment & Foundry Standards'
        ),
        'warning'
      );
      return;
    }
    const lastSent = Number(
      localStorage.getItem('sanctuary_keeper_app_last_ts') || '0'
    );
    if (Date.now() - lastSent < 10 * 60 * 1000) {
      pushToast(
        t(
          'landing_keeper_err_cooldown',
          'An application to Sanctuary Foundry was recently submitted from this device. Keepers are reviewing your dossier in Keepers Core.'
        ),
        'warning'
      );
      return;
    }
    const finalHandle =
      keeperHandle.trim() ||
      session?.user?.user_metadata?.username ||
      session?.user?.email?.split('@')[0] ||
      '';
    const finalContact = keeperContact.trim() || session?.user?.email || '';
    if (!finalHandle || !finalContact || keeperExperience.trim().length < 40) {
      pushToast(
        t('fill_required_fields', 'Please fill all required fields'),
        'warning'
      );
      return;
    }
    setIsSubmittingKeeper(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen'
          ? session.user.id
          : null;
      const formattedDossier = [
        `Organization: Sanctuary Foundry`,
        `Position Applied For: ${keeperFocus}`,
        `Applicant Name / Handle: ${finalHandle}`,
        `Direct Contact: ${finalContact}`,
        `Weekly Availability: ${keeperAvailability}`,
        `Experience Level: ${keeperExperienceLevel}`,
        `Primary Timezone / Region: ${keeperTimezone}`,
        `Technical Stack & Domains: ${keeperSkills.length > 0 ? keeperSkills.join(', ') : 'None Selected'}`,
        `GitHub / Portfolio / Profile URL: ${keeperPortfolio.trim() || 'N/A'}`,
        ``,
        `Shipped Projects & Technical Background:`,
        keeperExperience.trim(),
        ...(keeperMotivation.trim()
          ? [``, `Role Approach / Why Sanctuary Foundry:`, keeperMotivation.trim()]
          : []),
      ].join('\n');

      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: 'Keeper Application',
        title: `[Sanctuary Foundry Application] ${finalHandle} — ${keeperFocus}`,
        description: formattedDossier,
        status: 'NEW',
        metadata: {
          keeper_application: {
            organization: 'Sanctuary Foundry',
            applicant_handle: finalHandle,
            applicant_contact: finalContact,
            user_id: uid,
            clearance_focus: keeperFocus,
            availability: keeperAvailability,
            experience_level: keeperExperienceLevel,
            timezone: keeperTimezone,
            skills: keeperSkills,
            portfolio_url: keeperPortfolio.trim(),
            experience_summary: keeperExperience.trim(),
            role_motivation: keeperMotivation.trim(),
            covenants_verified: true,
          },
        },
      });
      if (error) throw error;
      localStorage.setItem('sanctuary_keeper_app_last_ts', String(Date.now()));
      pushToast(
        t(
          'landing_keeper_toast_success',
          'Application submitted to Sanctuary Foundry! Keepers will review your dossier inside Keepers Core.'
        ),
        'success'
      );
      setKeeperExperience('');
      setKeeperMotivation('');
      setKeeperPortfolio('');
      setIsKeeperAppDrawerOpen(false);
      fetchMyPlatformTickets();
    } catch (err: any) {
      pushToast(
        err?.message ||
          t(
            'landing_feedback_toast_err',
            'Failed to dispatch feedback. Please try again.'
          ),
        'error'
      );
    } finally {
      setIsSubmittingKeeper(false);
    }
  };

  const refreshSupporterStatus = useCallback(async () => {
    const uid = session?.user?.id;
    const staffClearance = hasDevBuildAccessClearance();
    if (!uid || uid === 'local_citizen') {
      devBuildUntilRef.current = 0;
      setDevBuildUntil(0);
      setIsDevUnlocked(staffClearance);
      setWebDevChannelEnabled(isClientOnDevBuildStream(0));
      return;
    }
    const supState = await getSupporterState('web', uid);
    const until = supState?.dev_build?.dev_build_until || 0;
    const nowSecs = Math.floor(Date.now() / 1000);
    const unlocked = until > nowSecs || staffClearance;
    if (
      devBuildUntilRef.current > 0 &&
      until > devBuildUntilRef.current
    ) {
      const diffDays = Math.max(
        30,
        Math.round(
          (until - Math.max(nowSecs, devBuildUntilRef.current)) / 86400
        )
      );
      const monthsAdded = Math.max(1, Math.round(diffDays / 30));
      presentSupporterCelebrationModal({
        devBuildUntil: until,
        monthsAdded,
        t,
      });
      setPendingWebCheckout(null);
      setIsVerifyDrawerOpen(false);
    }
    devBuildUntilRef.current = until;
    setDevBuildUntil(until);
    setIsDevUnlocked(unlocked);
    setWebDevChannelEnabled(
      Boolean(supState?.dev_build?.channel_enabled && unlocked)
    );
  }, [session?.user?.id, t]);

  const handleToggleWebDevStream = async (nextVal: boolean) => {
    if (nextVal && !isDevUnlocked && !hasDevBuildAccessClearance()) {
      pushToast(
        t(
          'supporter_web_stream_locked_toast',
          'Unlock Global Daily Dev Builds ($5 = +30 days) or sign in with Staff clearance to switch Website & Mobile PWA to the Beta / Dev Build Stream.'
        ),
        'warning'
      );
      scrollToLandingSection('donations');
      return;
    }
    await setDevBuildChannelPreference(nextVal, session?.user?.id);
    setWebDevChannelEnabled(nextVal);
    setFeedbackBugChannel(nextVal ? 'Beta / Dev Build' : 'Public Build');
    pushToast(
      nextVal
        ? t(
            'supporter_web_stream_switched_beta',
            'Website & Mobile PWA switched to the Beta / Dev Build Stream!'
          )
        : t(
            'supporter_web_stream_switched_public',
            'Website & Mobile PWA switched to the Public Build Stream.'
          ),
      'success'
    );
  };

  useEffect(() => {
    const fetchGames = async () => {
      const [{ data }, pipelineCfg, newsRes] = await Promise.all([
        supabase
          .from('sanctuary_games')
          .select(
            'id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor'
          ),
        getKeepersPipelineConfig(),
        supabaseAuth
          .from('system_broadcasts')
          .select('id', { count: 'exact', head: true })
          .in('category', [
            'Announcement',
            'Blog',
            'Press',
            'Update',
            'Maintenance',
            'Info',
            'Event',
          ])
          .ilike('target_audience', '%Public%'),
      ]);
      if (typeof newsRes?.count === 'number') {
        setNewsCount(newsRes.count);
      }
      if (data) {
        const merged = data.map((g: any) => {
          const override =
            getLocalPartnerDonationOverride(g.schema_id) ||
            getLocalPartnerDonationOverride(g.id);
          return {
            ...g,
            donation_url:
              override?.donation_url !== undefined
                ? override.donation_url
                : g.donation_url,
            payment_processor:
              override?.payment_processor || g.payment_processor || 'STRIPE',
          };
        });
        setGames(merged);
      }
      if (pipelineCfg) setKeepersConfig(pipelineCfg);
      await refreshSupporterStatus();
      setLoading(false);
    };
    fetchGames();
  }, [session?.user?.id, refreshSupporterStatus]);

  useEffect(() => {
    const handleSupporterUpdated = () => {
      refreshSupporterStatus();
    };
    const handleWindowFocus = () => {
      if (session?.user?.id) {
        refreshSupporterStatus();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session?.user?.id) {
        refreshSupporterStatus();
      }
    };
    window.addEventListener(
      'sanctuary-supporter-updated',
      handleSupporterUpdated
    );
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener(
        'sanctuary-supporter-updated',
        handleSupporterUpdated
      );
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.user?.id, refreshSupporterStatus]);

  useEffect(() => {
    if (!pendingWebCheckout || !session?.user?.id) return;
    const pollInterval = setInterval(() => {
      refreshSupporterStatus();
    }, 4000);
    return () => clearInterval(pollInterval);
  }, [pendingWebCheckout, session?.user?.id, refreshSupporterStatus]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sessionIdParam =
        params.get('session_id') || params.get('checkout_session_id');
      if (sessionIdParam && sessionIdParam.startsWith('cs_')) {
        setVerifyReceiptInput(sessionIdParam);
        setPendingWebCheckout({
          targetId: 'keepers_core',
          targetName: t(
            'supporter_keepers_title',
            'Sanctuary OS (Keepers Core)'
          ),
          startedAt: Date.now(),
        });
        setIsVerifyDrawerOpen(true);
      }
    } catch {
      // ignore URL parse error
    }
  }, [t]);

  const handleDonateCardClick = async (
    targetId: string,
    targetName: string,
    rawDonationUrl?: string
  ) => {
    const cleanUrl = (rawDonationUrl || '').trim();
    if (!cleanUrl) return;

    if (isSandboxDonationUrl(cleanUrl)) {
      if (!session?.user?.id) {
        pushToast(
          t(
            'supporter_auth_required_for_dev_builds',
            'Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.'
          ),
          'warning'
        );
        return;
      }
      try {
        const res = await stackGlobalDevBuildDonation({
          amountUsd: 5,
          txNonce: `sandbox_${targetId}_${Date.now()}`,
        });
        devBuildUntilRef.current = res.devBuild.dev_build_until;
        setDevBuildUntil(res.devBuild.dev_build_until);
        setIsDevUnlocked(
          res.devBuild.dev_build_until > Math.floor(Date.now() / 1000)
        );
        presentSupporterCelebrationModal({
          devBuildUntil: res.devBuild.dev_build_until,
          monthsAdded: Math.max(1, res.monthsAdded || 1),
          t,
        });
      } catch (err: any) {
        pushToast(
          err?.message ||
            t('supporter_err_stack', 'Failed to stack donation.'),
          'error'
        );
      }
      return;
    }

    const checkoutUrl = buildPartnerCheckoutUrl(
      cleanUrl,
      session?.user?.id,
      session?.user?.email
    );

    handleOpenUrl(checkoutUrl);

    if (!isDesktop()) {
      setPendingWebCheckout({
        targetId,
        targetName,
        startedAt: Date.now(),
      });
      if (!session?.user?.id) {
        pushToast(
          t(
            'supporter_guest_checkout_notice',
            'Checkout opened! Sign in to Sanctuary OS or use your account email at checkout so your +30 days of Dev Builds per $5 link to your account.'
          ),
          'info'
        );
      }
    }
  };

  const handleVerifyWebDonation = async () => {
    if (!session?.user?.id) {
      pushToast(
        t(
          'supporter_auth_required_for_dev_builds',
          'Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.'
        ),
        'warning'
      );
      return;
    }
    const nonce = extractCheckoutReceiptNonce(verifyReceiptInput);
    if (!nonce || nonce.length < 4) {
      pushToast(
        t(
          'supporter_web_receipt_ph',
          'Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...'
        ),
        'warning'
      );
      return;
    }

    setIsVerifyingDonation(true);
    try {
      const res = await stackGlobalDevBuildDonation({
        amountUsd: Math.max(1, Number(verifyAmountUsd || 5)),
        txNonce: nonce,
      });
      devBuildUntilRef.current = res.devBuild.dev_build_until;
      setDevBuildUntil(res.devBuild.dev_build_until);
      setIsDevUnlocked(
        res.devBuild.dev_build_until > Math.floor(Date.now() / 1000)
      );
      setVerifyReceiptInput('');
      setPendingWebCheckout(null);
      setIsVerifyDrawerOpen(false);
      presentSupporterCelebrationModal({
        devBuildUntil: res.devBuild.dev_build_until,
        monthsAdded: Math.max(1, res.monthsAdded || 1),
        t,
      });
    } catch (err: any) {
      pushToast(
        err?.message || t('supporter_err_stack', 'Failed to stack donation.'),
        'error'
      );
    } finally {
      setIsVerifyingDonation(false);
    }
  };

  const stableVersion = (
    keepersConfig.stable_version ||
    packageJson.version.split('-')[0] ||
    packageJson.version
  )
    .replace(/^v/i, '')
    .trim();

  useEffect(() => {
    const handleInitialHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (
        [
          'overview',
          'workspaces',
          'news',
          'sanctuary_foundry_news',
          'release_notes',
          'directives',
          'system_directives',
          'download',
          'support',
          'feedback',
          'contact',
          'partners',
          'partner_spokes',
          'legal',
          'donations',
          'donate',
        ].includes(hash)
      ) {
        setActiveLandingTab(normalizeLandingTab(hash));
        setTimeout(() => scrollToLandingSection(hash), 80);
      }
    };
    const handleLandingTabEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const raw =
        typeof detail === 'string'
          ? detail
          : detail?.tab || detail?.sectionId;
      if (raw) {
        setActiveLandingTab(normalizeLandingTab(raw));
      }
    };
    handleInitialHash();
    window.addEventListener('hashchange', handleInitialHash);
    window.addEventListener(
      'sanctuary-landing-tab',
      handleLandingTabEvent as EventListener
    );
    const handleAgreeCovenants = () => {
      setPartnerGate4(true);
    };
    window.addEventListener('agree_partner_covenants', handleAgreeCovenants);
    return () => {
      window.removeEventListener('hashchange', handleInitialHash);
      window.removeEventListener(
        'sanctuary-landing-tab',
        handleLandingTabEvent as EventListener
      );
      window.removeEventListener(
        'agree_partner_covenants',
        handleAgreeCovenants
      );
    };
  }, []);

  const navigateToGame = async (gameId: string) => {
    if (isDesktop()) {
      if (gameId === activeWorkspaceId) {
        setIsConfigured(true);
        setView('dashboard');
        return;
      }
      try {
        const globalConfig: any = await invoke('get_global_config');
        globalConfig.active_workspace_id = gameId;
        if (Array.isArray(globalConfig.workspaces)) {
          const existsInConfig = globalConfig.workspaces.some(
            (w: any) =>
              String(w.id || '').toLowerCase() ===
                String(gameId || '').toLowerCase() ||
              String(w.schema_id || '').toLowerCase() ===
                String(gameId || '').toLowerCase()
          );
          if (!existsInConfig) {
            const matchedGame = games.find(
              (g: any) =>
                String(g.schema_id || '').toLowerCase() ===
                  String(gameId || '').toLowerCase() ||
                String(g.id || '').toLowerCase() ===
                  String(gameId || '').toLowerCase()
            );
            const targetSchema = matchedGame?.schema_id || gameId;
            const masterVault = globalConfig.vault_path || '';
            globalConfig.workspaces.push({
              id: gameId,
              name: matchedGame?.name || gameId,
              schema_id: targetSchema,
              live_path: '',
              mods_path: '',
              vault_path: masterVault ? `${masterVault}\\${targetSchema}` : '',
              supabase_url: matchedGame?.supabase_url || null,
              supabase_anon_key: matchedGame?.supabase_anon_key || null,
            });
          }
        }
        await invoke('save_coordinates', { config: globalConfig });
        localStorage.setItem('sanctuary_last_active_workspace', gameId);
        setIsConfigured(true);
        setView('dashboard');
        setTimeout(() => window.location.reload(), 10);
      } catch (err) {
        console.error('Failed to swap workspace on desktop:', err);
      }
    } else {
      const host = window.location.host;
      const protocol = window.location.protocol;
      window.location.href = `${protocol}//${host}/${gameId}`;
    }
  };

  const pinnedWorkspaces = [...games]
    .sort((a, b) => {
      const aActive = isDesktop() && a.schema_id === activeWorkspaceId ? 1 : 0;
      const bActive = isDesktop() && b.schema_id === activeWorkspaceId ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aConfigured = (workspaces || []).some(
        (w: any) =>
          (w.schema_id === a.schema_id || w.id === a.schema_id) &&
          (w.mods_path || w.live_path || w.vault_path)
      )
        ? 1
        : 0;
      const bConfigured = (workspaces || []).some(
        (w: any) =>
          (w.schema_id === b.schema_id || w.id === b.schema_id) &&
          (w.mods_path || w.live_path || w.vault_path)
      )
        ? 1
        : 0;
      return bConfigured - aConfigured;
    })
    .slice(0, 6);

  const landingTabLabels: Record<LandingTabId, string> = {
    overview: t('overview', 'Overview'),
    workspaces: t('landing_workspaces', 'Active Workspaces'),
    news: t('landing_news', 'Sanctuary Foundry News'),
    directives: t('landing_system_directives', 'Public Documents'),
    download: t('landing_download_sidebar', 'Download Sanctuary OS'),
    support: t('landing_nav_feedback', 'Feedback & Support'),
    partners: t('landing_partners_tab', 'Partner Spokes'),
    legal: t('landing_legal_tab', 'Legal'),
    donations: t('wf_tab_donations', 'Donations'),
  };

  return (
    <div className="w-full flex flex-col items-center justify-start relative pt-0 px-0 pb-0">
      <CommandScreenLayout className="w-full">
        <ViewHeader
          title={t('landing_welcome', 'Welcome to Sanctuary OS')}
          subtitle={t(
            'landing_subtitle',
            'Your centralized hub for community-driven game modifications, {blueprints}, and assets. Select a workspace below to enter.'
          )}
          icon={t('icon_shield', 'shield')}
          breadcrumb={
            activeLandingTab !== 'overview'
              ? landingTabLabels[activeLandingTab]
              : undefined
          }
          onTitleClick={() => scrollToLandingSection('overview')}
        />

        {/* Clean Icon + Label StatTileCarousel (No Numbers, Matching System Preferences) */}
        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t('icon_dashboard', 'dashboard')}
            label={t('overview', 'Overview')}
            isActive={activeLandingTab === 'overview'}
            onClick={() => scrollToLandingSection('overview')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_public', 'public')}
            label={t('landing_workspaces', 'Active Workspaces')}
            isActive={activeLandingTab === 'workspaces'}
            onClick={() => scrollToLandingSection('workspaces')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_newspaper', 'newspaper')}
            label={t('landing_news_short', 'News')}
            isActive={activeLandingTab === 'news'}
            onClick={() => scrollToLandingSection('news')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_folder_special', 'folder_special')}
            label={t('landing_directives_short', 'Directives')}
            isActive={activeLandingTab === 'directives'}
            onClick={() => scrollToLandingSection('directives')}
          />
          {!isDesktop() && (
            <DashboardStatTile
              variant="tab"
              icon={t('icon_system_update_alt', 'system_update_alt')}
              label={t('landing_download_sidebar', 'Download Sanctuary OS')}
              isActive={activeLandingTab === 'download'}
              onClick={() => scrollToLandingSection('download')}
            />
          )}
          <DashboardStatTile
            variant="tab"
            icon={t('icon_support_agent', 'support_agent')}
            label={t('landing_nav_feedback', 'Feedback & Support')}
            isActive={activeLandingTab === 'support'}
            onClick={() => scrollToLandingSection('support')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_handshake', 'handshake')}
            label={t('landing_partners_tab', 'Partner Spokes')}
            isActive={activeLandingTab === 'partners'}
            onClick={() => scrollToLandingSection('partners')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_gavel', 'gavel')}
            label={t('landing_legal_tab', 'Legal')}
            isActive={activeLandingTab === 'legal'}
            onClick={() => scrollToLandingSection('legal')}
          />
          <DashboardStatTile
            variant="tab"
            icon={t('icon_volunteer_activism', 'volunteer_activism')}
            label={t('wf_tab_donations', 'Donations')}
            isActive={activeLandingTab === 'donations'}
            onClick={() => scrollToLandingSection('donations')}
          />
        </StatTileCarousel>

        {/* TAB 1: OVERVIEW */}
        {activeLandingTab === 'overview' && (
          <CommandScreenBody>
            <CommandScreenMain>
              <section id="workspaces" className="flex flex-col gap-6">
                <CommandScreenSectionHeading
                  title={t('landing_workspaces', 'Active Workspaces')}
                  icon={t('icon_public', 'public')}
                  rightSlot={
                    games.length > 0 ? (
                      <PanelHeaderGroup>
                        <PanelHeaderButton
                          icon={t('icon_arrow_forward', 'arrow_forward')}
                          tooltip={`${t('all', 'All')} (${games.length})`}
                          onClick={() => scrollToLandingSection('workspaces')}
                        />
                      </PanelHeaderGroup>
                    ) : undefined
                  }
                />
                <div className="w-full">
                  <LandingWorkspaceGrid
                    list={pinnedWorkspaces}
                    loading={loading}
                    activeWorkspaceId={activeWorkspaceId}
                    workspaces={workspaces}
                    onNavigateToGame={navigateToGame}
                  />
                </div>
              </section>

              <section id="news" className="flex flex-col gap-6">
                <CommandScreenSectionHeading
                  title={t('landing_news', 'Sanctuary Foundry News')}
                  icon={t('icon_campaign', 'campaign')}
                  rightSlot={
                    <PanelHeaderGroup>
                      <PanelHeaderButton
                        icon={t('icon_arrow_forward', 'arrow_forward')}
                        tooltip={t('landing_news_short', 'News')}
                        onClick={() => scrollToLandingSection('news')}
                      />
                    </PanelHeaderGroup>
                  }
                />
                <div className="w-full">
                  <WebNewsFeed limit={3} onCountChange={setNewsCount} />
                </div>
              </section>

              <section id="release_notes" className="flex flex-col gap-6">
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
                      ? keepersConfig.dev_build_version ||
                        `${stableVersion}-dev`
                      : stableVersion
                  }
                />
              </section>
            </CommandScreenMain>

            <CommandScreenSidebar
              title={t('wf_quick_links', 'Quick Links')}
              icon={t('icon_bolt', 'bolt')}
            >
              <CommandScreenQuickLink
                icon={t('icon_public', 'public')}
                title={t('landing_workspaces', 'Active Workspaces')}
                subtitle={`${games.length} ${t('workspace_card_overline', 'Game Workspace')}`}
                onClick={() => scrollToLandingSection('workspaces')}
              />
              {!isDesktop() && (
                <CommandScreenQuickLink
                  icon={t('icon_system_update_alt', 'system_update_alt')}
                  title={t('landing_download_sidebar', 'Download Sanctuary OS')}
                  subtitle={
                    isStandalone || isMobileDevice()
                      ? isStandalone
                        ? t(
                            'landing_web_stream_banner_top',
                            'Website & Mobile PWA • Build Stream'
                          )
                        : t(
                            'pwa_install_subtitle',
                            'Progressive Web App (iOS / Android / Web)'
                          )
                      : `${t('landing_win_exe', 'Windows (.exe)')} • ${t('landing_mac_dmg', 'macOS (.dmg)')} • PWA`
                  }
                  onClick={() => scrollToLandingSection('download')}
                />
              )}
              <CommandScreenQuickLink
                icon={t('icon_folder_special', 'folder_special')}
                title={t('landing_system_directives', 'Public Documents')}
                subtitle={t(
                  'lex_studio_nav_landing_title',
                  'Public Landing & System Directives'
                )}
                onClick={() => scrollToLandingSection('directives')}
              />
              <CommandScreenQuickLink
                icon={t('icon_volunteer_activism', 'volunteer_activism')}
                title={t(
                  'landing_support_section_title',
                  'Support Sanctuary OS & Partner Communities'
                )}
                subtitle={t(
                  'landing_support_card_badge',
                  '0% Platform Fee • +30 Days Dev Builds Per $5'
                )}
                onClick={() => scrollToLandingSection('donations')}
              />
              <CommandScreenQuickLink
                icon={t('icon_rate_review', 'rate_review')}
                title={t(
                  'landing_feedback_section_title',
                  'Platform Feedback & Core Support'
                )}
                subtitle={t(
                  'landing_feedback_card_sub',
                  'Desktop App • Website • Mobile PWA'
                )}
                onClick={() => scrollToLandingSection('feedback')}
              />
              <CommandScreenQuickLink
                icon={t('icon_handshake', 'handshake')}
                title={t('landing_partners_tab', 'Partner Spokes')}
                subtitle={t(
                  'landing_banner_partner_bottom',
                  'Community Workspace Operators • 0% Platform Fee'
                )}
                onClick={() => scrollToLandingSection('partners')}
              />
              <CommandScreenQuickLink
                icon={t('icon_gavel', 'gavel')}
                title={t('landing_legal_tab', 'Legal')}
                subtitle={`${t('landing_terms', 'Terms of Service')} • ${t('landing_privacy', 'Privacy Protocol')}`}
                onClick={() => scrollToLandingSection('legal')}
              />
            </CommandScreenSidebar>
          </CommandScreenBody>
        )}

        {/* TAB 2: WORKSPACES */}
        {activeLandingTab === 'workspaces' && (
          <div className="w-full flex flex-col gap-10">
            <section id="workspaces" className="flex flex-col gap-6">
              <CommandScreenSectionHeading
                title={t('landing_workspaces', 'Active Workspaces')}
                icon={t('icon_public', 'public')}
              />
              <div className="w-full">
                <LandingWorkspaceGrid
                  list={games}
                  loading={loading}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaces={workspaces}
                  onNavigateToGame={navigateToGame}
                />
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: NEWS */}
        {activeLandingTab === 'news' && (
          <div className="w-full flex flex-col gap-10">
            <section id="news" className="flex flex-col gap-6 scroll-mt-24">
              <div id="sanctuary_foundry_news" className="hidden" />
              <CommandScreenSectionHeading
                title={t('landing_news', 'Sanctuary Foundry News')}
                icon={t('icon_campaign', 'campaign')}
              />
              <div className="w-full">
                <WebNewsFeed limit={12} onCountChange={setNewsCount} />
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: DIRECTIVES */}
        {activeLandingTab === 'directives' && (
          <section
            id="system_directives"
            className="w-full flex flex-col gap-6 scroll-mt-24"
          >
            <CommandScreenSectionHeading
              title={t('landing_system_directives', 'Public Documents')}
              icon={t('icon_folder_special', 'folder_special')}
            />
            <div className="w-full">
              <WebDocumentFeed />
            </div>
          </section>
        )}

        {/* TAB 5: DOWNLOAD LINKS */}
        {!isDesktop() && activeLandingTab === 'download' && (
          <LandingDownloadSection
            isStandalone={isStandalone}
            triggerInstall={triggerInstall}
            webDevChannelEnabled={webDevChannelEnabled}
            onToggleWebDevStream={handleToggleWebDevStream}
            keepersConfig={keepersConfig}
            stableVersion={stableVersion}
            isDevUnlocked={isDevUnlocked}
            hasUserSession={Boolean(session?.user?.id)}
          />
        )}

        {/* TAB 6: FEEDBACK & SUPPORT */}
        {activeLandingTab === 'support' && (
          <LandingSupportSection
            hasAuthenticatedCitizen={Boolean(
              session?.user?.id && session.user.id !== 'local_citizen'
            )}
            myTicketsCount={myPlatformTickets.length}
            onOpenMyTickets={() => {
              fetchMyPlatformTickets();
              setIsMyTicketsDrawerOpen(true);
            }}
            onOpenFeedbackChannel={openFeedbackChannel}
            onOpenDirectContact={() => {
              setContactChannel('Direct Contact - General');
              setActiveContactStep(0);
              setMaxContactStep(0);
              setIsContactDrawerOpen(true);
            }}
            onOpenKeeperApplication={() => {
              resetKeeperFlow();
              setIsKeeperAppDrawerOpen(true);
            }}
          />
        )}

        {/* TAB 7: PARTNER SPOKES */}
        {activeLandingTab === 'partners' && (
          <LandingPartnersSection
            stableVersion={stableVersion}
            onOpenPartnerGuide={() => {
              setAboutPartnerStage('what');
              setIsAboutPartnerDrawerOpen(true);
            }}
            onOpenPartnerApplication={() => {
              setActivePartnerStep(0);
              setMaxPartnerStep(0);
              setIsPartnerDrawerOpen(true);
            }}
            onOpenPartnerCovenants={() =>
              setActivePartnerCovenant('PartnersAgreement')
            }
          />
        )}

        {/* TAB 8: LEGAL */}
        {activeLandingTab === 'legal' && <LandingLegalSection />}

        {/* TAB 9: DONATIONS */}
        {activeLandingTab === 'donations' && (
          <LandingDonationsSection
            hasUserSession={Boolean(session?.user?.id)}
            pendingWebCheckout={pendingWebCheckout}
            keepersConfig={keepersConfig}
            games={games}
            onOpenVerifyDrawer={() => setIsVerifyDrawerOpen(true)}
            onNavigateAuth={() => setView('auth')}
            onDonateCardClick={handleDonateCardClick}
          />
        )}

        {/* DRAWER 1 & 2 & 4: FEEDBACK, DIRECT CONTACT & MY PLATFORM TICKETS */}
        <LandingSupportDrawers
          isFeedbackDrawerOpen={isFeedbackDrawerOpen}
          setIsFeedbackDrawerOpen={setIsFeedbackDrawerOpen}
          resetFeedbackFlow={resetFeedbackFlow}
          isSubmittingFeedback={isSubmittingFeedback}
          handleSubmitPlatformFeedback={handleSubmitPlatformFeedback}
          feedbackPlatform={feedbackPlatform}
          setFeedbackPlatform={setFeedbackPlatform}
          feedbackStream={feedbackStream}
          setFeedbackStream={setFeedbackStream}
          feedbackSentiment={feedbackSentiment}
          setFeedbackSentiment={setFeedbackSentiment}
          feedbackBugChannel={feedbackBugChannel}
          setFeedbackBugChannel={setFeedbackBugChannel}
          feedbackTitle={feedbackTitle}
          setFeedbackTitle={setFeedbackTitle}
          feedbackBody={feedbackBody}
          setFeedbackBody={setFeedbackBody}
          feedbackDiagnostics={feedbackDiagnostics}
          setFeedbackDiagnostics={setFeedbackDiagnostics}
          feedbackAutoLogs={feedbackAutoLogs}
          setFeedbackAutoLogs={setFeedbackAutoLogs}
          isEditingAutoTelemetry={isEditingAutoTelemetry}
          setIsEditingAutoTelemetry={setIsEditingAutoTelemetry}
          activeFbStep={activeFbStep}
          setActiveFbStep={setActiveFbStep}
          maxFbStep={maxFbStep}
          setMaxFbStep={setMaxFbStep}
          autoCapturePlatformDiagnostics={autoCapturePlatformDiagnostics}
          handleManualLogUpload={handleManualLogUpload}
          isContactDrawerOpen={isContactDrawerOpen}
          setIsContactDrawerOpen={setIsContactDrawerOpen}
          resetContactFlow={resetContactFlow}
          isSubmittingContact={isSubmittingContact}
          handleSubmitDirectContact={handleSubmitDirectContact}
          contactChannel={contactChannel}
          setContactChannel={setContactChannel}
          contactReplyTo={contactReplyTo}
          setContactReplyTo={setContactReplyTo}
          contactSubject={contactSubject}
          setContactSubject={setContactSubject}
          contactBody={contactBody}
          setContactBody={setContactBody}
          activeContactStep={activeContactStep}
          setActiveContactStep={setActiveContactStep}
          maxContactStep={maxContactStep}
          setMaxContactStep={setMaxContactStep}
          sessionEmail={session?.user?.email}
          isMyTicketsDrawerOpen={isMyTicketsDrawerOpen}
          setIsMyTicketsDrawerOpen={setIsMyTicketsDrawerOpen}
          myPlatformTickets={myPlatformTickets}
          selectedMyTicket={selectedMyTicket}
          setSelectedMyTicket={setSelectedMyTicket}
          fetchMyPlatformTickets={fetchMyPlatformTickets}
        />

        {/* DRAWER 3, 3B & 3D: PARTNER APPLICATION, STACKED COVENANTS & KEEPER APPLICATION */}
        <LandingApplicationDrawers
          isPartnerDrawerOpen={isPartnerDrawerOpen}
          setIsPartnerDrawerOpen={setIsPartnerDrawerOpen}
          resetPartnerFlow={resetPartnerFlow}
          isSubmittingPartner={isSubmittingPartner}
          handleSubmitPartnerApplication={handleSubmitPartnerApplication}
          partnerGate1={partnerGate1}
          setPartnerGate1={setPartnerGate1}
          partnerGate2={partnerGate2}
          setPartnerGate2={setPartnerGate2}
          partnerGate3={partnerGate3}
          setPartnerGate3={setPartnerGate3}
          partnerGate4={partnerGate4}
          setPartnerGate4={setPartnerGate4}
          reviewedPartnersDoc={reviewedPartnersDoc}
          setReviewedPartnersDoc={setReviewedPartnersDoc}
          reviewedComplianceDoc={reviewedComplianceDoc}
          setReviewedComplianceDoc={setReviewedComplianceDoc}
          partnerGameTitle={partnerGameTitle}
          setPartnerGameTitle={setPartnerGameTitle}
          partnerExtensions={partnerExtensions}
          setPartnerExtensions={setPartnerExtensions}
          partnerLeadContact={partnerLeadContact}
          setPartnerLeadContact={setPartnerLeadContact}
          partnerCommunityUrl={partnerCommunityUrl}
          setPartnerCommunityUrl={setPartnerCommunityUrl}
          partnerTeamSize={partnerTeamSize}
          setPartnerTeamSize={setPartnerTeamSize}
          partnerInfraReadiness={partnerInfraReadiness}
          setPartnerInfraReadiness={setPartnerInfraReadiness}
          partnerVision={partnerVision}
          setPartnerVision={setPartnerVision}
          activePartnerStep={activePartnerStep}
          setActivePartnerStep={setActivePartnerStep}
          maxPartnerStep={maxPartnerStep}
          setMaxPartnerStep={setMaxPartnerStep}
          activePartnerCovenant={activePartnerCovenant}
          setActivePartnerCovenant={setActivePartnerCovenant}
          covenantViewMode={covenantViewMode}
          setCovenantViewMode={setCovenantViewMode}
          syncedCovenantDocs={syncedCovenantDocs}
          stableVersion={stableVersion}
          isKeeperAppDrawerOpen={isKeeperAppDrawerOpen}
          setIsKeeperAppDrawerOpen={setIsKeeperAppDrawerOpen}
          resetKeeperFlow={resetKeeperFlow}
          isSubmittingKeeper={isSubmittingKeeper}
          handleSubmitKeeperApplication={handleSubmitKeeperApplication}
          keeperGate1={keeperGate1}
          setKeeperGate1={setKeeperGate1}
          keeperGate2={keeperGate2}
          setKeeperGate2={setKeeperGate2}
          keeperGate3={keeperGate3}
          setKeeperGate3={setKeeperGate3}
          keeperFocus={keeperFocus}
          setKeeperFocus={setKeeperFocus}
          keeperHandle={keeperHandle}
          setKeeperHandle={setKeeperHandle}
          keeperContact={keeperContact}
          setKeeperContact={setKeeperContact}
          keeperPortfolio={keeperPortfolio}
          setKeeperPortfolio={setKeeperPortfolio}
          keeperAvailability={keeperAvailability}
          setKeeperAvailability={setKeeperAvailability}
          keeperExperienceLevel={keeperExperienceLevel}
          setKeeperExperienceLevel={setKeeperExperienceLevel}
          keeperTimezone={keeperTimezone}
          setKeeperTimezone={setKeeperTimezone}
          keeperSkills={keeperSkills}
          setKeeperSkills={setKeeperSkills}
          keeperExperience={keeperExperience}
          setKeeperExperience={setKeeperExperience}
          keeperMotivation={keeperMotivation}
          setKeeperMotivation={setKeeperMotivation}
          activeKeeperStep={activeKeeperStep}
          setActiveKeeperStep={setActiveKeeperStep}
          maxKeeperStep={maxKeeperStep}
          setMaxKeeperStep={setMaxKeeperStep}
          sessionEmail={session?.user?.email}
        />

        {/* DRAWER 3C: ABOUT PARTNER SPOKES & SETUP GUIDE (ROADMAP TIMELINE FLOW) */}
        <LandingPartnerGuideDrawer
          isOpen={isAboutPartnerDrawerOpen}
          onClose={() => setIsAboutPartnerDrawerOpen(false)}
          activeStage={aboutPartnerStage}
          setActiveStage={setAboutPartnerStage}
          stableVersion={stableVersion}
          onInspectCovenants={() =>
            setActivePartnerCovenant('PartnersAgreement')
          }
          onStartPartnerApplication={() => {
            setIsAboutPartnerDrawerOpen(false);
            setActivePartnerStep(0);
            setMaxPartnerStep(0);
            setIsPartnerDrawerOpen(true);
          }}
        />

        {/* DRAWER 5: VERIFY COMPLETED DONATION */}
        <LandingVerifyDonationDrawer
          isOpen={isVerifyDrawerOpen}
          onClose={() => setIsVerifyDrawerOpen(false)}
          isVerifyingDonation={isVerifyingDonation}
          onVerifyWebDonation={handleVerifyWebDonation}
          isDevUnlocked={isDevUnlocked}
          devBuildUntil={devBuildUntil}
          pendingTargetName={pendingWebCheckout?.targetName}
          verifyReceiptInput={verifyReceiptInput}
          setVerifyReceiptInput={setVerifyReceiptInput}
          verifyAmountUsd={verifyAmountUsd}
          setVerifyAmountUsd={setVerifyAmountUsd}
        />

        <WebLegalViewer />
      </CommandScreenLayout>

      {/* 3D Liquid Glass Footer Bar (Crisp Legibility Over Any Wallpaper) */}
      <footer className="w-full pt-8 pb-10 mt-6 relative z-10 max-md:pb-[100px] scroll-mt-24">
        <div className="w-full glass-panel rounded-2xl px-5 py-4 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px] text-[var(--accent)]">
                {t('icon_shield', 'shield')}
              </span>
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
              {t(
                'landing_copyright',
                'Sanctuary OS © 2026 Sanctuary Foundry'
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5">
            <a
              href="#eula"
              className="px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-[var(--accent)] transition-all duration-300 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t('icon_gavel', 'gavel')}
              </span>
              <span>{t('landing_eula', 'System EULA')}</span>
            </a>
            <a
              href="#terms"
              className="px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-[var(--accent)] transition-all duration-300 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t('icon_description', 'description')}
              </span>
              <span>{t('landing_terms', 'Terms of Service')}</span>
            </a>
            <a
              href="#privacy"
              className="px-3.5 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:text-[var(--accent)] transition-all duration-300 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                {t('icon_shield', 'shield')}
              </span>
              <span>{t('landing_privacy', 'Privacy Protocol')}</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
