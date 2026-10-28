import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon, normalizeAllCapsForThemeCase } from './LexiconContext';
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
import MarkdownRenderer from './MarkdownRenderer';
import {
  CANONICAL_LEGAL_DOCS,
  fetchSyncedLegalAndCovenants,
} from './utils/directivesSync';
import {
  handleOpenUrl,
  ViewHeader,
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  SidePanelTitleInput,
  CustomDropdown,
  EmptyState,
  DashboardStatTile,
  StatTileCarousel,
  UniversalGroup,
} from './shared';
import {
  UniversalInput,
  UniversalTextArea,
  StatBox,
} from './components/universal/UniversalLayout';
import { SidePanelPillToggle } from './components/layouts/ElevatedHubLayout';
import TicketDossierSidePanel from './side-panels/TicketDossierSidePanel';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import packageJson from '../package.json';
import { UniversalCard } from './components/universal/UniversalCard';
import { usePwaInstall } from './utils/pwaManager';
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
import {
  ReleaseNotesShowcase,
  StructuredReleaseNotesView,
  LegalDocVersionInfoBlock,
  cleanPostBodyForViewer,
} from './components/ReleaseNotesShowcase';
import {
  CommandScreenLayout,
  CommandScreenBody,
  CommandScreenMain,
  CommandScreenSidebar,
  CommandScreenQuickLink,
  CommandScreenSectionHeading,
} from './hub-components/SharedCommandScreenLayout';

export default function WebLandingPage() {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);
  const setView = useStore((state: any) => state.setView);
  const setIsConfigured = useStore((state: any) => state.setIsConfigured);
  const pushToast = useStore((state: any) => state.pushStatus);
  const [games, setGames] = useState<any[]>([]);
  const [newsCount, setNewsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeLandingTab, setActiveLandingTab] = useState<LandingTabId>(() =>
    getActiveLandingTab()
  );
  const [keepersConfig, setKeepersConfig] = useState<KeepersPipelineConfig>(DEFAULT_KEEPERS_PIPELINE_CONFIG);
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
  const [feedbackPlatform, setFeedbackPlatform] = useState<'Desktop App' | 'Website' | 'Mobile PWA'>(
    isDesktop() ? 'Desktop App' : isStandalone ? 'Mobile PWA' : 'Website'
  );
  const [feedbackStream, setFeedbackStream] = useState<
    'Feature Request' | 'Public Build Feedback' | 'Beta Build Feedback' | 'Core Bug Report'
  >('Feature Request');
  const [feedbackSentiment, setFeedbackSentiment] = useState<'Positive' | 'Constructive' | 'Critical'>(
    'Constructive'
  );
  const [feedbackBugChannel, setFeedbackBugChannel] = useState<'Public Build' | 'Beta / Dev Build'>(
    isClientOnDevBuildStream() ? 'Beta / Dev Build' : 'Public Build'
  );
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
    'Direct Contact - General' | 'Direct Contact - Legal & Compliance' | 'Direct Contact - Security'
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
  const [partnerTeamSize, setPartnerTeamSize] = useState('2-3 Moderators / Architects');
  const [partnerInfraReadiness, setPartnerInfraReadiness] = useState(
    'Ready to Provision Dedicated Supabase Project'
  );
  const [partnerVision, setPartnerVision] = useState('');
  const [activePartnerStep, setActivePartnerStep] = useState(0);
  const [maxPartnerStep, setMaxPartnerStep] = useState(0);
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);

  // About Partner Spokes & Setup Guide Drawer State
  const [isAboutPartnerDrawerOpen, setIsAboutPartnerDrawerOpen] = useState(false);
  const [aboutPartnerTab, setAboutPartnerTab] = useState<
    'what' | 'setup' | 'connect' | 'maintain'
  >('what');

  // Apply to Join Keepers Core Drawer State (Chat-Like Guided Flow)
  const [isKeeperAppDrawerOpen, setIsKeeperAppDrawerOpen] = useState(false);
  const [keeperGate1, setKeeperGate1] = useState(false);
  const [keeperGate2, setKeeperGate2] = useState(false);
  const [keeperGate3, setKeeperGate3] = useState(false);
  const [keeperFocus, setKeeperFocus] = useState<string>(
    'Heuristic Malware & Security Oversight'
  );
  const [keeperHandle, setKeeperHandle] = useState('');
  const [keeperContact, setKeeperContact] = useState('');
  const [keeperPortfolio, setKeeperPortfolio] = useState('');
  const [keeperAvailability, setKeeperAvailability] = useState(
    '5-10 Hours / Week'
  );
  const [keeperExperience, setKeeperExperience] = useState('');
  const [activeKeeperStep, setActiveKeeperStep] = useState(0);
  const [maxKeeperStep, setMaxKeeperStep] = useState(0);
  const [isSubmittingKeeper, setIsSubmittingKeeper] = useState(false);

  // Stacked Partner Spoke Covenants Drawer State (2 Tabs: Partners Agreement & Compliance Protocol)
  const [activePartnerCovenant, setActivePartnerCovenant] = useState<
    'PartnersAgreement' | 'ComplianceProtocol' | null
  >(null);
  const [covenantViewMode, setCovenantViewMode] = useState<'ui' | 'normal'>('ui');
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
    const detectedPlatform: 'Desktop App' | 'Website' | 'Mobile PWA' = isDesktop()
      ? 'Desktop App'
      : isStandalone
        ? 'Mobile PWA'
        : 'Website';
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
        typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A';
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
  }, [isStandalone, keepersConfig.dev_build_version, keepersConfig.stable_version]);

  const handleManualLogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        const scrubbed = scrubLogUserData(content);
        setFeedbackAutoLogs((prev) =>
          prev ? `${prev}\n\n--- ATTACHED LOG FILE (${file.name}) ---\n${scrubbed}` : scrubbed
        );
        pushToast(
          t('support_log_loaded', 'Loaded and scrubbed log file:') + ` ${file.name}`,
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
    stream: 'Feature Request' | 'Public Build Feedback' | 'Beta Build Feedback' | 'Core Bug Report'
  ) => {
    setFeedbackPlatform(platform);
    setFeedbackStream(stream);
    setIsEditingAutoTelemetry(false);
    if (stream === 'Core Bug Report') {
      autoCapturePlatformDiagnostics();
      // Auto-skip manual platform & environment steps since logs & environment are auto-pulled!
      setActiveFbStep(2);
      setMaxFbStep(2);
    } else {
      setActiveFbStep(0);
      setMaxFbStep(0);
    }
    setIsFeedbackDrawerOpen(true);
  };

  const resetFeedbackFlow = () => {
    setFeedbackPlatform(isDesktop() ? 'Desktop App' : isStandalone ? 'Mobile PWA' : 'Website');
    setFeedbackStream('Feature Request');
    setFeedbackSentiment('Constructive');
    setFeedbackBugChannel(isClientOnDevBuildStream() ? 'Beta / Dev Build' : 'Public Build');
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
      pushToast(t('fill_required_fields', 'Please fill all required fields'), 'warning');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen' ? session.user.id : null;
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
          ? [feedbackDiagnostics.trim(), feedbackAutoLogs.trim()].filter(Boolean).join('\n\n')
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
            sentiment: feedbackStream === 'Core Bug Report' ? 'Bug Report' : feedbackSentiment,
            bug_channel: feedbackStream === 'Core Bug Report' ? feedbackBugChannel : undefined,
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
          t('landing_feedback_toast_err', 'Failed to dispatch feedback. Please try again.'),
        'error'
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSubmitDirectContact = async () => {
    const replyContact = contactReplyTo.trim() || session?.user?.email || '';
    if (!replyContact || !contactSubject.trim() || !contactBody.trim()) {
      pushToast(t('fill_required_fields', 'Please fill all required fields'), 'warning');
      return;
    }
    setIsSubmittingContact(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen' ? session.user.id : null;
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
          t('landing_feedback_toast_err', 'Failed to dispatch feedback. Please try again.'),
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
    const lastSent = Number(localStorage.getItem('sanctuary_partner_app_last_ts') || '0');
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
      pushToast(t('fill_required_fields', 'Please fill all required fields'), 'warning');
      return;
    }
    setIsSubmittingPartner(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen' ? session.user.id : null;
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
          t('landing_feedback_toast_err', 'Failed to dispatch feedback. Please try again.'),
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
    setKeeperFocus('Heuristic Malware & Security Oversight');
    setKeeperHandle(
      session?.user?.user_metadata?.username ||
        session?.user?.email?.split('@')[0] ||
        ''
    );
    setKeeperContact(session?.user?.email || '');
    setKeeperPortfolio('');
    setKeeperAvailability('5-10 Hours / Week');
    setKeeperExperience('');
    setActiveKeeperStep(0);
    setMaxKeeperStep(0);
  };

  const handleSubmitKeeperApplication = async () => {
    if (!keeperGate1 || !keeperGate2 || !keeperGate3) {
      pushToast(
        t('landing_keeper_gate_hdr', 'Step 1: Keeper Stewardship & Security Covenants'),
        'warning'
      );
      return;
    }
    const lastSent = Number(localStorage.getItem('sanctuary_keeper_app_last_ts') || '0');
    if (Date.now() - lastSent < 10 * 60 * 1000) {
      pushToast(
        t(
          'landing_keeper_err_cooldown',
          'A Keeper Application was recently submitted from this device. Keepers Core is reviewing your dossier.'
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
    if (
      !finalHandle ||
      !finalContact ||
      keeperExperience.trim().length < 40
    ) {
      pushToast(t('fill_required_fields', 'Please fill all required fields'), 'warning');
      return;
    }
    setIsSubmittingKeeper(true);
    try {
      const uid =
        session?.user?.id && session.user.id !== 'local_citizen' ? session.user.id : null;
      const formattedDossier = [
        `Applicant Handle: ${finalHandle}`,
        `Direct Contact: ${finalContact}`,
        `Primary Keeper Focus: ${keeperFocus}`,
        `Weekly Availability: ${keeperAvailability}`,
        `GitHub / Portfolio / Profile URL: ${keeperPortfolio.trim() || 'N/A'}`,
        ``,
        `Experience & Stewardship Motivation:`,
        keeperExperience.trim(),
      ].join('\n');

      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: 'Keeper Application',
        title: `[Keeper Application] ${finalHandle} — ${keeperFocus}`,
        description: formattedDossier,
        status: 'NEW',
        metadata: {
          keeper_application: {
            applicant_handle: finalHandle,
            applicant_contact: finalContact,
            user_id: uid,
            clearance_focus: keeperFocus,
            availability: keeperAvailability,
            portfolio_url: keeperPortfolio.trim(),
            experience_summary: keeperExperience.trim(),
            covenants_verified: true,
          },
        },
      });
      if (error) throw error;
      localStorage.setItem('sanctuary_keeper_app_last_ts', String(Date.now()));
      pushToast(
        t(
          'landing_keeper_toast_success',
          'Keeper Application transmitted to Keepers Core! Existing Keepers will review your dossier in Citizen Oversight.'
        ),
        'success'
      );
      setKeeperExperience('');
      setKeeperPortfolio('');
      setIsKeeperAppDrawerOpen(false);
      fetchMyPlatformTickets();
    } catch (err: any) {
      pushToast(
        err?.message ||
          t('landing_feedback_toast_err', 'Failed to dispatch feedback. Please try again.'),
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
      const diffDays = Math.max(30, Math.round((until - Math.max(nowSecs, devBuildUntilRef.current)) / 86400));
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
    setWebDevChannelEnabled(Boolean(supState?.dev_build?.channel_enabled && unlocked));
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
        supabase.from('sanctuary_games').select('id, name, schema_id, supabase_url, supabase_anon_key, icon, created_at, is_active, donation_url, payment_processor'),
        getKeepersPipelineConfig(),
        supabaseAuth
          .from('system_broadcasts')
          .select('id', { count: 'exact', head: true })
          .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance', 'Info', 'Event'])
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
    window.addEventListener('sanctuary-supporter-updated', handleSupporterUpdated);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('sanctuary-supporter-updated', handleSupporterUpdated);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.user?.id, refreshSupporterStatus]);

  // Poll cloud profile briefly while a web donation checkout is pending
  useEffect(() => {
    if (!pendingWebCheckout || !session?.user?.id) return;
    const pollInterval = setInterval(() => {
      refreshSupporterStatus();
    }, 4000);
    return () => clearInterval(pollInterval);
  }, [pendingWebCheckout, session?.user?.id, refreshSupporterStatus]);

  // Auto-detect returning Stripe redirect URL parameters (?session_id=cs_... or ?donation_checkout=success)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sessionIdParam =
        params.get('session_id') || params.get('checkout_session_id');
      if (sessionIdParam && sessionIdParam.startsWith('cs_')) {
        setVerifyReceiptInput(sessionIdParam);
        setPendingWebCheckout({
          targetId: 'keepers_core',
          targetName: t('supporter_keepers_title', 'Sanctuary OS (Keepers Core)'),
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
    rawDonationUrl?: string,
  ) => {
    const cleanUrl = (rawDonationUrl || '').trim();
    if (!cleanUrl) return;

    if (isSandboxDonationUrl(cleanUrl)) {
      if (!session?.user?.id) {
        pushToast(
          t(
            'supporter_auth_required_for_dev_builds',
            'Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.',
          ),
          'warning',
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
          res.devBuild.dev_build_until > Math.floor(Date.now() / 1000),
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
          'error',
        );
      }
      return;
    }

    const checkoutUrl = buildPartnerCheckoutUrl(
      cleanUrl,
      session?.user?.id,
      session?.user?.email,
    );

    // Open synchronously in user gesture handler so browser popup blockers never block Stripe
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
            'Checkout opened! Sign in to Sanctuary OS or use your account email at checkout so your +30 days of Dev Builds per $5 link to your account.',
          ),
          'info',
        );
      }
    }
  };

  const handleVerifyWebDonation = async () => {
    if (!session?.user?.id) {
      pushToast(
        t(
          'supporter_auth_required_for_dev_builds',
          'Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5.',
        ),
        'warning',
      );
      return;
    }
    const nonce = extractCheckoutReceiptNonce(verifyReceiptInput);
    if (!nonce || nonce.length < 4) {
      pushToast(
        t(
          'supporter_web_receipt_ph',
          'Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...',
        ),
        'warning',
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
        res.devBuild.dev_build_until > Math.floor(Date.now() / 1000),
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
        'error',
      );
    } finally {
      setIsVerifyingDonation(false);
    }
  };

  const stableVersion = (keepersConfig.stable_version || packageJson.version.split('-')[0] || packageJson.version).replace(/^v/i, '').trim();

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
      window.removeEventListener('agree_partner_covenants', handleAgreeCovenants);
    };
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
        if (Array.isArray(globalConfig.workspaces)) {
          const existsInConfig = globalConfig.workspaces.some(
            (w: any) =>
              String(w.id || "").toLowerCase() === String(gameId || "").toLowerCase() ||
              String(w.schema_id || "").toLowerCase() === String(gameId || "").toLowerCase()
          );
          if (!existsInConfig) {
            const matchedGame = games.find(
              (g: any) =>
                String(g.schema_id || "").toLowerCase() === String(gameId || "").toLowerCase() ||
                String(g.id || "").toLowerCase() === String(gameId || "").toLowerCase()
            );
            const targetSchema = matchedGame?.schema_id || gameId;
            const masterVault = globalConfig.vault_path || "";
            globalConfig.workspaces.push({
              id: gameId,
              name: matchedGame?.name || gameId,
              schema_id: targetSchema,
              live_path: "",
              mods_path: "",
              vault_path: masterVault ? `${masterVault}\\${targetSchema}` : "",
              supabase_url: matchedGame?.supabase_url || null,
              supabase_anon_key: matchedGame?.supabase_anon_key || null,
            });
          }
        }
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
    overview: t("overview", "Overview"),
    workspaces: t("landing_workspaces", "Active Workspaces"),
    news: t("landing_news", "Sanctuary Foundry News"),
    directives: t("landing_system_directives", "Public Documents"),
    download: t("landing_download_sidebar", "Download Sanctuary OS"),
    support: t("landing_nav_feedback", "Feedback & Support"),
    partners: t("landing_partners_tab", "Partner Spokes"),
    legal: t("landing_legal_tab", "Legal"),
    donations: t("wf_tab_donations", "Donations"),
  };

  const renderWorkspaceCards = (list: any[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {loading ? (
        <div className="col-span-full py-12 flex justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-[var(--accent)] drop-shadow-[0_0_15px_var(--accent)]">
            {t("icon_autorenew", "autorenew")}
          </span>
        </div>
      ) : (
        <>
          {list.map((game) => {
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
                        : "text-[var(--subtext)] opacity-75"
                    }`}
                  >
                    {t("workspace_card_overline", "Game Workspace")}
                  </span>
                  <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-snug group-hover:text-[var(--accent)] transition-colors duration-300 truncate m-0">
                    {game.name}
                  </h3>
                  <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2 m-0">
                    {isActive
                      ? t(
                          "workspace_card_desc_active",
                          "Currently active environment for {mod} deployment, diagnostics, and backups."
                        )
                      : t(
                          "workspace_card_desc_available",
                          "Select to mount this game workspace and load its {vault}, {blueprints}, and tools."
                        )}
                  </p>
                </div>

                {/* Bottom Footer Row: Schema Code + Action Label */}
                <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--subtext)] opacity-70 truncate">
                    {game.schema_id}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0 text-[var(--text)] opacity-80 group-hover:text-[var(--accent)] group-hover:opacity-100 transition-colors duration-300">
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
  );

  return (
    <div className="w-full flex flex-col items-center justify-start relative pt-0 px-0 pb-0">
      <CommandScreenLayout className="w-full">
        <ViewHeader
          title={t("landing_welcome", "Welcome to Sanctuary OS")}
          subtitle={t(
            "landing_subtitle",
            "Your centralized hub for community-driven game modifications, {blueprints}, and assets. Select a workspace below to enter."
          )}
          icon={t("icon_shield", "shield")}
          breadcrumb={
            activeLandingTab !== "overview"
              ? landingTabLabels[activeLandingTab]
              : undefined
          }
          onTitleClick={() => scrollToLandingSection("overview")}
        />

        <StatTileCarousel>
          <DashboardStatTile
            variant="tab"
            icon={t("icon_dashboard", "dashboard")}
            label={t("overview", "Overview")}
            number={`v${stableVersion}`}
            isActive={activeLandingTab === "overview"}
            onClick={() => scrollToLandingSection("overview")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_public", "public")}
            label={t("landing_workspaces", "Active Workspaces")}
            number={games.length}
            isActive={activeLandingTab === "workspaces"}
            onClick={() => scrollToLandingSection("workspaces")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_newspaper", "newspaper")}
            label={t("landing_news_short", "News")}
            number={newsCount}
            isActive={activeLandingTab === "news"}
            onClick={() => scrollToLandingSection("news")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_folder_special", "folder_special")}
            label={t("landing_directives_short", "Directives")}
            number={5}
            isActive={activeLandingTab === "directives"}
            onClick={() => scrollToLandingSection("directives")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_system_update_alt", "system_update_alt")}
            label={t("landing_download_sidebar", "Download Sanctuary OS")}
            number={
              !isDesktop()
                ? isDevUnlocked
                  ? 6
                  : 4
                : isDevUnlocked
                  ? 4
                  : 2
            }
            isActive={activeLandingTab === "download"}
            onClick={() => scrollToLandingSection("download")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_support_agent", "support_agent")}
            label={t("landing_nav_feedback", "Feedback & Support")}
            number={3}
            isActive={activeLandingTab === "support"}
            onClick={() => scrollToLandingSection("support")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_handshake", "handshake")}
            label={t("landing_partners_tab", "Partner Spokes")}
            number={4}
            isActive={activeLandingTab === "partners"}
            onClick={() => scrollToLandingSection("partners")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_gavel", "gavel")}
            label={t("landing_legal_tab", "Legal")}
            number={3}
            isActive={activeLandingTab === "legal"}
            onClick={() => scrollToLandingSection("legal")}
          />
          <DashboardStatTile
            variant="tab"
            icon={t("icon_volunteer_activism", "volunteer_activism")}
            label={t("wf_tab_donations", "Donations")}
            number={
              2 +
              games.filter((g) =>
                Boolean(g.donation_url && String(g.donation_url).trim().length > 0)
              ).length
            }
            isActive={activeLandingTab === "donations"}
            onClick={() => scrollToLandingSection("donations")}
          />
        </StatTileCarousel>

        {/* =====================================================================
            TAB 1: OVERVIEW (Pinned Workspaces • Recent News • Latest Builds + Quick Links)
           ===================================================================== */}
        {activeLandingTab === "overview" && (
          <CommandScreenBody>
            <CommandScreenMain>
              <section id="workspaces" className="flex flex-col gap-6">
                <CommandScreenSectionHeading
                  title={t("landing_workspaces", "Active Workspaces")}
                  icon={t("icon_public", "public")}
                  rightSlot={
                    games.length > 0 ? (
                      <PanelHeaderGroup>
                        <PanelHeaderButton
                          icon={t("icon_arrow_forward", "arrow_forward")}
                          tooltip={`${t("all", "All")} (${games.length})`}
                          onClick={() => scrollToLandingSection("workspaces")}
                        />
                      </PanelHeaderGroup>
                    ) : undefined
                  }
                />
                <div className="w-full">
                  {renderWorkspaceCards(pinnedWorkspaces)}
                </div>
              </section>

              <section id="news" className="flex flex-col gap-6">
                <CommandScreenSectionHeading
                  title={t("landing_news", "Sanctuary Foundry News")}
                  icon={t("icon_campaign", "campaign")}
                  rightSlot={
                    <PanelHeaderGroup>
                      <PanelHeaderButton
                        icon={t("icon_arrow_forward", "arrow_forward")}
                        tooltip={t("landing_news_short", "News")}
                        onClick={() => scrollToLandingSection("news")}
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
                    "release_notes_section_title",
                    "Current Build Release Notes"
                  )}
                  icon={t("icon_new_releases", "new_releases")}
                />
                <ReleaseNotesShowcase
                  versionLabel={
                    !isDesktop() && webDevChannelEnabled
                      ? keepersConfig.dev_build_version || `${stableVersion}-dev`
                      : stableVersion
                  }
                />
              </section>
            </CommandScreenMain>

            <CommandScreenSidebar
              title={t("wf_quick_links", "Quick Links")}
              icon={t("icon_bolt", "bolt")}
            >
              <CommandScreenQuickLink
                icon={t("icon_public", "public")}
                title={t("landing_workspaces", "Active Workspaces")}
                subtitle={`${games.length} ${t("workspace_card_overline", "Game Workspace")}`}
                onClick={() => scrollToLandingSection("workspaces")}
              />
              <CommandScreenQuickLink
                icon={t("icon_system_update_alt", "system_update_alt")}
                title={t("landing_download_sidebar", "Download Sanctuary OS")}
                subtitle={`${t("landing_win_exe", "Windows (.exe)")} • ${t("landing_mac_dmg", "macOS (.dmg)")} • PWA`}
                onClick={() => scrollToLandingSection("download")}
              />
              <CommandScreenQuickLink
                icon={t("icon_folder_special", "folder_special")}
                title={t("landing_system_directives", "Public Documents")}
                subtitle={t("lex_studio_nav_landing_title", "Public Landing & System Directives")}
                onClick={() => scrollToLandingSection("directives")}
              />
              <CommandScreenQuickLink
                icon={t("icon_volunteer_activism", "volunteer_activism")}
                title={t(
                  "landing_support_section_title",
                  "Support Sanctuary OS & Partner Communities"
                )}
                subtitle={t(
                  "landing_support_card_badge",
                  "0% Platform Fee • +30 Days Dev Builds Per $5"
                )}
                onClick={() => scrollToLandingSection("donations")}
              />
              <CommandScreenQuickLink
                icon={t("icon_rate_review", "rate_review")}
                title={t(
                  "landing_feedback_section_title",
                  "Platform Feedback & Core Support"
                )}
                subtitle={t(
                  "landing_feedback_card_sub",
                  "Desktop App • Website • Mobile PWA"
                )}
                onClick={() => scrollToLandingSection("feedback")}
              />
              <CommandScreenQuickLink
                icon={t("icon_handshake", "handshake")}
                title={t(
                  "landing_partners_tab",
                  "Partner Spokes"
                )}
                subtitle={t(
                  "landing_banner_partner_bottom",
                  "Community Workspace Operators • 0% Platform Fee"
                )}
                onClick={() => scrollToLandingSection("partners")}
              />
              <CommandScreenQuickLink
                icon={t("icon_gavel", "gavel")}
                title={t("landing_legal_tab", "Legal")}
                subtitle={`${t("landing_terms", "Terms of Service")} • ${t("landing_privacy", "Privacy Protocol")}`}
                onClick={() => scrollToLandingSection("legal")}
              />
            </CommandScreenSidebar>
          </CommandScreenBody>
        )}

        {/* =====================================================================
            TAB 2: WORKSPACES (All Active Game Workspaces)
           ===================================================================== */}
        {activeLandingTab === "workspaces" && (
          <div className="w-full flex flex-col gap-10">
            <section id="workspaces" className="flex flex-col gap-6">
              <CommandScreenSectionHeading
                title={t("landing_workspaces", "Active Workspaces")}
                icon={t("icon_public", "public")}
              />
              <div className="w-full">{renderWorkspaceCards(games)}</div>
            </section>
          </div>
        )}

        {/* =====================================================================
            TAB 3: NEWS (Sanctuary Foundry News)
           ===================================================================== */}
        {activeLandingTab === "news" && (
          <div className="w-full flex flex-col gap-10">
            <section id="news" className="flex flex-col gap-6 scroll-mt-24">
              <div id="sanctuary_foundry_news" className="hidden" />
              <CommandScreenSectionHeading
                title={t("landing_news", "Sanctuary Foundry News")}
                icon={t("icon_campaign", "campaign")}
              />
              <div className="w-full">
                <WebNewsFeed limit={12} onCountChange={setNewsCount} />
              </div>
            </section>
          </div>
        )}

        {/* =====================================================================
            TAB 4: DIRECTIVES (Public Documents & System Directives)
           ===================================================================== */}
        {activeLandingTab === "directives" && (
          <section
            id="system_directives"
            className="w-full flex flex-col gap-6 scroll-mt-24"
          >
            <CommandScreenSectionHeading
              title={t("landing_system_directives", "Public Documents")}
              icon={t("icon_folder_special", "folder_special")}
            />
            <div className="w-full">
              <WebDocumentFeed />
            </div>
          </section>
        )}

        {/* =====================================================================
            TAB 5: DOWNLOAD LINKS (Native Win/Mac Clients, PWA, Build Streams & Update Notes)
           ===================================================================== */}
        {activeLandingTab === "download" && (
          <div className="w-full flex flex-col gap-10">
          <section
            id="download"
            className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
          >
            <CommandScreenSectionHeading
              title={t("landing_download_sidebar", "Download Sanctuary OS")}
              icon={t("icon_system_update_alt", "system_update_alt")}
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
                      icon={t("icon_install_mobile", "install_mobile")}
                      bannerTopLabel={t(
                        "landing_banner_pwa_top",
                        "iOS • Android • Web"
                      )}
                      bannerBottomLabel={t(
                        "landing_banner_pwa_bottom",
                        "Standalone Web App"
                      )}
                      title={t(
                        "pwa_install_title",
                        "Install Sanctuary Web App"
                      )}
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {t(
                            "pwa_install_subtitle",
                            "Progressive Web App (iOS / Android / Web)"
                          )}
                        </span>
                      }
                      className="h-full"
                      footer={
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                            {t("pwa_badge_standalone", "STANDALONE PWA")}
                          </span>
                          <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                            <span>
                              {isStandalone
                                ? t("pwa_btn_installed", "App Installed")
                                : t("pwa_btn_install", "Install App")}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {isStandalone
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_arrow_forward", "arrow_forward")}
                            </span>
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

                  {/* Website & Mobile PWA Public vs. Beta / Dev Build Stream Switcher Card */}
                  <div className="flex flex-col group cursor-pointer">
                    <UniversalCard
                      layout="vertical"
                      onClick={() =>
                        handleToggleWebDevStream(!webDevChannelEnabled)
                      }
                      icon={
                        webDevChannelEnabled
                          ? t("icon_science", "science")
                          : t("icon_public", "public")
                      }
                      statusColor={webDevChannelEnabled ? "emerald" : undefined}
                      bannerTopLabel={t(
                        "landing_web_stream_banner_top",
                        "Website & Mobile PWA • Build Stream"
                      )}
                      bannerBottomLabel={
                        webDevChannelEnabled
                          ? `${t("landing_fb_stream_beta", "Beta Build Feedback")} • v${keepersConfig.dev_build_version || `${stableVersion}-dev`}`
                          : `${t("landing_fb_stream_public", "Public Build Feedback")} • v${stableVersion}`
                      }
                      title={
                        webDevChannelEnabled
                          ? t(
                              "landing_web_stream_beta_title",
                              "Web & PWA: Beta / Dev Build Active"
                            )
                          : t(
                              "landing_web_stream_public_title",
                              "Web & PWA: Public Build Active"
                            )
                      }
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {isDevUnlocked
                            ? t(
                                "landing_web_stream_sub_unlocked",
                                "Click to Toggle Between Public & Daily Dev Build Stream"
                              )
                            : t(
                                "landing_web_stream_sub_locked",
                                "Supporter Stream ($5 = +30 Days Global Daily Dev Builds)"
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
                                    "landing_web_stream_btn_switch_public",
                                    "Switch to Public Stream"
                                  )
                                : t(
                                    "landing_web_stream_btn_switch_beta",
                                    "Switch to Beta / Dev Stream"
                                  )}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                        {t(
                          "landing_web_stream_desc",
                          "Switch your live Website and Mobile PWA session between the verified Public Build and the Supporter Daily Dev Build channel."
                        )}
                      </p>
                    </UniversalCard>
                  </div>
                </>
              )}

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
                  icon={t("icon_rocket_launch", "rocket_launch")}
                  bannerTopLabel={t(
                    "landing_banner_win_top",
                    "Windows 10 / 11 (64-Bit)"
                  )}
                  bannerBottomLabel={`${t("landing_banner_win_bottom", "Native Setup (.exe)")} • v${stableVersion}`}
                  title={t("landing_download_native_title", "Sanctuary OS Native")}
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t("landing_win_exe", "Windows (.exe)")}
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
                          {t("landing_download_native_footer", "Standard Install")}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      "landing_download_desc",
                      "Install the Native Client to access full hardware integration, heuristic threat scanning, and deep OS-level modifications."
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
                  icon={t("icon_laptop_mac", "laptop_mac")}
                  bannerTopLabel={t(
                    "landing_banner_mac_top",
                    "Apple Silicon & Intel"
                  )}
                  bannerBottomLabel={`${t("landing_banner_mac_bottom", "macOS Disk Image (.dmg)")} • v${stableVersion}`}
                  title={t("landing_download_mac_title", "Sanctuary OS for Mac")}
                  subtitle={
                    <span className="text-[10px] font-mono tracking-widest">
                      {t("landing_mac_dmg", "macOS (.dmg)")}
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
                            "landing_download_mac_footer",
                            "Apple Silicon & Intel"
                          )}
                        </span>
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                    {t(
                      "landing_download_mac_desc",
                      "Native macOS Universal application bundle engineered for Apple Silicon and Intel Macs with full Metal glass acceleration."
                    )}
                  </p>
                </UniversalCard>
              </a>

              {Boolean(session?.user?.id) && isDevUnlocked && (
                <>
                  <a
                    href={
                      keepersConfig.dev_build_download_url ||
                      "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <UniversalCard
                      layout="vertical"
                      onClick={() => {}}
                      icon={t("icon_bolt", "bolt")}
                      statusColor="emerald"
                      bannerTopLabel={t(
                        "landing_banner_dev_win_top",
                        "Supporter Dev Stream • Win"
                      )}
                      bannerBottomLabel={`${t("landing_banner_dev_win_bottom", "Early Preview (.exe)")} • v${keepersConfig.dev_build_version || "dev-latest"}`}
                      title={t(
                        "landing_download_dev_title",
                        "Daily Dev Build (Supporter)"
                      )}
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {t(
                            "landing_download_dev_subtitle",
                            "Supporter Preview Channel (.exe)"
                          )}
                        </span>
                      }
                      className="h-full"
                      footer={
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                            {`v${keepersConfig.dev_build_version || "dev-latest"}`}
                          </span>
                          <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                            <span>
                              {t(
                                "landing_download_dev_footer",
                                "SUPPORTER STREAM"
                              )}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                        {t(
                          "landing_download_dev_desc",
                          "Nightly preview build unlocked by your active Global Daily Dev Build supporter time."
                        )}
                      </p>
                    </UniversalCard>
                  </a>

                  <a
                    href={
                      keepersConfig.dev_build_dmg_url ||
                      keepersConfig.dev_release_url ||
                      "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <UniversalCard
                      layout="vertical"
                      onClick={() => {}}
                      icon={t("icon_laptop_mac", "laptop_mac")}
                      statusColor="emerald"
                      bannerTopLabel={t(
                        "landing_banner_dev_mac_top",
                        "Supporter Dev Stream • Mac"
                      )}
                      bannerBottomLabel={`${t("landing_banner_dev_mac_bottom", "Early Preview (.dmg)")} • v${keepersConfig.dev_build_version || "dev-latest"}`}
                      title={t(
                        "landing_download_dev_mac_title",
                        "Dev Build for Mac"
                      )}
                      subtitle={
                        <span className="text-[10px] font-mono tracking-widest">
                          {t(
                            "landing_download_dev_mac_subtitle",
                            "Supporter Early Preview (.dmg)"
                          )}
                        </span>
                      }
                      className="h-full"
                      footer={
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                            {`v${keepersConfig.dev_build_version || "dev-latest"}`}
                          </span>
                          <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                            <span>
                              {t(
                                "landing_download_dev_mac_footer",
                                "Download Mac Dev .dmg"
                              )}
                            </span>
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_arrow_forward", "arrow_forward")}
                            </span>
                          </span>
                        </div>
                      }
                    >
                      <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                        {t(
                          "landing_download_dev_mac_desc",
                          "Early preview macOS disk image unlocked by your active Global Dev Build supporter time—featuring the latest experimental features on Apple Silicon and Intel."
                        )}
                      </p>
                    </UniversalCard>
                  </a>
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
                "release_notes_section_title",
                "Current Build Release Notes"
              )}
              icon={t("icon_new_releases", "new_releases")}
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
        )}

        {/* =====================================================================
            TAB 6: CONTACT / SUPPORT (Platform Feedback & Direct Contact)
           ===================================================================== */}
        {activeLandingTab === "support" && (
          <div className="w-full flex flex-col gap-10">

        {/* =====================================================================
            OFFICIAL CORE PLATFORM FEEDBACK & BUG SUPPORT SECTION
            Clean 3-Card UniversalCard Row: [Alert -> Feedback -> Bugs]
           ===================================================================== */}
        <section id="feedback" className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative">
          <CommandScreenSectionHeading
            title={t("landing_feedback_section_title", "Platform Feedback & Core Support")}
            icon={t("icon_rate_review", "rate_review")}
            rightSlot={
              Boolean(session?.user?.id && session.user.id !== "local_citizen") ? (
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={t("icon_inbox", "inbox")}
                    tooltip={`${t("landing_my_platform_tickets", "My Platform Tickets & Feedback")} (${myPlatformTickets.length})`}
                    onClick={() => {
                      fetchMyPlatformTickets();
                      setIsMyTicketsDrawerOpen(true);
                    }}
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
                    "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)",
                }}
              />
              <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                {t("icon_gpp_maybe", "gpp_maybe")}
              </span>

              {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
              <div className="flex items-center justify-between gap-3 relative z-10">
                <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[22px]">
                    {t("icon_warning", "warning")}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                    {t("icon_gpp_maybe", "gpp_maybe")}
                  </span>
                  <span>{t("landing_feedback_alert_badge", "CORE PLATFORM ONLY")}</span>
                </span>
              </div>

              {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
              <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                  {t("landing_banner_scope_top", "Core OS Scope Directive")}
                </span>
                <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                  {t("landing_feedback_alert_card_title", "Core Platform Scope Notice")}
                </h3>
              </div>

              {/* Row 3: Recessed Warning Callout Strip */}
              <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
                <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                  {t("icon_block", "block")}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                  {t("landing_banner_scope_bottom", "No Spoke Drama • Core Platform Only")}
                </span>
              </div>

              {/* Row 4: Body Notice */}
              <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
                {t(
                  "landing_feedback_scope_desc",
                  "This channel is strictly for positive or constructive feedback and bug reports regarding the Core Sanctuary OS Platform (Desktop App, Website, and Mobile PWA). Do not submit individual game spoke {mod} disputes, {mason} drama, or spoke moderation appeals here—use the Support desk inside that game's workspace."
                )}
              </p>

              {/* Row 5: Static Advisory Footer */}
              <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
                <span>{t("keepers_title", "Keepers Core")}</span>
                <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_shield", "shield")}
                  </span>
                  <span>{t("landing_feedback_alert_badge", "CORE PLATFORM ONLY")}</span>
                </span>
              </div>
            </div>

            {/* Card 2: [Feedback] Desktop App • Website • Mobile PWA */}
            <UniversalCard
              layout="vertical"
              onClick={() =>
                openFeedbackChannel(
                  isDesktop() ? "Desktop App" : "Website",
                  "Feature Request"
                )
              }
              icon={t("icon_rate_review", "rate_review")}
              bannerTopLabel={t("landing_banner_fb_top", "Desktop App • Website • Mobile PWA")}
              bannerBottomLabel={t("landing_banner_fb_bottom", "Feature Requests • Public & Beta Builds")}
              title={t("landing_feedback_card_title", "Submit Platform Feedback")}
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {t("landing_feedback_card_sub", "Desktop App • Website • Mobile PWA")}
                </span>
              }
              className="h-full"
              footer={
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                    {t("landing_feedback_card_badge", "3 PLATFORMS • 3 STREAMS")}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    <span>{t("landing_fb_btn_open", "Submit Feedback")}</span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                {t(
                  "landing_feedback_card_desc",
                  "Share positive or constructive feedback, Feature Requests, Public Build Feedback, or Beta Build Feedback across our Desktop App, Website, and Mobile PWA via our guided step-by-step ticket flow."
                )}
              </p>
            </UniversalCard>

            {/* Card 3: [Bugs] Core Platform Bug Reports -> Keepers Core */}
            <UniversalCard
              layout="vertical"
              onClick={() =>
                openFeedbackChannel(
                  isDesktop() ? "Desktop App" : "Website",
                  "Core Bug Report"
                )
              }
              icon={t("icon_bug_report", "bug_report")}
              bannerTopLabel={t("landing_banner_bug_top", "Keepers Core Ticket System")}
              bannerBottomLabel={t("landing_banner_bug_bottom", "Direct Engineering Bug Triage")}
              title={t("landing_fb_bug_title", "Core Platform Bug Reports")}
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {t("landing_fb_bug_sub", "Keepers Core Ticket System")}
                </span>
              }
              className="h-full"
              footer={
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                    {t("keepers_title", "Keepers Core")}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    <span>{t("landing_fb_btn_bug", "Report Core Bug")}</span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                {t(
                  "landing_fb_bug_desc",
                  "Encountered a reproducible bug, UI glitch, or crash in Sanctuary OS? Open a direct diagnostic ticket routed straight to Keepers Core."
                )}
              </p>
            </UniversalCard>
          </div>
        </section>

        {/* =====================================================================
            DIRECT HUMAN CONTACT & PARTNER SPOKE PIPELINE
            Clean 3-Card Row: [Alert -> Direct Human Contact -> Partner Apply]
           ===================================================================== */}
        <section id="contact" className="w-full flex flex-col gap-6 mt-8 mb-8 scroll-mt-24 z-10 relative">
          <CommandScreenSectionHeading
            title={t("landing_contact_section_title", "Direct Human Contact & Partner Spoke Pipeline")}
            icon={t("icon_handshake", "handshake")}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {/* Card 1: [Alert / Warning] Human Review & Spoke Qualification Notice */}
            <div className="glass-panel rounded-[var(--radius)] p-5 flex flex-col gap-3.5 relative overflow-hidden bg-[color-mix(in_srgb,var(--warning)_4%,transparent)] border-[color-mix(in_srgb,var(--warning)_22%,transparent)] h-full text-left">
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={{
                  background:
                    "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)",
                }}
              />
              <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                {t("icon_verified_user", "verified_user")}
              </span>

              {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
              <div className="flex items-center justify-between gap-3 relative z-10">
                <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[22px]">
                    {t("icon_warning", "warning")}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                    {t("icon_verified_user", "verified_user")}
                  </span>
                  <span>{t("landing_contact_alert_badge", "100% HUMAN-REVIEWED")}</span>
                </span>
              </div>

              {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
              <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                  {t("landing_contact_alert_overline", "Human Contact & Spoke Governance")}
                </span>
                <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                  {t("landing_contact_alert_title", "Direct Human Review & Spoke Qualification Notice")}
                </h3>
              </div>

              {/* Row 3: Recessed Warning Callout Strip */}
              <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
                <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                  {t("icon_gpp_maybe", "gpp_maybe")}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                  {t("landing_contact_alert_callout", "No AI Deflection Bots • Community Spokes Only")}
                </span>
              </div>

              {/* Row 4: Body Notice */}
              <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
                {t(
                  "landing_contact_alert_desc",
                  "Every Direct Contact inquiry is read by a human Keeper in Keepers Core and replied to directly via our in-app email dispatch—never routed to AI bots. Partner Spoke applications are strictly for community-moderated Game Workspaces, not personal creator or streamer badges."
                )}
              </p>

              {/* Row 5: Static Advisory Footer */}
              <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
                <span>{t("keepers_title", "Keepers Core")}</span>
                <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_shield", "shield")}
                  </span>
                  <span>{t("landing_contact_alert_badge", "100% HUMAN-REVIEWED")}</span>
                </span>
              </div>
            </div>

            {/* Card 2: [Contact] Direct Human Contact */}
            <UniversalCard
              layout="vertical"
              onClick={() => {
                setContactChannel("Direct Contact - General");
                setActiveContactStep(0);
                setMaxContactStep(0);
                setIsContactDrawerOpen(true);
              }}
              icon={t("icon_support_agent", "support_agent")}
              bannerTopLabel={t("landing_contact_human_badge", "100% Human-Reviewed • Never Routed to AI Bots")}
              bannerBottomLabel={t("landing_banner_contact_bottom", "General • Legal & DMCA • Security Disclosures")}
              title={t("landing_contact_card_title", "Direct Human Contact")}
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {t(
                    "landing_contact_card_sub",
                    "Statutory & Operational Contact • Read by Real Keepers, Never Shoved to AI"
                  )}
                </span>
              }
              className="h-full"
              footer={
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                    {t("keepers_title", "Keepers Core")}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    <span>{t("landing_contact_btn_open", "Open Direct Contact")}</span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                {t(
                  "landing_contact_card_desc",
                  "While most platforms bury their legal and operational contact channels behind automated AI deflection loops, Sanctuary OS routes every formal inquiry directly to human Keepers."
                )}
              </p>
            </UniversalCard>

            {/* Card 3: [Keeper Apply] Apply to Join Keepers Core */}
            <UniversalCard
              layout="vertical"
              onClick={() => {
                resetKeeperFlow();
                setIsKeeperAppDrawerOpen(true);
              }}
              icon={t("icon_admin_panel_settings", "admin_panel_settings")}
              bannerTopLabel={t("keepers_title", "Keepers Core")}
              bannerBottomLabel={t(
                "landing_keeper_apply_sub",
                "Core OS Stewardship • Heuristic Security • Platform Triage"
              )}
              title={t("landing_keeper_apply_title", "Apply to Join Keepers Core")}
              subtitle={
                <span className="text-[10px] font-mono tracking-widest">
                  {t(
                    "landing_keeper_apply_sub",
                    "Core OS Stewardship • Heuristic Security • Platform Triage"
                  )}
                </span>
              }
              className="h-full"
              footer={
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                    {t("keepers_tab_keeper_apps", "Keeper Applications")}
                  </span>
                  <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                    <span>{t("landing_keeper_apply_btn", "Start Keeper Application")}</span>
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_rocket_launch", "rocket_launch")}
                    </span>
                  </span>
                </div>
              }
            >
              <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                {t(
                  "landing_keeper_apply_desc",
                  "Want to help safeguard Sanctuary OS, maintain global heuristic malware signatures, review Partner Spoke applications, or triage core platform telemetry? Submit a Keeper application directly to Keepers Core."
                )}
              </p>
            </UniversalCard>
          </div>
        </section>
          </div>
        )}

        {/* =====================================================================
            TAB 7: PARTNER SPOKES (About • Apply • Partners Agreement • Compliance Protocol)
           ===================================================================== */}
        {activeLandingTab === "partners" && (
          <section
            id="partners"
            className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
          >
            <CommandScreenSectionHeading
              title={t("landing_partners_tab", "Partner Spokes")}
              icon={t("icon_handshake", "handshake")}
              rightSlot={
                <PanelHeaderGroup>
                  <PanelHeaderButton
                    icon={t("icon_menu_book", "menu_book")}
                    tooltip={t("landing_partners_about_btn", "Open Partner Guide")}
                    onClick={() => {
                      setAboutPartnerTab("what");
                      setIsAboutPartnerDrawerOpen(true);
                    }}
                  />
                  <PanelHeaderButton
                    icon={t("icon_rocket_launch", "rocket_launch")}
                    tooltip={t(
                      "landing_partner_btn_open",
                      "Start Partner Spoke Application"
                    )}
                    onClick={() => {
                      setActivePartnerStep(0);
                      setMaxPartnerStep(0);
                      setIsPartnerDrawerOpen(true);
                    }}
                  />
                </PanelHeaderGroup>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {/* Card 1: About Partner Spokes & Setup Guide */}
              <UniversalCard
                layout="vertical"
                onClick={() => {
                  setAboutPartnerTab("what");
                  setIsAboutPartnerDrawerOpen(true);
                }}
                icon={t("icon_menu_book", "menu_book")}
                bannerTopLabel={t(
                  "landing_partners_tab_what_sub",
                  "100% Sovereignty & 0% Tax"
                )}
                bannerBottomLabel={t(
                  "landing_partners_about_sub",
                  "Architecture • Supabase Bootstrap • Uplink Handshake • Governance"
                )}
                title={t(
                  "landing_partners_about_title",
                  "About Partner Spokes & Setup Guide"
                )}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t(
                      "landing_partners_about_sub",
                      "Architecture • Supabase Bootstrap • Uplink Handshake • Governance"
                    )}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("landing_partners_tab", "Partner Spokes")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>{t("landing_partners_about_btn", "Open Partner Guide")}</span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "landing_partners_about_desc",
                    "Learn what a Sanctuary OS Partner Spoke is, how 100% data sovereignty and 0% non-custodial donations work, and how to provision, connect, and maintain a community game workspace."
                  )}
                </p>
              </UniversalCard>

              {/* Card 2: Apply to Launch a Partner Game Spoke */}
              <UniversalCard
                layout="vertical"
                onClick={() => {
                  setActivePartnerStep(0);
                  setMaxPartnerStep(0);
                  setIsPartnerDrawerOpen(true);
                }}
                icon={t("icon_handshake", "handshake")}
                bannerTopLabel={t(
                  "landing_partner_badge",
                  "Readiness-Gated Dossier • Anti-Spam Verified"
                )}
                bannerBottomLabel={t(
                  "landing_banner_partner_bottom",
                  "Community Workspace Operators • 0% Platform Fee"
                )}
                title={t(
                  "landing_partner_card_title",
                  "Apply to Launch a Partner Game Spoke"
                )}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t(
                      "landing_partner_card_sub",
                      "Dedicated Game Workspaces • Operated by Community Wayfinders & Architects"
                    )}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("keepers_tab_partner_apps", "Partner Applications")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>
                        {t(
                          "landing_partner_btn_open",
                          "Start Partner Spoke Application"
                        )}
                      </span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_rocket_launch", "rocket_launch")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "landing_partner_card_desc",
                    "Represent an established modding community and want to launch an official game workspace on Sanctuary OS? Complete our readiness check and submit your technical dossier to the Keepers."
                  )}
                </p>
              </UniversalCard>

              {/* Card 3: Partners Agreement */}
              <UniversalCard
                layout="vertical"
                onClick={() => setActivePartnerCovenant("PartnersAgreement")}
                icon={t("icon_handshake", "handshake")}
                bannerTopLabel={`V${stableVersion} • ${t(
                  "partner_agreement_badge",
                  "Spoke Charter"
                )}`}
                bannerBottomLabel={t(
                  "partner_covenants_subtitle",
                  "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
                )}
                title={t("partner_agreement_title", "Partners Agreement")}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {`V${stableVersion} • ${t(
                      "partner_agreement_badge",
                      "Spoke Charter"
                    )}`}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("keepers_title", "Keepers Core")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>
                        {t("partner_covenants_open_btn", "Inspect Covenants")}
                      </span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "partner_agreement_desc",
                    "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                  )}
                </p>
              </UniversalCard>

              {/* Card 4: Compliance Protocol */}
              <UniversalCard
                layout="vertical"
                onClick={() => setActivePartnerCovenant("ComplianceProtocol")}
                icon={t("icon_verified_user", "verified_user")}
                bannerTopLabel={`V${stableVersion} • ${t(
                  "compliance_protocol_badge",
                  "Safety & Privacy"
                )}`}
                bannerBottomLabel={t(
                  "partner_covenants_subtitle",
                  "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
                )}
                title={t("compliance_protocol_title", "Compliance Protocol")}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {`V${stableVersion} • ${t(
                      "compliance_protocol_badge",
                      "Safety & Privacy"
                    )}`}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("keepers_title", "Keepers Core")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>
                        {t("partner_covenants_open_btn", "Inspect Covenants")}
                      </span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "compliance_protocol_desc",
                    "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                  )}
                </p>
              </UniversalCard>
            </div>
          </section>
        )}

        {/* =====================================================================
            TAB 8: LEGAL (System EULA • Terms of Service • Privacy Protocol)
           ===================================================================== */}
        {activeLandingTab === "legal" && (
          <section
            id="legal"
            className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
          >
            <CommandScreenSectionHeading
              title={t("landing_legal_tab", "Legal")}
              icon={t("icon_gavel", "gavel")}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              <UniversalCard
                layout="vertical"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("open_legal_doc", { detail: "eula" })
                  )
                }
                icon={t("icon_gavel", "gavel")}
                bannerTopLabel={t("legal_subtitle", "Sanctuary Foundry OS")}
                bannerBottomLabel={t("landing_eula", "System EULA")}
                title={t("landing_eula", "System EULA")}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t(
                      "subtitle_sanctuary_alerts",
                      "Official legal terms, privacy policy, and end-user license agreement."
                    )}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("legal_subtitle", "Sanctuary Foundry OS")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>{t("btn_view", "View")}</span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "subtitle_sanctuary_alerts",
                    "Official legal terms, privacy policy, and end-user license agreement."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("open_legal_doc", { detail: "terms" })
                  )
                }
                icon={t("icon_description", "description")}
                bannerTopLabel={t("legal_subtitle", "Sanctuary Foundry OS")}
                bannerBottomLabel={t("landing_terms", "Terms of Service")}
                title={t("landing_terms", "Terms of Service")}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t("legal_subtitle", "Sanctuary Foundry OS")}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("legal_subtitle", "Sanctuary Foundry OS")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>{t("btn_view", "View")}</span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "subtitle_sanctuary_alerts",
                    "Official legal terms, privacy policy, and end-user license agreement."
                  )}
                </p>
              </UniversalCard>

              <UniversalCard
                layout="vertical"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("open_legal_doc", { detail: "privacy" })
                  )
                }
                icon={t("icon_shield", "shield")}
                bannerTopLabel={t("legal_subtitle", "Sanctuary Foundry OS")}
                bannerBottomLabel={t("landing_privacy", "Privacy Protocol")}
                title={t("landing_privacy", "Privacy Protocol")}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t("legal_subtitle", "Sanctuary Foundry OS")}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("legal_subtitle", "Sanctuary Foundry OS")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>{t("btn_view", "View")}</span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "subtitle_sanctuary_alerts",
                    "Official legal terms, privacy policy, and end-user license agreement."
                  )}
                </p>
              </UniversalCard>
            </div>
          </section>
        )}

        {/* =====================================================================
            TAB 8: DONATIONS (Support Sanctuary OS & Partner Communities)
           ===================================================================== */}
        {activeLandingTab === "donations" && (
          <section
            id="donations"
            className="w-full flex flex-col gap-6 scroll-mt-24 z-10 relative"
          >
            <CommandScreenSectionHeading
              title={t(
                "landing_support_section_title",
                "Support Sanctuary OS & Partner Communities"
              )}
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              rightSlot={
                !isDesktop() && Boolean(session?.user?.id) ? (
                  <PanelHeaderGroup>
                    <PanelHeaderButton
                      icon={t("icon_verified", "verified")}
                      tooltip={t(
                        "supporter_web_verify_btn",
                        "Verify Completed Donation (+30 Days / $5)"
                      )}
                      onClick={() => setIsVerifyDrawerOpen(true)}
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
                        "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)",
                    }}
                  />
                  <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                    {t("icon_bolt", "bolt")}
                  </span>

                  {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px] animate-pulse">
                        {t("icon_bolt", "bolt")}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_warning", "warning")}
                      </span>
                      <span>{t("status", "Status")}</span>
                    </span>
                  </div>

                  {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
                  <div className="flex flex-col gap-1 relative z-10">
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                      {t(
                        "landing_banner_support_os_top",
                        "$5 = +30 Days Dev Builds"
                      )}
                    </span>
                    <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t(
                        "supporter_web_pending_title",
                        "Checkout Opened in Browser Tab"
                      )}
                    </h3>
                  </div>

                  {/* Row 3: Recessed Warning Callout Strip */}
                  <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                      {t("icon_verified", "verified")}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                      {t(
                        "supporter_liability_title",
                        "100% Non-Custodial • 0% Platform Fee"
                      )}
                    </span>
                  </div>

                  {/* Row 4: Body Notice */}
                  <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
                    {session?.user?.id
                      ? t(
                          "supporter_web_pending_desc",
                          "Every $5 contribution adds +30 days of Global Daily Dev Build access. Once completed, your account syncs automatically via webhook or you can verify your Stripe checkout receipt below."
                        )
                      : t(
                          "supporter_auth_required_for_dev_builds",
                          "Please sign in to your Sanctuary OS account first so your donation automatically stacks +30 days of Global Daily Dev Builds per $5."
                        )}
                  </p>

                  {/* Row 5: Action Footer */}
                  <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 relative z-10">
                    {session?.user?.id ? (
                      <ActionButton
                        variant="primary"
                        icon={t("icon_verified", "verified")}
                        label={t(
                          "supporter_web_verify_btn",
                          "Verify Completed Donation (+30 Days / $5)"
                        )}
                        onClick={() => setIsVerifyDrawerOpen(true)}
                        className="w-full justify-center"
                      />
                    ) : (
                      <ActionButton
                        variant="primary"
                        icon={t("icon_key", "key")}
                        label={t("sidebar_authenticate", "Authenticate")}
                        onClick={() => setView("auth")}
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
                        "radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 62%)",
                    }}
                  />
                  <span className="material-symbols-outlined absolute -right-3 -bottom-4 !text-[84px] text-[var(--warning)] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]">
                    {t("icon_gpp_maybe", "gpp_maybe")}
                  </span>

                  {/* Row 1: Warning Icon Box on Left + Status Chip on Right */}
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <div className="w-11 h-11 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_warning", "warning")}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider shrink-0">
                      <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <span>{t("supporter_rate_badge", "$5 = +30 Days")}</span>
                    </span>
                  </div>

                  {/* Row 2: Full-Width Overline + Title (Never Truncated) */}
                  <div className="flex flex-col gap-1 relative z-10">
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.14em] text-[var(--warning)] leading-snug">
                      {t(
                        "landing_banner_support_partner_top",
                        "100% Direct To Community"
                      )}
                    </span>
                    <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-snug m-0">
                      {t(
                        "supporter_liability_title",
                        "100% Non-Custodial • 0% Platform Fee"
                      )}
                    </h3>
                  </div>

                  {/* Row 3: Recessed Warning Callout Strip */}
                  <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-center gap-2 relative z-10">
                    <span className="material-symbols-outlined !text-[15px] text-[var(--warning)] shrink-0">
                      {t("icon_bolt", "bolt")}
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--warning)] leading-snug">
                      {t(
                        "landing_support_card_badge",
                        "0% Platform Fee • +30 Days Dev Builds Per $5"
                      )}
                    </span>
                  </div>

                  {/* Row 4: Body Notice */}
                  <p className="text-[11px] text-[var(--subtext)] opacity-90 leading-relaxed m-0 relative z-10">
                    {t(
                      "supporter_combined_partner_notice",
                      "Partner Communities run their own payment processors and receive 100% of your donation (0% platform fee, no chargebacks covered by Sanctuary OS). Payment webhooks automatically credit your account with +30 days per $5. If a community isn't listed yet, its Wayfinders can link their payment processor in Wayfinder Operations."
                    )}
                  </p>

                  {/* Row 5: Footer Row */}
                  <div className="pt-3 mt-auto border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2 text-[9px] font-mono font-bold text-[var(--subtext)] opacity-75 uppercase tracking-widest relative z-10">
                    <span>
                      {t(
                        "supporter_zero_fee_badge",
                        "0% Platform Fee • Non-Custodial"
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-[var(--warning)] shrink-0">
                      <span className="material-symbols-outlined !text-[13px]">
                        {t("icon_volunteer_activism", "volunteer_activism")}
                      </span>
                      <span>{t("supporter_rate_badge", "$5 = +30 Days")}</span>
                    </span>
                  </div>
                </div>
              )}

              <UniversalCard
                layout="vertical"
                onClick={() =>
                  handleDonateCardClick(
                    "keepers_core",
                    t("supporter_keepers_title", "Sanctuary OS (Keepers Core)"),
                    keepersConfig.keepers_donation_url || "sandbox://checkout"
                  )
                }
                icon={t("icon_rocket_launch", "rocket_launch")}
                bannerTopLabel={t(
                  "landing_banner_support_os_top",
                  "$5 = +30 Days Dev Builds"
                )}
                bannerBottomLabel={t(
                  "landing_banner_support_os_bottom",
                  "100% Core OS Development"
                )}
                title={t(
                  "supporter_keepers_title",
                  "Sanctuary OS (Keepers Core)"
                )}
                subtitle={
                  <span className="text-[10px] font-mono tracking-widest">
                    {t(
                      "supporter_keepers_subtitle",
                      "Core OS Infrastructure • 0% Platform Fee • Stacks Global Daily Dev Builds"
                    )}
                  </span>
                }
                className="h-full"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                      {t("supporter_rate_badge", "$5 = +30 Days")}
                    </span>
                    <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                      <span>
                        {t("supporter_keepers_btn", "Support Sanctuary OS")}
                      </span>
                      <span className="material-symbols-outlined !text-[14px]">
                        {isSandboxDonationUrl(keepersConfig.keepers_donation_url)
                          ? t("icon_science", "science")
                          : t("icon_arrow_forward", "arrow_forward")}
                      </span>
                    </span>
                  </div>
                }
              >
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed mt-2 opacity-80 line-clamp-3">
                  {t(
                    "supporter_keepers_desc",
                    "Directly support the Keepers building Sanctuary OS. Every $5 contribution dynamically stacks +30 days of Global Daily Dev Build access onto your account."
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
                      handleDonateCardClick(
                        g.schema_id || g.id,
                        g.name,
                        g.donation_url
                      )
                    }
                    icon={
                      g.icon
                        ? undefined
                        : t("icon_sports_esports", "sports_esports")
                    }
                    bannerTopLabel={t(
                      "landing_banner_support_partner_top",
                      "100% Direct To Community"
                    )}
                    bannerBottomLabel={`${g.name} • ${t("landing_banner_support_partner_bottom", "Server & {Mason} Support")}`}
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
                        {`${normalizeAllCapsForThemeCase((g.payment_processor || "Stripe").toUpperCase())} • ${t("supporter_zero_fee_badge", "0% Platform Fee • Non-Custodial")}`}
                      </span>
                    }
                    className="h-full"
                    footer={
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black capitalize tracking-widest opacity-60 text-[var(--subtext)] flex items-center gap-1.5">
                          {t("supporter_rate_badge", "$5 = +30 Days")}
                        </span>
                        <span className="text-[10px] font-black capitalize tracking-widest text-[var(--text)] opacity-80 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] transition-colors flex items-center gap-1 shrink-0">
                          <span>
                            {t(
                              "supporter_btn_donate_partner",
                              "Donate to Partner"
                            )}
                          </span>
                          <span className="material-symbols-outlined !text-[14px]">
                            {isSandboxDonationUrl(g.donation_url)
                              ? t("icon_science", "science")
                              : t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </span>
                      </div>
                    }
                  />
                ))}
            </div>
          </section>
        )}

        {/* =====================================================================
            DRAWER 1: CORE PLATFORM FEEDBACK & BUG SUPPORT (CHAT-LIKE GUIDED FLOW)
           ===================================================================== */}
        <SidePanel
          isOpen={isFeedbackDrawerOpen}
          onClose={() => setIsFeedbackDrawerOpen(false)}
          title={t("landing_feedback_drawer_title", "Core Platform Feedback & Bug Support")}
          subtitle={t(
            "landing_feedback_drawer_sub",
            "Routed Directly to Keepers Core • Core OS Scope Only"
          )}
          icon={
            feedbackStream === "Core Bug Report"
              ? t("icon_bug_report", "bug_report")
              : t("icon_rate_review", "rate_review")
          }
          widthClass="w-[90vw] md:w-[680px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={resetFeedbackFlow}
              />
              <PanelHeaderButton
                icon={
                  isSubmittingFeedback
                    ? t("icon_sync", "sync")
                    : t("icon_send", "send")
                }
                tooltip={t("landing_feedback_submit_btn", "Dispatch to Keepers Core")}
                onClick={handleSubmitPlatformFeedback}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_gpp_maybe", "gpp_maybe")}
              overline={t(
                "landing_feedback_drawer_sub",
                "Routed Directly to Keepers Core • Core OS Scope Only"
              )}
              title={t(
                "landing_feedback_scope_title",
                "Official Core Sanctuary Platform Channel Only — Not for Spoke {Mod} Issues or Drama"
              )}
              description={t(
                "landing_feedback_scope_desc",
                "This channel is strictly for positive or constructive feedback and bug reports regarding the Core Sanctuary OS Platform (Desktop App, Website, and Mobile PWA). Do not submit individual game spoke {mod} disputes, {mason} drama, or spoke moderation appeals here—use the Support desk inside that game's workspace."
              )}
              variant="warning"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("category", "Category")}
                  value={`${feedbackPlatform} • ${feedbackStream}`}
                  icon={
                    feedbackStream === "Core Bug Report"
                      ? t("icon_bug_report", "bug_report")
                      : t("icon_rate_review", "rate_review")
                  }
                  iconColorClass="text-[var(--accent)]"
                  colorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("step_progress", "Step Progress")}
                  value={`${Math.min(activeFbStep + 1, 4)} / 4`}
                  icon={t("icon_checklist", "checklist")}
                  iconColorClass="text-[var(--success)]"
                  colorClass="text-[var(--text)]"
                />
              </div>
            </SidePanelHeroCard>

            {/* STEP 1: TARGET PLATFORM & CHANNEL MODE */}
            {activeFbStep > 0 ? (
              <div
                onClick={() => setActiveFbStep(0)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    {t("step_completed", "Step Completed")}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {t("landing_feedback_form_platform", "Target Platform")}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {`${feedbackPlatform} • ${
                      feedbackStream === "Core Bug Report"
                        ? t("landing_fb_bug_title", "Core Platform Bug Reports")
                        : t("landing_feedback_card_title", "Submit Platform Feedback")
                    }`}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t("icon_edit", "edit")}
                </span>
              </div>
            ) : (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 1 / 4`}
                    </span>
                    {activeFbStep < maxFbStep && (
                      <button
                        type="button"
                        onClick={() => setActiveFbStep(maxFbStep)}
                        className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                      >
                        {t("jump_to_latest", "Jump to Latest")}
                        <span className="material-symbols-outlined !text-xs">
                          {t("icon_fast_forward", "fast_forward")}
                        </span>
                      </button>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_fb_step1_title", "Which platform and channel are you transmitting for?")}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-75">
                    {t(
                      "landing_fb_step1_sub",
                      "Select the target Core Sanctuary OS platform and whether you are sharing feedback or reporting a reproducible Core OS bug."
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("landing_feedback_form_platform", "Target Platform")}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      {
                        id: "Desktop App" as const,
                        icon: t("icon_desktop_windows", "desktop_windows"),
                        label: t("landing_fb_desktop_title", "Desktop App"),
                        sub: t("landing_fb_desktop_sub", "Native Windows & macOS Client"),
                      },
                      {
                        id: "Website" as const,
                        icon: t("icon_language", "language"),
                        label: t("landing_fb_web_title", "Website"),
                        sub: t("landing_fb_web_sub", "Cloud Portal & Browser Hub"),
                      },
                      {
                        id: "Mobile PWA" as const,
                        icon: t("icon_smartphone", "smartphone"),
                        label: t("landing_fb_pwa_title", "Mobile PWA"),
                        sub: t("landing_fb_pwa_sub", "iOS & Android Standalone App"),
                      },
                    ].map((plat) => {
                      const active = feedbackPlatform === plat.id;
                      return (
                        <button
                          key={plat.id}
                          type="button"
                          onClick={() => setFeedbackPlatform(plat.id)}
                          className={`p-3.5 rounded-2xl glass-surface border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                            active
                              ? "border-[var(--accent)] text-[var(--accent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {plat.icon}
                          </span>
                          <span className="text-xs font-black tracking-tight">
                            {plat.label}
                          </span>
                          <span className="text-[10px] text-[var(--subtext)] opacity-75">
                            {plat.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("landing_feedback_form_stream", "Feedback / Support Stream")}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (feedbackStream === "Core Bug Report") {
                          setFeedbackStream("Feature Request");
                        }
                      }}
                      className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                        feedbackStream !== "Core Bug Report"
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_rate_review", "rate_review")}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-black">
                          {t("landing_feedback_card_title", "Submit Platform Feedback")}
                        </span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-75">
                          {t("landing_banner_fb_bottom", "Feature Requests • Public & Beta Builds")}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFeedbackStream("Core Bug Report");
                        autoCapturePlatformDiagnostics();
                        setActiveFbStep(2);
                        setMaxFbStep((prev) => Math.max(prev, 2));
                      }}
                      className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                        feedbackStream === "Core Bug Report"
                          ? "border-[var(--danger)] text-[var(--danger)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_bug_report", "bug_report")}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-black">
                          {t("landing_fb_bug_title", "Core Platform Bug Reports")}
                        </span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-75">
                          {t("landing_fb_bug_sub", "Keepers Core Ticket System")}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_done", "done")}
                    label={t("confirm", "Confirm")}
                    onClick={() => {
                      setActiveFbStep(1);
                      setMaxFbStep((prev) => Math.max(prev, 1));
                    }}
                  />
                </div>
              </div>
            )}

            {/* STEP 2: STREAM & SENTIMENT (OR BUILD CHANNEL FOR BUGS) */}
            {maxFbStep >= 1 &&
              (activeFbStep > 1 ? (
                <div
                  onClick={() => setActiveFbStep(1)}
                  className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-xs">
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {t("landing_feedback_form_stream", "Feedback / Support Stream")}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {feedbackStream === "Core Bug Report"
                        ? `${feedbackStream} • ${feedbackBugChannel}`
                        : `${feedbackStream} • ${feedbackSentiment}`}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activeFbStep === 1 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                        {`${t("step", "STEP")} 2 / 4`}
                      </span>
                      {activeFbStep < maxFbStep && (
                        <button
                          type="button"
                          onClick={() => setActiveFbStep(maxFbStep)}
                          className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                        >
                          {t("jump_to_latest", "Jump to Latest")}
                          <span className="material-symbols-outlined !text-xs">
                            {t("icon_fast_forward", "fast_forward")}
                          </span>
                        </button>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {feedbackStream === "Core Bug Report"
                        ? t("landing_fb_step2_bug_title", "Which build stream & environment did the bug occur on?")
                        : t("landing_fb_step2_fb_title", "Select your feedback stream and sentiment")}
                    </h3>
                  </div>

                  {feedbackStream === "Core Bug Report" ? (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[
                          {
                            id: "Public Build" as const,
                            icon: t("icon_verified", "verified"),
                            label: t("landing_fb_stream_public", "Public Build Feedback"),
                          },
                          {
                            id: "Beta / Dev Build" as const,
                            icon: t("icon_science", "science"),
                            label: t("landing_fb_stream_beta", "Beta Build Feedback"),
                          },
                        ].map((b) => {
                          const active = feedbackBugChannel === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setFeedbackBugChannel(b.id)}
                              className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                                active
                                  ? "border-[var(--accent)] text-[var(--accent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[20px]">
                                {b.icon}
                              </span>
                              <span className="text-xs font-black">{b.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <UniversalInput
                        label={t(
                          "landing_feedback_form_diag",
                          "Build Version / OS / Diagnostic Notes (Optional)"
                        )}
                        value={feedbackDiagnostics}
                        onChange={setFeedbackDiagnostics}
                        placeholder={t(
                          "landing_feedback_form_diag_ph",
                          "e.g. Sanctuary OS v1.4 • Windows 11 / macOS / iOS PWA..."
                        )}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          {
                            id: "Feature Request" as const,
                            icon: t("icon_lightbulb", "lightbulb"),
                            label: t("landing_fb_stream_feature", "Feature Request"),
                          },
                          {
                            id: "Public Build Feedback" as const,
                            icon: t("icon_public", "public"),
                            label: t("landing_fb_stream_public", "Public Build Feedback"),
                          },
                          {
                            id: "Beta Build Feedback" as const,
                            icon: t("icon_science", "science"),
                            label: t("landing_fb_stream_beta", "Beta Build Feedback"),
                          },
                        ].map((s) => {
                          const active = feedbackStream === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setFeedbackStream(s.id)}
                              className={`p-3.5 rounded-2xl glass-surface border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                                active
                                  ? "border-[var(--accent)] text-[var(--accent)]"
                                  : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]"
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[20px]">
                                {s.icon}
                              </span>
                              <span className="text-xs font-black">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("landing_feedback_form_sentiment", "Sentiment")}
                        </span>
                        <div className="grid grid-cols-3 gap-2.5">
                          {[
                            {
                              id: "Positive" as const,
                              icon: t("icon_thumb_up", "thumb_up"),
                              label: t("landing_feedback_sentiment_pos", "Positive / Praise"),
                            },
                            {
                              id: "Constructive" as const,
                              icon: t("icon_lightbulb", "lightbulb"),
                              label: t("landing_feedback_sentiment_neu", "Constructive / Idea"),
                            },
                            {
                              id: "Critical" as const,
                              icon: t("icon_priority_high", "priority_high"),
                              label: t("landing_feedback_sentiment_neg", "Friction / Pain Point"),
                            },
                          ].map((sent) => {
                            const active = feedbackSentiment === sent.id;
                            return (
                              <button
                                key={sent.id}
                                type="button"
                                onClick={() => setFeedbackSentiment(sent.id)}
                                className={`p-3 rounded-xl glass-surface border flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                  active
                                    ? "border-[var(--accent)] text-[var(--accent)]"
                                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {sent.icon}
                                </span>
                                <span className="truncate">{sent.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
                      onClick={() => {
                        setActiveFbStep(2);
                        setMaxFbStep((prev) => Math.max(prev, 2));
                      }}
                    />
                  </div>
                </div>
              ) : null)}

            {/* STEP 3: SUMMARY TITLE & DETAILED DESCRIPTION */}
            {maxFbStep >= 2 &&
              (activeFbStep > 2 ? (
                <div
                  onClick={() => setActiveFbStep(2)}
                  className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-xs">
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {feedbackTitle}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {feedbackBody}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activeFbStep === 2 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 3 / 4`}
                    </span>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {t("landing_feedback_form_body", "Detailed Feedback or Reproduction Steps")}
                    </h3>
                  </div>

                  {feedbackStream === "Core Bug Report" && (
                    <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                            {t("icon_terminal", "terminal")}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-black text-[var(--text)] truncate">
                              {t(
                                "landing_bug_auto_telemetry_title",
                                "Auto-Captured Telemetry & Scrubbed Logs"
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                              {`${feedbackPlatform} • ${feedbackBugChannel} • ${
                                feedbackAutoLogs
                                  ? `${feedbackAutoLogs.split("\n").length} ${t("landing_bug_log_lines", "log lines attached")}`
                                  : t("landing_bug_logs_ready", "Diagnostics attached")
                              }`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                              {t("icon_upload_file", "upload_file")}
                            </span>
                            <span>{t("support_attach_log", "Attach Log File")}</span>
                            <input
                              type="file"
                              accept=".txt,.log,.html,.xml,.json"
                              onChange={handleManualLogUpload}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsEditingAutoTelemetry((prev) => !prev)}
                            className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {isEditingAutoTelemetry
                                ? t("icon_check", "check")
                                : t("icon_edit", "edit")}
                            </span>
                            <span>
                              {isEditingAutoTelemetry
                                ? t("done", "Done")
                                : t("landing_bug_btn_edit_telemetry", "Edit Details")}
                            </span>
                          </button>
                        </div>
                      </div>

                      {isEditingAutoTelemetry && (
                        <div className="flex flex-col gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                {t("landing_feedback_form_platform", "Target Platform")}
                              </span>
                              <CustomDropdown
                                disableTint={true}
                                value={feedbackPlatform}
                                onChange={(v: string[]) =>
                                  setFeedbackPlatform((v[0] as any) || "Website")
                                }
                                options={[
                                  {
                                    id: "Desktop App",
                                    label: t("landing_fb_desktop_title", "Desktop App"),
                                  },
                                  {
                                    id: "Website",
                                    label: t("landing_fb_web_title", "Website"),
                                  },
                                  {
                                    id: "Mobile PWA",
                                    label: t("landing_fb_pwa_title", "Mobile PWA"),
                                  },
                                ]}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                                {t("landing_feedback_form_stream", "Feedback / Support Stream")}
                              </span>
                              <CustomDropdown
                                disableTint={true}
                                value={feedbackBugChannel}
                                onChange={(v: string[]) =>
                                  setFeedbackBugChannel((v[0] as any) || "Public Build")
                                }
                                options={[
                                  {
                                    id: "Public Build",
                                    label: t("landing_fb_stream_public", "Public Build Feedback"),
                                  },
                                  {
                                    id: "Beta / Dev Build",
                                    label: t("landing_fb_stream_beta", "Beta Build Feedback"),
                                  },
                                ]}
                              />
                            </div>
                          </div>

                          <UniversalInput
                            label={t(
                              "landing_feedback_form_diag",
                              "Build Version / OS / Diagnostic Notes (Optional)"
                            )}
                            value={feedbackDiagnostics}
                            onChange={setFeedbackDiagnostics}
                            placeholder={t(
                              "landing_feedback_form_diag_ph",
                              "e.g. Sanctuary OS v1.4 • Windows 11 / macOS / iOS PWA..."
                            )}
                          />

                          <UniversalTextArea
                            label={t("dossier_attached_logs", "Attached Logs")}
                            value={feedbackAutoLogs}
                            onChange={setFeedbackAutoLogs}
                            placeholder={t(
                              "landing_bug_logs_edit_ph",
                              "Auto-captured system telemetry and scrubbed status logs..."
                            )}
                            className="min-h-[110px] font-mono text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <SidePanelTitleInput
                    label={`${t("landing_feedback_form_title", "Summary / Title")} *`}
                    icon={t("icon_title", "title")}
                    value={feedbackTitle}
                    onChange={setFeedbackTitle}
                    placeholder={t(
                      "landing_feedback_form_title_ph",
                      "Concise summary of your feedback, feature request, or core bug..."
                    )}
                  />

                  <UniversalTextArea
                    label={`${t("landing_feedback_form_body", "Detailed Feedback or Reproduction Steps")} *`}
                    value={feedbackBody}
                    onChange={setFeedbackBody}
                    placeholder={t(
                      "landing_feedback_form_body_ph",
                      "Describe what you love, what should be improved, or steps to reproduce a core platform bug..."
                    )}
                  />

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
                      disabled={!feedbackTitle.trim() || !feedbackBody.trim()}
                      onClick={() => {
                        setActiveFbStep(3);
                        setMaxFbStep((prev) => Math.max(prev, 3));
                      }}
                    />
                  </div>
                </div>
              ) : null)}

            {/* STEP 4: REVIEW & DISPATCH TO KEEPERS CORE */}
            {maxFbStep >= 3 && activeFbStep === 3 && (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] w-max">
                    {`${t("step", "STEP")} 4 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_feedback_submit_btn", "Dispatch to Keepers Core")}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-80">
                    {t(
                      "landing_feedback_drawer_sub",
                      "Routed Directly to Keepers Core • Core OS Scope Only"
                    )}
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_send", "send")}
                    label={
                      isSubmittingFeedback
                        ? t("btn_submitting", "Submitting...")
                        : t("landing_feedback_submit_btn", "Dispatch to Keepers Core")
                    }
                    onClick={handleSubmitPlatformFeedback}
                    disabled={isSubmittingFeedback || !feedbackTitle.trim() || !feedbackBody.trim()}
                  />
                </div>
              </div>
            )}
          </div>
        </SidePanel>

        {/* =====================================================================
            DRAWER 2: DIRECT HUMAN CONTACT SIDEPANEL (CHAT-LIKE GUIDED FLOW)
           ===================================================================== */}
        <SidePanel
          isOpen={isContactDrawerOpen}
          onClose={() => setIsContactDrawerOpen(false)}
          title={t("landing_contact_drawer_title", "Direct Human Contact — Keepers Core")}
          subtitle={t(
            "landing_contact_human_badge",
            "100% Human-Reviewed • Never Routed to AI Bots"
          )}
          icon={t("icon_support_agent", "support_agent")}
          widthClass="w-[90vw] md:w-[660px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={resetContactFlow}
              />
              <PanelHeaderButton
                icon={
                  isSubmittingContact
                    ? t("icon_sync", "sync")
                    : t("icon_send", "send")
                }
                tooltip={t("landing_contact_submit_btn", "Send Direct Human Inquiry")}
                onClick={handleSubmitDirectContact}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_verified_user", "verified_user")}
              overline={t(
                "landing_contact_human_badge",
                "100% Human-Reviewed • Never Routed to AI Bots"
              )}
              title={t("landing_contact_card_title", "Direct Human Contact")}
              description={t(
                "landing_contact_drawer_sub",
                "Every inquiry submitted here is reviewed directly by a human Keeper. No chatbots, no automated deflection."
              )}
              variant="accent"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("landing_contact_form_channel", "Inquiry Channel")}
                  value={contactChannel.replace("Direct Contact - ", "")}
                  icon={t("icon_mail", "mail")}
                  iconColorClass="text-[var(--accent)]"
                  colorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("step_progress", "Step Progress")}
                  value={`${Math.min(activeContactStep + 1, 3)} / 3`}
                  icon={t("icon_checklist", "checklist")}
                  iconColorClass="text-[var(--success)]"
                  colorClass="text-[var(--text)]"
                />
              </div>
            </SidePanelHeroCard>

            {/* STEP 1: INQUIRY CHANNEL & REPLY HANDLE */}
            {activeContactStep > 0 ? (
              <div
                onClick={() => setActiveContactStep(0)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    {t("step_completed", "Step Completed")}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {t("landing_contact_form_channel", "Inquiry Channel")}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {`${contactChannel} • ${contactReplyTo || session?.user?.email || ""}`}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t("icon_edit", "edit")}
                </span>
              </div>
            ) : (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t("step", "STEP")} 1 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_contact_form_channel", "Inquiry Channel")}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: "Direct Contact - General" as const,
                      icon: t("icon_mail", "mail"),
                      label: t("landing_contact_type_general", "General & Platform Inquiry"),
                    },
                    {
                      id: "Direct Contact - Legal & Compliance" as const,
                      icon: t("icon_gavel", "gavel"),
                      label: t("landing_contact_type_legal", "Legal, DMCA & Privacy Compliance"),
                    },
                    {
                      id: "Direct Contact - Security" as const,
                      icon: t("icon_shield_lock", "shield_lock"),
                      label: t("landing_contact_type_security", "Security & Vulnerability Disclosure"),
                    },
                  ].map((ch) => {
                    const active = contactChannel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setContactChannel(ch.id)}
                        className={`p-3.5 rounded-2xl glass-surface border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                          active
                            ? "border-[var(--accent)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {ch.icon}
                        </span>
                        <span className="text-xs font-black leading-snug">
                          {ch.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <UniversalInput
                  label={`${t("landing_contact_form_reply_to", "Your Reply Email or Discord Handle")} *`}
                  value={contactReplyTo || session?.user?.email || ""}
                  onChange={setContactReplyTo}
                  placeholder={t(
                    "landing_contact_form_reply_to_ph",
                    "you@example.com or @handle so a human Keeper can respond..."
                  )}
                />

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_done", "done")}
                    label={t("confirm", "Confirm")}
                    disabled={!(contactReplyTo.trim() || session?.user?.email)}
                    onClick={() => {
                      setActiveContactStep(1);
                      setMaxContactStep((prev) => Math.max(prev, 1));
                    }}
                  />
                </div>
              </div>
            )}

            {/* STEP 2: SUBJECT & MESSAGE */}
            {maxContactStep >= 1 &&
              (activeContactStep > 1 ? (
                <div
                  onClick={() => setActiveContactStep(1)}
                  className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-xs">
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {contactSubject}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {contactBody}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activeContactStep === 1 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 2 / 3`}
                    </span>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {t("landing_contact_form_body", "Message")}
                    </h3>
                  </div>

                  <SidePanelTitleInput
                    label={`${t("landing_contact_form_subject", "Subject")} *`}
                    icon={t("icon_subject", "subject")}
                    value={contactSubject}
                    onChange={setContactSubject}
                    placeholder={t(
                      "landing_contact_form_subject_ph",
                      "Subject of your inquiry..."
                    )}
                  />

                  <UniversalTextArea
                    label={`${t("landing_contact_form_body", "Message")} *`}
                    value={contactBody}
                    onChange={setContactBody}
                    placeholder={t(
                      "landing_contact_form_body_ph",
                      "Provide full context for the Keepers team..."
                    )}
                  />

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
                      disabled={!contactSubject.trim() || !contactBody.trim()}
                      onClick={() => {
                        setActiveContactStep(2);
                        setMaxContactStep((prev) => Math.max(prev, 2));
                      }}
                    />
                  </div>
                </div>
              ) : null)}

            {/* STEP 3: REVIEW & SEND */}
            {maxContactStep >= 2 && activeContactStep === 2 && (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] w-max">
                    {`${t("step", "STEP")} 3 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_contact_submit_btn", "Send Direct Human Inquiry")}
                  </h3>
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_send", "send")}
                    label={
                      isSubmittingContact
                        ? t("btn_submitting", "Submitting...")
                        : t("landing_contact_submit_btn", "Send Direct Human Inquiry")
                    }
                    onClick={handleSubmitDirectContact}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>
            )}
          </div>
        </SidePanel>

        {/* =====================================================================
            DRAWER 3: PARTNER GAME SPOKE APPLICATION PIPELINE (CHAT-LIKE GUIDED FLOW)
           ===================================================================== */}
        <SidePanel
          isOpen={isPartnerDrawerOpen}
          onClose={() => setIsPartnerDrawerOpen(false)}
          title={t("landing_partner_drawer_title", "Partner Game Spoke Application")}
          subtitle={t(
            "landing_partner_drawer_sub",
            "Readiness Gate & Technical Dossier • Reviewed by Keepers Core"
          )}
          icon={t("icon_handshake", "handshake")}
          widthClass="w-[90vw] md:w-[720px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={resetPartnerFlow}
              />
              <PanelHeaderButton
                icon={
                  isSubmittingPartner
                    ? t("icon_sync", "sync")
                    : t("icon_rocket_launch", "rocket_launch")
                }
                tooltip={t("landing_partner_submit_btn", "Submit Partner Spoke Dossier")}
                onClick={handleSubmitPartnerApplication}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_handshake", "handshake")}
              overline={t(
                "landing_partner_badge",
                "Readiness-Gated Dossier • Anti-Spam Verified"
              )}
              title={t("landing_partner_card_title", "Apply to Launch a Partner Game Spoke")}
              description={t(
                "landing_partner_card_desc",
                "Represent an established modding community and want to launch an official game workspace on Sanctuary OS? Complete our readiness check and submit your technical dossier to the Keepers."
              )}
              variant="accent"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("landing_partner_game_title", "Target Game Title & Engine")}
                  value={partnerGameTitle.trim() || "--"}
                  icon={t("icon_sports_esports", "sports_esports")}
                  iconColorClass="text-[var(--accent)]"
                  colorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("step_progress", "Step Progress")}
                  value={`${Math.min(activePartnerStep + 1, 4)} / 4`}
                  icon={t("icon_checklist", "checklist")}
                  iconColorClass="text-[var(--success)]"
                  colorClass="text-[var(--text)]"
                />
              </div>
            </SidePanelHeroCard>

            {/* STEP 1: 3-POINT READINESS GATE */}
            {activePartnerStep > 0 ? (
              <div
                onClick={() => setActivePartnerStep(0)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    {t("step_completed", "Step Completed")}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {t("landing_partner_gate_hdr", "Step 1: Partner Spoke Readiness Check")}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {t("landing_partner_badge", "Readiness-Gated Dossier • Anti-Spam Verified")}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t("icon_edit", "edit")}
                </span>
              </div>
            ) : (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t("step", "STEP")} 1 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_partner_gate_hdr", "Step 1: Partner Spoke Readiness Check")}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-80">
                    {t(
                      "landing_partner_gate_desc",
                      "To prevent spam and clarify what a Partner Spoke is, confirm all three operational requirements below to unlock the application dossier:"
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <SidePanelPillToggle
                    label={t(
                      "landing_partner_gate_1_title",
                      "Game Workspace — Not a Personal Creator Badge"
                    )}
                    description={t(
                      "landing_partner_gate_1_desc",
                      "I understand that a Partner Spoke is a dedicated Game Workspace (e.g. Skyrim, GTA V, Stardew Valley) governed by community Wayfinders & Architects—not an individual creator verification badge or mod help desk."
                    )}
                    icon={t("icon_dns", "dns")}
                    checked={partnerGate1}
                    onChange={setPartnerGate1}
                  />
                  <SidePanelPillToggle
                    label={t(
                      "landing_partner_gate_2_title",
                      "Active Moderation & Schema Commitment"
                    )}
                    description={t(
                      "landing_partner_gate_2_desc",
                      "We have a committed team (or established community) ready to maintain our game's Master Schema (extensions, install routes, load order) and moderate {Mod} submissions."
                    )}
                    icon={t("icon_groups", "groups")}
                    checked={partnerGate2}
                    onChange={setPartnerGate2}
                  />
                  <SidePanelPillToggle
                    label={t(
                      "landing_partner_gate_3_title",
                      "Anti-Malware & 0% Fee Charter Compliance"
                    )}
                    description={t(
                      "landing_partner_gate_3_desc",
                      "Our spoke will uphold Sanctuary OS's cryptographic hash verification, zero-malware tolerance, and non-custodial 0% platform fee policy."
                    )}
                    icon={t("icon_shield", "shield")}
                    checked={partnerGate3}
                    onChange={setPartnerGate3}
                  />

                  {/* REQUIRED PARTNER SPOKE COVENANTS CONTAINER */}
                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex flex-col gap-3.5 mt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
                          {t("icon_gavel", "gavel")}
                        </span>
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                          {t("", "Required Partner Spoke Covenants")}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                          partnerGate4
                            ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                            : "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {partnerGate4
                            ? t("icon_verified", "verified")
                            : t("icon_menu_book", "menu_book")}
                        </span>
                        <span>
                          {partnerGate4
                            ? t("verified", "Verified")
                            : t("", "Review & Agree")}
                        </span>
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--subtext)] opacity-85 leading-relaxed">
                      {t(
                        "",
                        "Click either covenant below to open the Partner Spoke Covenants reader on top of this application, review both bilateral agreements, and affirm compliance before continuing."
                      )}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewedPartnersDoc(true);
                          setActivePartnerCovenant("PartnersAgreement");
                        }}
                        className={`p-3.5 rounded-2xl glass-panel border text-left flex flex-col gap-2 cursor-pointer transition-all group ${
                          reviewedPartnersDoc || partnerGate4
                            ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]"
                            : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_handshake", "handshake")}
                            </span>
                            <span>{t("", "Covenant 01")}</span>
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                              reviewedPartnersDoc || partnerGate4
                                ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                                : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[11px]">
                              {reviewedPartnersDoc || partnerGate4
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_open_in_new", "open_in_new")}
                            </span>
                            <span>
                              {reviewedPartnersDoc || partnerGate4
                                ? t("", "Reviewed")
                                : t("btn_view", "View")}
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                            {t("", "Sanctuary Partners Agreement")}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80">
                            {t("", "Bilateral Sovereignty • 0% Platform Cut • Cut the Cord")}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setReviewedComplianceDoc(true);
                          setActivePartnerCovenant("ComplianceProtocol");
                        }}
                        className={`p-3.5 rounded-2xl glass-panel border text-left flex flex-col gap-2 cursor-pointer transition-all group ${
                          reviewedComplianceDoc || partnerGate4
                            ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)]"
                            : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_verified_user", "verified_user")}
                            </span>
                            <span>{t("", "Covenant 02")}</span>
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-transparent flex items-center gap-1 ${
                              reviewedComplianceDoc || partnerGate4
                                ? "border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]"
                                : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[11px]">
                              {reviewedComplianceDoc || partnerGate4
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_open_in_new", "open_in_new")}
                            </span>
                            <span>
                              {reviewedComplianceDoc || partnerGate4
                                ? t("", "Reviewed")
                                : t("btn_view", "View")}
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                            {t("", "Global Compliance Protocol")}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-80">
                            {t("", "Florida Tiers 0–5 • 21+17 Malware Heuristics")}
                          </span>
                        </div>
                      </button>
                    </div>

                    <SidePanelPillToggle
                      label={t(
                        "",
                        "I Have Reviewed & Agree to the Partners Agreement & Compliance Protocol"
                      )}
                      description={t(
                        "",
                        "I confirm that our community Wayfinders have read and agree to abide by the Sanctuary OS Partners Agreement and Global Compliance Protocol governing sovereign Partner Spokes."
                      )}
                      icon={t("icon_verified", "verified")}
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
                    icon={t("icon_done", "done")}
                    label={t("confirm", "Confirm")}
                    disabled={!partnerGate1 || !partnerGate2 || !partnerGate3 || !partnerGate4}
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
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {partnerGameTitle}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {`${partnerExtensions} • ${partnerLeadContact}`}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activePartnerStep === 1 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 2 / 4`}
                    </span>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {t("landing_partner_dossier_hdr", "Step 2: Spoke Technical & Community Dossier")}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <UniversalInput
                      label={`${t("landing_partner_game_title", "Target Game Title & Engine")} *`}
                      value={partnerGameTitle}
                      onChange={setPartnerGameTitle}
                      placeholder={t(
                        "landing_partner_game_title_ph",
                        "e.g. Fallout 4 (Creation Engine) / Terraria (tModLoader)"
                      )}
                    />
                    <UniversalInput
                      label={`${t("landing_partner_extensions", "Primary {Mod} File Formats / Extensions")} *`}
                      value={partnerExtensions}
                      onChange={setPartnerExtensions}
                      placeholder={t(
                        "landing_partner_extensions_ph",
                        "e.g. .esp, .ba2, .dll, .pak, .archive"
                      )}
                    />
                    <UniversalInput
                      label={`${t("landing_partner_lead_contact", "Lead Wayfinder Handle & Direct Contact (Discord / Email)")} *`}
                      value={partnerLeadContact}
                      onChange={setPartnerLeadContact}
                      placeholder={t(
                        "landing_partner_lead_contact_ph",
                        "e.g. @wayfinder (Discord) & lead@community.org"
                      )}
                    />
                    <UniversalInput
                      label={t(
                        "landing_partner_community_url",
                        "Existing Community, Forum, or GitHub URL"
                      )}
                      value={partnerCommunityUrl}
                      onChange={setPartnerCommunityUrl}
                      placeholder={t(
                        "landing_partner_community_url_ph",
                        "https://discord.gg/... or https://github.com/..."
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
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
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {`${partnerTeamSize} • ${partnerInfraReadiness}`}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {partnerVision}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activePartnerStep === 2 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 3 / 4`}
                    </span>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {t("landing_partner_vision", "Workspace Scope, Install Routing & Governance Plan")}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("landing_partner_team_size", "Active Moderation / Architect Team Size")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={partnerTeamSize}
                        onChange={(v: string[]) =>
                          setPartnerTeamSize(v[0] || "2-3 Moderators / Architects")
                        }
                        options={[
                          {
                            id: "Solo Founder (Recruiting Team)",
                            label: t("landing_partner_team_solo", "Solo Founder (Recruiting Team)"),
                          },
                          {
                            id: "2-3 Moderators / Architects",
                            label: t("landing_partner_team_small", "2–3 Moderators / Architects"),
                          },
                          {
                            id: "4-10 Established Staff",
                            label: t("landing_partner_team_medium", "4–10 Established Staff"),
                          },
                          {
                            id: "10+ Large Community Staff",
                            label: t("landing_partner_team_large", "10+ Large Community Staff"),
                          },
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("landing_partner_infra_ready", "Supabase Spoke Infrastructure Readiness")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={partnerInfraReadiness}
                        onChange={(v: string[]) =>
                          setPartnerInfraReadiness(
                            v[0] || "Ready to Provision Dedicated Supabase Project"
                          )
                        }
                        options={[
                          {
                            id: "Ready to Provision Dedicated Supabase Project",
                            label: t(
                              "landing_partner_infra_ready_yes",
                              "Ready to Provision Dedicated Supabase Project"
                            ),
                          },
                          {
                            id: "Need Keeper Guidance on Uplink Bootstrap",
                            label: t(
                              "landing_partner_infra_ready_help",
                              "Need Keeper Guidance on Uplink Bootstrap"
                            ),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {`${t("landing_partner_vision", "Workspace Scope, Install Routing & Governance Plan")} *`}
                      </label>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          partnerVision.trim().length >= 50
                            ? "text-[var(--success)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {`${partnerVision.trim().length} / 50+ ${t("landing_partner_min_chars_hint", "Minimum 50 characters required")}`}
                      </span>
                    </div>
                    <UniversalTextArea
                      value={partnerVision}
                      onChange={setPartnerVision}
                      placeholder={t(
                        "landing_partner_vision_ph",
                        "Describe how mods are installed for this game, your existing community or tooling experience, and how your team plans to curate and verify {Mods}..."
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
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
                    {`${t("step", "STEP")} 4 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_partner_submit_btn", "Submit Partner Spoke Dossier")}
                  </h3>
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_rocket_launch", "rocket_launch")}
                    label={
                      isSubmittingPartner
                        ? t("btn_submitting", "Submitting...")
                        : t("landing_partner_submit_btn", "Submit Partner Spoke Dossier")
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
            DRAWER 3B: STACKED PARTNER SPOKE COVENANTS PANEL (2 TABS ON TOP OF APPLY PANEL)
           ===================================================================== */}
        <SidePanel
          isOpen={!!activePartnerCovenant}
          onClose={() => setActivePartnerCovenant(null)}
          icon={
            activePartnerCovenant === "ComplianceProtocol"
              ? t("icon_verified_user", "verified_user")
              : t("icon_handshake", "handshake")
          }
          iconColorClass="text-[var(--accent)]"
          title={
            activePartnerCovenant === "ComplianceProtocol"
              ? syncedCovenantDocs.ComplianceProtocol?.title ||
                CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
              : syncedCovenantDocs.PartnersAgreement?.title ||
                CANONICAL_LEGAL_DOCS.PartnersAgreement.title
          }
          subtitle={t(
            "partner_covenants_subtitle",
            "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
          )}
          widthClass="w-[90vw] md:w-[760px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_check_circle", "check_circle")}
                tooltip={t(
                  "partner_covenants_agree_btn",
                  "Agree to Both Covenants & Continue"
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
                icon={t("icon_dashboard", "dashboard")}
                tooltip={t("tab_visual", "Visual")}
                onClick={() => setCovenantViewMode("ui")}
                variant={covenantViewMode === "ui" ? "accent" : "default"}
              />
              <PanelHeaderButton
                icon={t("icon_menu_book", "menu_book")}
                tooltip={t("btn_post", "Post")}
                onClick={() => setCovenantViewMode("normal")}
                variant={covenantViewMode === "normal" ? "accent" : "default"}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
            <StatTileCarousel innerClassName="px-0">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_handshake", "handshake")}
                label={`V${stableVersion} • ${t(
                  "partner_agreement_badge",
                  "Spoke Charter"
                )}`}
                number={t("partner_agreement_title", "Partners Agreement")}
                isActive={activePartnerCovenant === "PartnersAgreement"}
                onClick={() => {
                  setReviewedPartnersDoc(true);
                  setActivePartnerCovenant("PartnersAgreement");
                }}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_verified_user", "verified_user")}
                label={`V${stableVersion} • ${t(
                  "compliance_protocol_badge",
                  "Safety & Privacy"
                )}`}
                number={t("compliance_protocol_title", "Compliance Protocol")}
                isActive={activePartnerCovenant === "ComplianceProtocol"}
                onClick={() => {
                  setReviewedComplianceDoc(true);
                  setActivePartnerCovenant("ComplianceProtocol");
                }}
              />
            </StatTileCarousel>

            <SidePanelHeroCard
              icon={
                activePartnerCovenant === "ComplianceProtocol"
                  ? t("icon_verified_user", "verified_user")
                  : t("icon_handshake", "handshake")
              }
              overline={t(
                "partner_covenants_subtitle",
                "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
              )}
              title={
                activePartnerCovenant === "ComplianceProtocol"
                  ? syncedCovenantDocs.ComplianceProtocol?.title ||
                    CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
                  : syncedCovenantDocs.PartnersAgreement?.title ||
                    CANONICAL_LEGAL_DOCS.PartnersAgreement.title
              }
              description={
                activePartnerCovenant === "ComplianceProtocol"
                  ? t(
                      "compliance_protocol_desc",
                      "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                    )
                  : t(
                      "partner_agreement_desc",
                      "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                    )
              }
              badge={
                activePartnerCovenant === "ComplianceProtocol"
                  ? `V${stableVersion} • ${t(
                      "compliance_protocol_badge",
                      "Safety & Privacy"
                    )}`
                  : `V${stableVersion} • ${t(
                      "partner_agreement_badge",
                      "Spoke Charter"
                    )}`
              }
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            >
              <LegalDocVersionInfoBlock />
            </SidePanelHeroCard>

            <UniversalGroup
              title={
                activePartnerCovenant === "ComplianceProtocol"
                  ? syncedCovenantDocs.ComplianceProtocol?.title ||
                    CANONICAL_LEGAL_DOCS.ComplianceProtocol.title
                  : syncedCovenantDocs.PartnersAgreement?.title ||
                    CANONICAL_LEGAL_DOCS.PartnersAgreement.title
              }
              icon={t("icon_description", "description")}
            >
              {(() => {
                const activeBody =
                  activePartnerCovenant === "ComplianceProtocol"
                    ? syncedCovenantDocs.ComplianceProtocol?.content ||
                      CANONICAL_LEGAL_DOCS.ComplianceProtocol.bundledContent
                    : syncedCovenantDocs.PartnersAgreement?.content ||
                      CANONICAL_LEGAL_DOCS.PartnersAgreement.bundledContent;
                return covenantViewMode === "ui" ? (
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
            DRAWER 3C: ABOUT PARTNER SPOKES & SETUP GUIDE SIDEPANEL
           ===================================================================== */}
        <SidePanel
          isOpen={isAboutPartnerDrawerOpen}
          onClose={() => setIsAboutPartnerDrawerOpen(false)}
          title={t(
            "landing_partners_about_drawer_title",
            "Sanctuary OS — Partner Spoke Architecture & Guide"
          )}
          subtitle={t(
            "landing_partners_about_drawer_sub",
            "100% Data Sovereignty • Turnkey Setup • Bilateral Uplink • Governance"
          )}
          icon={t("icon_menu_book", "menu_book")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[90vw] md:w-[740px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_gavel", "gavel")}
                tooltip={t("partner_covenants_open_btn", "Inspect Covenants")}
                onClick={() => setActivePartnerCovenant("PartnersAgreement")}
              />
              <PanelHeaderButton
                icon={t("icon_rocket_launch", "rocket_launch")}
                variant="accent"
                tooltip={t(
                  "landing_partner_btn_open",
                  "Start Partner Spoke Application"
                )}
                onClick={() => {
                  setIsAboutPartnerDrawerOpen(false);
                  setActivePartnerStep(0);
                  setMaxPartnerStep(0);
                  setIsPartnerDrawerOpen(true);
                }}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 pb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DashboardStatTile
                variant="filter"
                icon={t("icon_handshake", "handshake")}
                label={t("landing_partners_tab_what", "What is a Partner")}
                subtext={t(
                  "landing_partners_tab_what_sub",
                  "100% Sovereignty & 0% Tax"
                )}
                isActive={aboutPartnerTab === "what"}
                onClick={() => setAboutPartnerTab("what")}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_dns", "dns")}
                label={t("landing_partners_tab_setup", "How to Set Up")}
                subtext={t(
                  "landing_partners_tab_setup_sub",
                  "Supabase & schema.sql"
                )}
                isActive={aboutPartnerTab === "setup"}
                onClick={() => setAboutPartnerTab("setup")}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_hub", "hub")}
                label={t("landing_partners_tab_connect", "How to Connect")}
                subtext={t(
                  "landing_partners_tab_connect_sub",
                  "SANCTUARY-UPLINK:// Handshake"
                )}
                isActive={aboutPartnerTab === "connect"}
                onClick={() => setAboutPartnerTab("connect")}
              />
              <DashboardStatTile
                variant="filter"
                icon={t("icon_security", "security")}
                label={t("landing_partners_tab_maintain", "How to Maintain")}
                subtext={t(
                  "landing_partners_tab_maintain_sub",
                  "Wayfinder Operations & Perks"
                )}
                isActive={aboutPartnerTab === "maintain"}
                onClick={() => setAboutPartnerTab("maintain")}
              />
            </div>

            <SidePanelHeroCard
              icon={t("icon_handshake", "handshake")}
              overline={t(
                "landing_partners_about_sub",
                "Architecture • Supabase Bootstrap • Uplink Handshake • Governance"
              )}
              title={t(
                "landing_partners_about_title",
                "About Partner Spokes & Setup Guide"
              )}
              description={t(
                "landing_partners_about_desc",
                "Learn what a Sanctuary OS Partner Spoke is, how 100% data sovereignty and 0% non-custodial donations work, and how to provision, connect, and maintain a community game workspace."
              )}
              badge={`V${stableVersion}`}
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            >
              <LegalDocVersionInfoBlock />
            </SidePanelHeroCard>

            {aboutPartnerTab === "what" && (
              <UniversalGroup
                title={t("landing_partners_tab_what", "What is a Partner")}
                icon={t("icon_handshake", "handshake")}
              >
                <div className="flex flex-col gap-4">
                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_what_h1",
                        "1. Sovereign Game Workspace — Never a Central Silo"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_what_p1",
                        "A Sanctuary OS Partner Spoke is an independent, community-governed game workspace (e.g. Skyrim, GTA V, Stardew Valley, Baldur's Gate 3). Unlike legacy modding portals, your community owns its own Supabase PostgreSQL database, Master Schema, {Mod} registry, and Chameleon themes. Either side can sever the uplink ('Cut the Cord') at any time with zero data loss."
                      )}
                    </p>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_what_h2",
                        "2. Zero Platform Tax (0% Cut) & Mutual Supporter Perks"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_what_p2",
                        "Sanctuary Foundry takes 0% of {Mason} or Partner Community revenue. Partner Spokes link their own non-custodial Stripe, Ko-fi, or Patreon checkout directly in Wayfinder Operations, and every $5 a {Citizen} contributes to a verified Partner Spoke automatically grants them +30 days of Global Daily Dev Build access across Sanctuary OS."
                      )}
                    </p>
                  </div>
                </div>
              </UniversalGroup>
            )}

            {aboutPartnerTab === "setup" && (
              <UniversalGroup
                title={t("landing_partners_tab_setup", "How to Set Up")}
                icon={t("icon_dns", "dns")}
              >
                <div className="flex flex-col gap-4">
                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_setup_h1",
                        "1. Provision Your Supabase Instance & Run schema.sql"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_setup_p1",
                        "Create a dedicated Supabase project owned by your community team. Open the SQL Editor and execute Sanctuary OS's 36-table schema.sql bootstrap script to initialize profiles, {mods}, {mod}_versions, {masons}, {blueprints}, audit_logs, and row-level security (RLS) policies."
                      )}
                    </p>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_setup_h2",
                        "2. Configure Your Game's Master Schema"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_setup_p2",
                        "Define your game's supported {Mod} file extensions (.package, .ts4script, .pak, .esp, .rpf, .asi), installation target folders, load-order rules, and conflict radar heuristics inside your Master Schema JSON."
                      )}
                    </p>
                  </div>
                </div>
              </UniversalGroup>
            )}

            {aboutPartnerTab === "connect" && (
              <UniversalGroup
                title={t("landing_partners_tab_connect", "How to Connect")}
                icon={t("icon_hub", "hub")}
              >
                <div className="flex flex-col gap-4">
                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_connect_h1",
                        "1. Generate Your SANCTUARY-UPLINK:// Handshake Token"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_connect_p1",
                        "Once your Partner Spoke application is approved by Keepers Core, open Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance to generate your SANCTUARY-UPLINK:// bundle containing your Project URL, Anon Key, and Service Role Key."
                      )}
                    </p>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_connect_h2",
                        "2. Cryptographic Verification & Live Hub Mounting"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_connect_p2",
                        "Keepers Core runs a live schema and RLS handshake check against your Spoke. Once verified, your workspace goes live on the Sanctuary OS Hub switcher for Desktop, Web, and Mobile PWA {Citizens}."
                      )}
                    </p>
                  </div>
                </div>
              </UniversalGroup>
            )}

            {aboutPartnerTab === "maintain" && (
              <UniversalGroup
                title={t("landing_partners_tab_maintain", "How to Maintain")}
                icon={t("icon_security", "security")}
              >
                <div className="flex flex-col gap-4">
                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_maintain_h1",
                        "1. Wayfinder Operations, Key Rotation & Oversight"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_maintain_p1",
                        "Manage your workspace day-to-day from Wayfinder Operations: appoint Architects and Oversight moderators, verify {Masons}, triage community reports, review heuristic malware flags, and rotate your Supabase keys anytime with zero downtime."
                      )}
                    </p>
                  </div>

                  <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                    <h4 className="text-sm font-black text-[var(--text)]">
                      {t(
                        "landing_partners_maintain_h2",
                        "2. Append-Only Audit Integrity & Cut-the-Cord Freedom"
                      )}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-90 leading-relaxed">
                      {t(
                        "landing_partners_maintain_p2",
                        "Every administrative action is recorded in your Spoke's immutable audit_logs table. If your community ever wishes to operate standalone, click 'Cut the Cord' in Spoke Control to sever the Hub uplink immediately while keeping 100% of your database."
                      )}
                    </p>
                  </div>
                </div>
              </UniversalGroup>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <ActionButton
                variant="glass"
                icon={t("icon_gavel", "gavel")}
                label={t("partner_covenants_open_btn", "Inspect Covenants")}
                onClick={() => setActivePartnerCovenant("PartnersAgreement")}
              />
              <ActionButton
                variant="primary"
                icon={t("icon_rocket_launch", "rocket_launch")}
                label={t(
                  "landing_partner_btn_open",
                  "Start Partner Spoke Application"
                )}
                onClick={() => {
                  setIsAboutPartnerDrawerOpen(false);
                  setActivePartnerStep(0);
                  setMaxPartnerStep(0);
                  setIsPartnerDrawerOpen(true);
                }}
              />
            </div>
          </div>
        </SidePanel>

        {/* =====================================================================
            DRAWER 3D: APPLY TO JOIN KEEPERS CORE SIDEPANEL (GUIDED FLOW)
           ===================================================================== */}
        <SidePanel
          isOpen={isKeeperAppDrawerOpen}
          onClose={() => setIsKeeperAppDrawerOpen(false)}
          title={t("landing_keeper_drawer_title", "Apply to Join Keepers Core")}
          subtitle={t(
            "landing_keeper_drawer_sub",
            "Core Platform Stewardship • Security & Triage Clearance Dossier"
          )}
          icon={t("icon_admin_panel_settings", "admin_panel_settings")}
          widthClass="w-[90vw] md:w-[700px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_restart_alt", "restart_alt")}
                tooltip={t("reset", "Reset")}
                onClick={resetKeeperFlow}
              />
              <PanelHeaderButton
                icon={
                  isSubmittingKeeper
                    ? t("icon_sync", "sync")
                    : t("icon_rocket_launch", "rocket_launch")
                }
                tooltip={t("landing_keeper_submit_btn", "Submit Keeper Application")}
                onClick={handleSubmitKeeperApplication}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 pb-8">
            <SidePanelHeroCard
              icon={t("icon_admin_panel_settings", "admin_panel_settings")}
              overline={t("keepers_title", "Keepers Core")}
              title={t("landing_keeper_apply_title", "Apply to Join Keepers Core")}
              description={t(
                "landing_keeper_apply_desc",
                "Want to help safeguard Sanctuary OS, maintain global heuristic malware signatures, review Partner Spoke applications, or triage core platform telemetry? Submit a Keeper application directly to Keepers Core."
              )}
              variant="accent"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("landing_keeper_focus_label", "Primary Keeper Focus")}
                  value={keeperFocus}
                  icon={t("icon_shield_lock", "shield_lock")}
                  iconColorClass="text-[var(--accent)]"
                  colorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("step_progress", "Step Progress")}
                  value={`${Math.min(activeKeeperStep + 1, 3)} / 3`}
                  icon={t("icon_checklist", "checklist")}
                  iconColorClass="text-[var(--success)]"
                  colorClass="text-[var(--text)]"
                />
              </div>
            </SidePanelHeroCard>

            {/* STEP 1: STEWARDSHIP & SECURITY COVENANTS */}
            {activeKeeperStep > 0 ? (
              <div
                onClick={() => setActiveKeeperStep(0)}
                className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-xs">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                    {t("step_completed", "Step Completed")}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {t(
                      "landing_keeper_gate_hdr",
                      "Step 1: Keeper Stewardship & Security Covenants"
                    )}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {t("verified", "Verified")}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t("icon_edit", "edit")}
                </span>
              </div>
            ) : (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t("step", "STEP")} 1 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t(
                      "landing_keeper_gate_hdr",
                      "Step 1: Keeper Stewardship & Security Covenants"
                    )}
                  </h3>
                  <p className="text-xs text-[var(--subtext)] opacity-80">
                    {t(
                      "landing_keeper_gate_desc",
                      "Keepers hold global stewardship over Sanctuary OS's core infrastructure, heuristic malware definitions, and Partner Spoke handshakes. Confirm all three covenants below:"
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <SidePanelPillToggle
                    label={t(
                      "landing_keeper_gate_1_title",
                      "Core Platform Stewardship (Global Scope)"
                    )}
                    description={t(
                      "landing_keeper_gate_1_desc",
                      "I understand that Keepers Core governs Sanctuary OS's global infrastructure, heuristic security engine, and Partner Spoke onboarding—distinct from moderating a single game workspace."
                    )}
                    icon={t("icon_admin_panel_settings", "admin_panel_settings")}
                    checked={keeperGate1}
                    onChange={setKeeperGate1}
                  />
                  <SidePanelPillToggle
                    label={t(
                      "landing_keeper_gate_2_title",
                      "Zero-Trust Security & Anti-Malware Integrity"
                    )}
                    description={t(
                      "landing_keeper_gate_2_desc",
                      "I commit to upholding strict cryptographic verification, impartial malware signature auditing, and append-only audit log transparency across all Keepers Core operations."
                    )}
                    icon={t("icon_shield_lock", "shield_lock")}
                    checked={keeperGate2}
                    onChange={setKeeperGate2}
                  />
                  <SidePanelPillToggle
                    label={t(
                      "landing_keeper_gate_3_title",
                      "Human-First Triage & Privacy Respect"
                    )}
                    description={t(
                      "landing_keeper_gate_3_desc",
                      "I will review {Citizen} escalations, bug telemetry, and Partner dossiers with genuine human care and zero tolerance for data harvesting."
                    )}
                    icon={t("icon_verified_user", "verified_user")}
                    checked={keeperGate3}
                    onChange={setKeeperGate3}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_done", "done")}
                    label={t("confirm", "Confirm")}
                    disabled={!keeperGate1 || !keeperGate2 || !keeperGate3}
                    onClick={() => {
                      setActiveKeeperStep(1);
                      setMaxKeeperStep((prev) => Math.max(prev, 1));
                    }}
                  />
                </div>
              </div>
            )}

            {/* STEP 2: SPECIALIZATION, IDENTITY & EXPERIENCE */}
            {maxKeeperStep >= 1 &&
              (activeKeeperStep > 1 ? (
                <div
                  onClick={() => setActiveKeeperStep(1)}
                  className="glass-panel p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center justify-between cursor-pointer group hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-xs">
                        {t("icon_check_circle", "check_circle")}
                      </span>
                      {t("step_completed", "Step Completed")}
                    </span>
                    <h4 className="text-sm font-black text-[var(--text)] truncate">
                      {`${keeperHandle || session?.user?.email || ""} • ${keeperFocus}`}
                    </h4>
                    <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                      {keeperExperience}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                    {t("icon_edit", "edit")}
                  </span>
                </div>
              ) : activeKeeperStep === 1 ? (
                <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t("step", "STEP")} 2 / 3`}
                    </span>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                      {t(
                        "landing_keeper_step2_hdr",
                        "Step 2: Specialization, Identity & Experience"
                      )}
                    </h3>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("landing_keeper_focus_label", "Primary Keeper Focus")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        {
                          id: "Heuristic Malware & Security Oversight",
                          icon: t("icon_shield_lock", "shield_lock"),
                          label: t(
                            "landing_keeper_focus_security",
                            "Heuristic Malware & Security Oversight"
                          ),
                        },
                        {
                          id: "Core Engineering (Rust / TypeScript / Schemas)",
                          icon: t("icon_code", "code"),
                          label: t(
                            "landing_keeper_focus_eng",
                            "Core Engineering (Rust / TypeScript / Schemas)"
                          ),
                        },
                        {
                          id: "Platform Support, Bug Triage & Directives",
                          icon: t("icon_support_agent", "support_agent"),
                          label: t(
                            "landing_keeper_focus_triage",
                            "Platform Support, Bug Triage & Directives"
                          ),
                        },
                        {
                          id: "Partner Spoke Onboarding & Governance",
                          icon: t("icon_handshake", "handshake"),
                          label: t(
                            "landing_keeper_focus_spokes",
                            "Partner Spoke Onboarding & Governance"
                          ),
                        },
                      ].map((opt) => {
                        const active = keeperFocus === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setKeeperFocus(opt.id)}
                            className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                              active
                                ? "border-[var(--accent)] text-[var(--accent)]"
                                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]"
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px] shrink-0">
                              {opt.icon}
                            </span>
                            <span className="text-xs font-black leading-snug">
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <UniversalInput
                      label={`${t("landing_keeper_handle_label", "Your Sanctuary Handle or Name")} *`}
                      value={keeperHandle}
                      onChange={setKeeperHandle}
                      placeholder="@handle"
                    />
                    <UniversalInput
                      label={`${t("landing_keeper_contact_label", "Direct Email or Discord Handle")} *`}
                      value={keeperContact}
                      onChange={setKeeperContact}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <UniversalInput
                      label={t(
                        "landing_keeper_portfolio_label",
                        "GitHub, Portfolio, or Community Profile URL (Optional)"
                      )}
                      value={keeperPortfolio}
                      onChange={setKeeperPortfolio}
                      placeholder="https://github.com/..."
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("landing_keeper_availability_label", "Weekly Availability")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={keeperAvailability}
                        onChange={(v: string[]) =>
                          setKeeperAvailability(v[0] || "5-10 Hours / Week")
                        }
                        options={[
                          {
                            id: "2-5 Hours / Week",
                            label: "2–5 Hours / Week",
                          },
                          {
                            id: "5-10 Hours / Week",
                            label: "5–10 Hours / Week",
                          },
                          {
                            id: "10+ Hours / Week",
                            label: "10+ Hours / Week",
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {`${t("landing_keeper_exp_label", "Relevant Technical / Moderation Experience & Motivation (Min 40 chars)")} *`}
                      </label>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          keeperExperience.trim().length >= 40
                            ? "text-[var(--success)]"
                            : "text-[var(--warning)]"
                        }`}
                      >
                        {`${keeperExperience.trim().length} / 40+`}
                      </span>
                    </div>
                    <UniversalTextArea
                      value={keeperExperience}
                      onChange={setKeeperExperience}
                      placeholder={t(
                        "landing_keeper_exp_ph",
                        "Share your background in security, modding tools, Rust/TypeScript, schema design, or community stewardship..."
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <ActionButton
                      variant="primary"
                      icon={t("icon_done", "done")}
                      label={t("confirm", "Confirm")}
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

            {/* STEP 3: REVIEW & SUBMIT KEEPER APPLICATION */}
            {maxKeeperStep >= 2 && activeKeeperStep === 2 && (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] w-max">
                    {`${t("step", "STEP")} 3 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t("landing_keeper_submit_btn", "Submit Keeper Application")}
                  </h3>
                </div>

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t("icon_rocket_launch", "rocket_launch")}
                    label={
                      isSubmittingKeeper
                        ? t("btn_submitting", "Submitting...")
                        : t("landing_keeper_submit_btn", "Submit Keeper Application")
                    }
                    onClick={handleSubmitKeeperApplication}
                    disabled={isSubmittingKeeper}
                  />
                </div>
              </div>
            )}
          </div>
        </SidePanel>

        {/* =====================================================================
            DRAWER 4: MY PLATFORM TICKETS & FEEDBACK SIDEPANEL
           ===================================================================== */}
        <SidePanel
          isOpen={isMyTicketsDrawerOpen}
          onClose={() => setIsMyTicketsDrawerOpen(false)}
          title={t("landing_my_platform_tickets", "My Platform Tickets & Feedback")}
          subtitle={t("keepers_title", "Keepers Core")}
          icon={t("icon_inbox", "inbox")}
          widthClass="w-[90vw] md:w-[680px]"
        >
          <div className="flex flex-col gap-3 pb-6">
            {myPlatformTickets.length === 0 ? (
              <EmptyState
                icon={t("icon_inbox", "inbox")}
                title={t("no_tickets", "No Support Tickets")}
                className="py-12"
              />
            ) : (
              myPlatformTickets.map((tk) => (
                <UniversalCard
                  key={tk.id}
                  layout="vertical"
                  onClick={() => setSelectedMyTicket(tk)}
                  icon={t("icon_receipt_long", "receipt_long")}
                  title={tk.title}
                  subtitle={`${tk.ticket_type || "Feedback"} • ${new Date(tk.created_at).toLocaleDateString()}`}
                  footer={
                    <div className="flex items-center justify-between w-full text-[10px] font-mono font-bold text-[var(--subtext)]">
                      <span>{String(tk.status || "NEW").toUpperCase()}</span>
                      <span className="text-[var(--accent)]">
                        {`${(tk.metadata?.replies || []).length} ${t("tab_posts", "{Dispatches}")} →`}
                      </span>
                    </div>
                  }
                >
                  <p className="text-[11px] text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed mt-1">
                    {tk.description}
                  </p>
                </UniversalCard>
              ))
            )}
          </div>
        </SidePanel>

        <TicketDossierSidePanel
          isOpen={!!selectedMyTicket}
          onClose={() => setSelectedMyTicket(null)}
          ticket={selectedMyTicket}
          tableName="keeper_tickets"
          isReadOnly={false}
          canReply={true}
          onReplyAdded={() => {
            fetchMyPlatformTickets();
          }}
        />

        <SidePanel
          isOpen={isVerifyDrawerOpen}
          onClose={() => setIsVerifyDrawerOpen(false)}
          title={t("supporter_web_verify_btn", "Verify Completed Donation (+30 Days / $5)")}
          subtitle={t("landing_support_card_badge", "0% Platform Fee • +30 Days Dev Builds Per $5")}
          icon={t("icon_verified", "verified")}
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={
                  isVerifyingDonation
                    ? t("icon_sync", "sync")
                    : t("icon_verified", "verified")
                }
                tooltip={t("supporter_web_claim_btn", "Verify & Unlock Dev Builds")}
                onClick={handleVerifyWebDonation}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-5">
            <SidePanelHeroCard
              icon={t("icon_volunteer_activism", "volunteer_activism")}
              overline={
                isDevUnlocked
                  ? `${Math.max(1, Math.ceil((devBuildUntil - Math.floor(Date.now() / 1000)) / 86400))} ${t("supporter_days_remaining_suffix", "Days Remaining")}`
                  : t("supporter_rate_badge", "$5 = +30 Days")
              }
              title={
                pendingWebCheckout?.targetName ||
                t("supporter_keepers_title", "Sanctuary OS (Keepers Core)")
              }
              description={t(
                "supporter_web_pending_desc",
                "Every $5 contribution adds +30 days of Global Daily Dev Build access. Once completed, your account syncs automatically via webhook or you can verify your Stripe checkout receipt below.",
              )}
              variant={isDevUnlocked ? "success" : "accent"}
            />

            <SidePanelTitleInput
              label={t("supporter_web_receipt_label", "Stripe Checkout URL or Receipt ID")}
              icon={t("icon_receipt_long", "receipt_long")}
              value={verifyReceiptInput}
              onChange={setVerifyReceiptInput}
              placeholder={t(
                "supporter_web_receipt_ph",
                "Paste checkout URL (checkout.stripe.com/c/pay/cs_...) or receipt ID...",
              )}
            />

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-1">
                {t("supporter_web_amount_label", "Contribution Amount (USD)")}
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
                          ? "border-[var(--accent)] text-[var(--accent)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="text-sm font-black">{`$${amt}`}</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider opacity-80">
                        {`+${days} ${t("supporter_celebration_days_unit", "Days")}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </SidePanel>

        <WebLegalViewer />
      </CommandScreenLayout>

      <footer className="w-full py-12 mt-8 flex flex-col md:flex-row items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 max-md:pb-[100px] gap-6 scroll-mt-24">
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

