import { supabaseAuth, getBrandConfig } from '../../supabase';
import { isDesktop } from '../../utils/envUtils';
import packageJson from '../../../package.json';
import { isClientOnDevBuildStream } from '../../utils/supporterManager';

export function useWebLandingSubmissionFlows({
  t,
  session,
  pushToast,
  isStandalone,
  setIsFeedbackDrawerOpen,
  setFeedbackPlatform,
  feedbackPlatform,
  setFeedbackStream,
  feedbackStream,
  setFeedbackSentiment,
  feedbackSentiment,
  setFeedbackBugChannel,
  feedbackBugChannel,
  setFeedbackTitle,
  feedbackTitle,
  setFeedbackBody,
  feedbackBody,
  setFeedbackDiagnostics,
  feedbackDiagnostics,
  setFeedbackAutoLogs,
  feedbackAutoLogs,
  setIsEditingAutoTelemetry,
  setActiveFbStep,
  setMaxFbStep,
  setIsSubmittingFeedback,
  setIsContactDrawerOpen,
  setContactChannel,
  contactChannel,
  contactReplyTo,
  setContactSubject,
  contactSubject,
  setContactBody,
  contactBody,
  setActiveContactStep,
  setMaxContactStep,
  setIsSubmittingContact,
  setIsPartnerDrawerOpen,
  setPartnerGate1,
  partnerGate1,
  setPartnerGate2,
  partnerGate2,
  setPartnerGate3,
  partnerGate3,
  setPartnerGate4,
  partnerGate4,
  setPartnerGameTitle,
  partnerGameTitle,
  setPartnerExtensions,
  partnerExtensions,
  setPartnerLeadContact,
  partnerLeadContact,
  setPartnerCommunityUrl,
  partnerCommunityUrl,
  partnerTeamSize,
  partnerInfraReadiness,
  setPartnerVision,
  partnerVision,
  setActivePartnerStep,
  setMaxPartnerStep,
  setIsSubmittingPartner,
  setIsKeeperAppDrawerOpen,
  setKeeperGate1,
  keeperGate1,
  setKeeperGate2,
  keeperGate2,
  setKeeperGate3,
  keeperGate3,
  setKeeperFocus,
  keeperFocus,
  setKeeperHandle,
  keeperHandle,
  setKeeperContact,
  keeperContact,
  setKeeperPortfolio,
  keeperPortfolio,
  setKeeperAvailability,
  keeperAvailability,
  setKeeperExperienceLevel,
  keeperExperienceLevel,
  setKeeperTimezone,
  keeperTimezone,
  setKeeperSkills,
  keeperSkills,
  setKeeperExperience,
  keeperExperience,
  setKeeperMotivation,
  keeperMotivation,
  setActiveKeeperStep,
  setMaxKeeperStep,
  setIsSubmittingKeeper,
  setActivePartnerCovenant,
  setReviewedPartnersDoc,
  setReviewedComplianceDoc,
  autoCapturePlatformDiagnostics,
  fetchMyPlatformTickets,
}: any) {
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

      const brand = getBrandConfig();
      const appTitle = brand.appTitle || 'Sanctuary OS';
      const combinedLogs =
        feedbackStream === 'Core Bug Report'
          ? feedbackAutoLogs.trim() || feedbackDiagnostics.trim()
          : feedbackDiagnostics.trim()
            ? `--- TELEMETRY: ${appTitle} Logs (OS) ---\nPlatform Summary: ${feedbackDiagnostics.trim()}\nPlatform Stream: ${feedbackPlatform} (${feedbackStream})\nCaptured At: ${new Date().toLocaleString()}`
            : '';

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
        ''
    );
    setKeeperContact(session?.user?.email || '');
    setKeeperPortfolio('');
    setKeeperAvailability('Part-Time (5–15 hrs/wk)');
    setKeeperExperienceLevel('Mid-Level (2–5 Years)');
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
      const orgTitle = getBrandConfig().orgName || 'Sanctuary Foundry';
      const formattedDossier = [
        `Organization: ${orgTitle}`,
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
          ? [``, `Role Approach / Why ${orgTitle}:`, keeperMotivation.trim()]
          : []),
      ].join('\n');

      const { error } = await supabaseAuth.from('keeper_tickets').insert({
        author_id: uid,
        ticket_type: 'Keeper Application',
        title: `[${orgTitle} Application] ${finalHandle} — ${keeperFocus}`,
        description: formattedDossier,
        status: 'NEW',
        metadata: {
          keeper_application: {
            organization: orgTitle,
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

  return {
    openFeedbackChannel,
    resetFeedbackFlow,
    resetContactFlow,
    resetPartnerFlow,
    handleSubmitPlatformFeedback,
    handleSubmitDirectContact,
    handleSubmitPartnerApplication,
    resetKeeperFlow,
    handleSubmitKeeperApplication,
  };
}
