import React from 'react';
import { useLexicon } from '../LexiconContext';
import {
  SidePanel,
  ActionButton,
  ActionPill,
  InlineFilterGroup,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  CustomDropdown,
  DashboardStatTile,
  SidePanelFilterBar,
} from '../shared';
import {
  UniversalInput,
  UniversalTextArea,
  StatBox,
} from '../components/universal/UniversalLayout';
import CitizenTickets from '../views/CitizenTickets';
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';
import TicketLogViewer from '../side-panels/TicketLogViewer';
import { useStore } from '../store';
import { getActiveGameClient, supabase, findWorkspaceByIdentifier } from '../supabase';
import { isDesktop } from '../utils/envUtils';
import { isRootDomain } from '../utils/routingUtils';
import {
  BLINDED_EMAIL_REGEX,
  DmcaGuidedComplianceForm,
  DmcaSubTypeSelector,
  getLegalComplianceMissingReasons,
  isRealLegalEmail,
  LegalComplianceDraft,
} from './DmcaAndLegalFlowSteps';

interface LandingSupportDrawersProps {
  // Feedback & Bug Drawer
  isFeedbackDrawerOpen: boolean;
  setIsFeedbackDrawerOpen: (open: boolean) => void;
  resetFeedbackFlow: () => void;
  isSubmittingFeedback: boolean;
  handleSubmitPlatformFeedback: () => void;
  feedbackPlatform: 'Desktop App' | 'Website' | 'Mobile PWA';
  setFeedbackPlatform: (v: 'Desktop App' | 'Website' | 'Mobile PWA') => void;
  feedbackStream:
  | 'Feature Request'
  | 'Public Build Feedback'
  | 'Beta Build Feedback'
  | 'Core Bug Report';
  setFeedbackStream: (
    v:
      | 'Feature Request'
      | 'Public Build Feedback'
      | 'Beta Build Feedback'
      | 'Core Bug Report'
  ) => void;
  feedbackSentiment: 'Positive' | 'Constructive' | 'Critical';
  setFeedbackSentiment: (v: 'Positive' | 'Constructive' | 'Critical') => void;
  feedbackBugChannel: 'Public Build' | 'Beta / Dev Build';
  setFeedbackBugChannel: (v: 'Public Build' | 'Beta / Dev Build') => void;
  feedbackTitle: string;
  setFeedbackTitle: (v: string) => void;
  feedbackBody: string;
  setFeedbackBody: (v: string) => void;
  feedbackDiagnostics: string;
  setFeedbackDiagnostics: (v: string) => void;
  feedbackAutoLogs: string;
  setFeedbackAutoLogs: (v: string) => void;
  isEditingAutoTelemetry: boolean;
  setIsEditingAutoTelemetry: (fn: (prev: boolean) => boolean) => void;
  activeFbStep: number;
  setActiveFbStep: (v: number) => void;
  maxFbStep: number;
  setMaxFbStep: (fn: (prev: number) => number) => void;
  autoCapturePlatformDiagnostics: () => void;
  handleManualLogUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Direct Human Contact Drawer
  isContactDrawerOpen: boolean;
  setIsContactDrawerOpen: (open: boolean) => void;
  resetContactFlow: () => void;
  isSubmittingContact: boolean;
  handleSubmitDirectContact: () => void;
  contactChannel:
  | 'Direct Contact - General'
  | 'Direct Contact - Legal & Compliance'
  | 'Direct Contact - Security';
  setContactChannel: (
    v:
      | 'Direct Contact - General'
      | 'Direct Contact - Legal & Compliance'
      | 'Direct Contact - Security'
  ) => void;
  contactReplyTo: string;
  setContactReplyTo: (v: string) => void;
  contactSubject: string;
  setContactSubject: (v: string) => void;
  contactBody: string;
  setContactBody: (v: string) => void;
  activeContactStep: number;
  setActiveContactStep: (v: number) => void;
  maxContactStep: number;
  setMaxContactStep: (fn: (prev: number) => number) => void;
  sessionEmail?: string;
  games: any[];
  legalDraft: LegalComplianceDraft;
  setLegalDraft: (v: LegalComplianceDraft) => void;

  // My Platform Tickets Drawer
  isMyTicketsDrawerOpen: boolean;
  setIsMyTicketsDrawerOpen: (open: boolean) => void;
  myPlatformTickets: any[];
  selectedMyTicket: any | null;
  setSelectedMyTicket: (tk: any | null) => void;
  fetchMyPlatformTickets: () => void;
}

export function LandingSupportDrawers({
  isFeedbackDrawerOpen,
  setIsFeedbackDrawerOpen,
  resetFeedbackFlow,
  isSubmittingFeedback,
  handleSubmitPlatformFeedback,
  feedbackPlatform,
  setFeedbackPlatform,
  feedbackStream,
  setFeedbackStream,
  feedbackSentiment,
  setFeedbackSentiment,
  feedbackBugChannel,
  setFeedbackBugChannel,
  feedbackTitle,
  setFeedbackTitle,
  feedbackBody,
  setFeedbackBody,
  feedbackDiagnostics,
  setFeedbackDiagnostics,
  feedbackAutoLogs,
  setFeedbackAutoLogs,
  isEditingAutoTelemetry,
  setIsEditingAutoTelemetry,
  activeFbStep: _activeFbStep,
  setActiveFbStep: _setActiveFbStep,
  maxFbStep: _maxFbStep,
  setMaxFbStep: _setMaxFbStep,
  autoCapturePlatformDiagnostics,
  handleManualLogUpload,
  isContactDrawerOpen,
  setIsContactDrawerOpen,
  resetContactFlow,
  isSubmittingContact,
  handleSubmitDirectContact,
  contactChannel,
  setContactChannel,
  contactReplyTo,
  setContactReplyTo,
  contactSubject,
  setContactSubject,
  contactBody,
  setContactBody,
  activeContactStep: _activeContactStep,
  setActiveContactStep: _setActiveContactStep,
  maxContactStep: _maxContactStep,
  setMaxContactStep: _setMaxContactStep,
  sessionEmail,
  games,
  legalDraft,
  setLegalDraft,
  isMyTicketsDrawerOpen,
  setIsMyTicketsDrawerOpen,
  myPlatformTickets,
  selectedMyTicket,
  setSelectedMyTicket,
  fetchMyPlatformTickets,
}: LandingSupportDrawersProps) {
  const { t } = useLexicon();
  const userId = useStore((state) => state.session?.user?.id || '');
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const availableWorkspaces = useStore((state) => state.workspaces);

  const isWebHub = !isDesktop() && isRootDomain();
  const hasLoadedSpoke = Boolean(
    activeWorkspaceId &&
    activeWorkspaceId !== 'default_workspace' &&
    activeWorkspaceId !== 'web' &&
    !isWebHub &&
    getActiveGameClient()
  );
  const activeWorkspaceObj = Array.isArray(availableWorkspaces)
    ? findWorkspaceByIdentifier(availableWorkspaces, activeWorkspaceId) || null
    : null;
  const activeSpokeName =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    activeWorkspaceObj?.name ||
    activeWorkspaceId ||
    t('tab_workspace', 'Workspace');

  const isLegalChannel = contactChannel === 'Direct Contact - Legal & Compliance';
  const isStrictDmcaFlow = isLegalChannel && legalDraft.subType !== 'privacy_general';
  const unblindedSessionEmail =
    sessionEmail && !BLINDED_EMAIL_REGEX.test(sessionEmail) ? sessionEmail : '';
  const effectiveContactReply = isStrictDmcaFlow
    ? contactReplyTo || unblindedSessionEmail
    : contactReplyTo || sessionEmail || '';

  const fbMissingReasons: string[] = React.useMemo(() => {
    const missing: string[] = [];
    if (!feedbackTitle.trim()) {
      missing.push(t('landing_feedback_form_title', 'Summary / Title'));
    }
    if (!feedbackBody.trim()) {
      missing.push(
        t('landing_feedback_form_body', 'Detailed Feedback or Reproduction Steps')
      );
    }
    return missing;
  }, [feedbackTitle, feedbackBody, t]);

  const fbSubmitTooltipTitle =
    fbMissingReasons.length > 0
      ? t('form_incomplete_tooltip_title', 'Complete Required Fields to Submit')
      : t('landing_feedback_submit_btn', 'Dispatch to Keepers Core');
  const fbSubmitTooltipSub =
    fbMissingReasons.length > 0
      ? `${t('form_missing_prefix', 'Missing:')} ${fbMissingReasons.join(' • ')}`
      : undefined;

  const contactMissingReasons: string[] = React.useMemo(() => {
    if (isLegalChannel) {
      return getLegalComplianceMissingReasons(
        legalDraft,
        effectiveContactReply,
        contactSubject,
        contactBody,
        t
      );
    }
    const missing: string[] = [];
    if (!effectiveContactReply.trim()) {
      missing.push(t('landing_contact_form_reply_to', 'Reply Email or Handle'));
    }
    if (!contactSubject.trim()) {
      missing.push(t('landing_contact_form_subject', 'Subject'));
    }
    if (!contactBody.trim()) {
      missing.push(t('landing_contact_form_body', 'Message'));
    }
    return missing;
  }, [
    isLegalChannel,
    legalDraft,
    effectiveContactReply,
    contactSubject,
    contactBody,
    t,
  ]);

  const contactDefaultBtnLabel = isStrictDmcaFlow
    ? t('dmca_submit_short_btn', 'Submit Notice')
    : t('landing_contact_send_short_btn', 'Send Inquiry');
  const contactSubmitTooltipTitle =
    contactMissingReasons.length > 0
      ? t('form_incomplete_tooltip_title', 'Complete Required Fields to Submit')
      : contactDefaultBtnLabel;
  const contactSubmitTooltipSub =
    contactMissingReasons.length > 0
      ? `${t('form_missing_prefix', 'Missing:')} ${contactMissingReasons.slice(0, 4).join(' • ')}${contactMissingReasons.length > 4
        ? ` (+${contactMissingReasons.length - 4})`
        : ''
      }`
      : undefined;

  const contactCategoryLabel =
    contactChannel === 'Direct Contact - Legal & Compliance'
      ? t('landing_contact_type_legal', 'Legal, DMCA & Privacy')
      : contactChannel === 'Direct Contact - Security'
        ? t('landing_contact_type_security', 'Security & Vulnerability Disclosure')
        : t('landing_contact_type_general', 'General & Platform Inquiry');

  const contactTargetSpoke =
    isLegalChannel && legalDraft.targetScope === 'spoke'
      ? (games || []).find((g) => String(g.id) === String(legalDraft.targetSpokeId))
      : null;
  const contactDestinationLabel = contactTargetSpoke
    ? String(contactTargetSpoke.name || contactTargetSpoke.schema_id || t('tab_workspace', 'Workspace'))
    : t('sanctuary_foundry', 'Sanctuary Foundry');
  const [myTicketsScope, setMyTicketsScope] = React.useState<'core' | 'spoke'>(
    'core'
  );
  const [spokeTicketsCount, setSpokeTicketsCount] = React.useState<number>(0);
  const [myTicketsSearch, setMyTicketsSearch] = React.useState<string>('');
  const [myTicketsFilter, setMyTicketsFilter] = React.useState<
    'all' | 'open' | 'pending' | 'closed'
  >('all');

  React.useEffect(() => {
    if (!hasLoadedSpoke && myTicketsScope === 'spoke') {
      setMyTicketsScope('core');
    }
  }, [hasLoadedSpoke, myTicketsScope]);

  React.useEffect(() => {
    if (!isMyTicketsDrawerOpen || !userId || !hasLoadedSpoke) {
      if (!hasLoadedSpoke) setSpokeTicketsCount(0);
      return;
    }
    let isMounted = true;
    const syncSpokeCount = async () => {
      try {
        const res = await supabase
          .from('sanctuary_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId);
        if (isMounted && typeof res.count === 'number') {
          setSpokeTicketsCount(res.count);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    syncSpokeCount();
    return () => {
      isMounted = false;
    };
  }, [isMyTicketsDrawerOpen, userId, hasLoadedSpoke, activeWorkspaceId]);

  const resolvedMyTicketsScope: 'core' | 'spoke' = hasLoadedSpoke
    ? myTicketsScope
    : 'core';

  return (
    <>
      {/* =====================================================================
          DRAWER 1: CORE PLATFORM FEEDBACK & BUG SUPPORT (UNIFIED SIDEPANEL)
         ===================================================================== */}
      <SidePanel
        isOpen={isFeedbackDrawerOpen}
        onClose={() => setIsFeedbackDrawerOpen(false)}
        title={t(
          'landing_feedback_drawer_title',
          'Core Platform Feedback & Bug Support'
        )}
        subtitle={t(
          'landing_feedback_drawer_sub',
          'Routed Directly to Keepers Core • Core OS Scope Only'
        )}
        icon={
          feedbackStream === 'Core Bug Report'
            ? t('icon_bug_report', 'bug_report')
            : t('icon_rate_review', 'rate_review')
        }
        widthClass="w-[92vw] md:w-[740px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_restart_alt', 'restart_alt')}
              tooltip={t('reset', 'Reset')}
              onClick={resetFeedbackFlow}
            />
            <PanelHeaderButton
              icon={
                isSubmittingFeedback
                  ? t('icon_sync', 'sync')
                  : t('icon_send', 'send')
              }
              variant="accent"
              disabled={isSubmittingFeedback || fbMissingReasons.length > 0}
              tooltip={fbSubmitTooltipTitle}
              tooltipSubtitle={fbSubmitTooltipSub}
              onClick={handleSubmitPlatformFeedback}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={t('icon_gpp_maybe', 'gpp_maybe')}
            overline={t(
              'landing_feedback_drawer_sub',
              'Routed Directly to Keepers Core • Core OS Scope Only'
            )}
            title={t(
              'landing_feedback_scope_title',
              'Official Core Sanctuary Platform Channel Only — Not for Spoke {Mod} Issues or Drama'
            )}
            description={t(
              'landing_support_platform_scope_body',
              "Submit feedback, feature requests, and bug reports about the Sanctuary OS platform (Desktop App, Website, and Mobile PWA). For game-specific {mod} or community support, use that game workspace's Support tab."
            )}
            variant="warning"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <StatBox
                label={t('landing_feedback_form_platform', 'Target Platform')}
                value={feedbackPlatform}
                icon={
                  feedbackPlatform === 'Desktop App'
                    ? t('icon_desktop_windows', 'desktop_windows')
                    : feedbackPlatform === 'Mobile PWA'
                      ? t('icon_smartphone', 'smartphone')
                      : t('icon_language', 'language')
                }
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t(
                  'landing_feedback_form_stream',
                  'Feedback / Support Stream'
                )}
                value={
                  feedbackStream === 'Core Bug Report'
                    ? `${feedbackStream} • ${feedbackBugChannel}`
                    : feedbackStream
                }
                icon={
                  feedbackStream === 'Core Bug Report'
                    ? t('icon_bug_report', 'bug_report')
                    : t('icon_rate_review', 'rate_review')
                }
                iconColorClass="text-[var(--warning)]"
              />
            </div>
          </SidePanelHeroCard>

          <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              icon={t('icon_rate_review', 'rate_review')}
              label={t(
                'landing_banner_fb_bottom',
                'Feature Requests • Public & Beta Builds'
              )}
              value={t('landing_feedback_card_title', 'Submit Platform Feedback')}
              isActive={feedbackStream !== 'Core Bug Report'}
              onClick={() => {
                if (feedbackStream === 'Core Bug Report') {
                  setFeedbackStream('Feature Request');
                }
              }}
            />
            <DashboardStatTile
              variant="filter"
              icon={t('icon_bug_report', 'bug_report')}
              label={t('landing_fb_bug_sub', 'Sanctuary OS Engineering')}
              value={t('landing_fb_bug_title', 'Core Platform Bug Reports')}
              colorClass="text-[var(--warning)]"
              isActive={feedbackStream === 'Core Bug Report'}
              onClick={() => {
                setFeedbackStream('Core Bug Report');
                autoCapturePlatformDiagnostics();
              }}
            />
          </SidePanelFilterBar>

          <UniversalGroup
            title={t('landing_fb_group_routing', 'Platform & Stream')}
            icon={t('icon_tune', 'tune')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                  {t('landing_feedback_form_platform', 'Target Platform')}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={feedbackPlatform}
                  onChange={(v: string[]) =>
                    setFeedbackPlatform(
                      (v[0] as 'Desktop App' | 'Website' | 'Mobile PWA') ||
                      'Website'
                    )
                  }
                  options={[
                    {
                      id: 'Desktop App',
                      label: t('landing_fb_desktop_title', 'Desktop App'),
                    },
                    {
                      id: 'Website',
                      label: t('landing_fb_web_title', 'Website'),
                    },
                    {
                      id: 'Mobile PWA',
                      label: t('landing_fb_pwa_title', 'Mobile PWA'),
                    },
                  ]}
                />
              </div>

              {feedbackStream === 'Core Bug Report' ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                    {t('landing_fb_build_channel_label', 'Build Channel')}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={feedbackBugChannel}
                    onChange={(v: string[]) =>
                      setFeedbackBugChannel(
                        (v[0] as 'Public Build' | 'Beta / Dev Build') ||
                        'Public Build'
                      )
                    }
                    options={[
                      {
                        id: 'Public Build',
                        label: t(
                          'landing_fb_stream_public',
                          'Public Build Feedback'
                        ),
                      },
                      {
                        id: 'Beta / Dev Build',
                        label: t(
                          'landing_fb_stream_beta',
                          'Beta Build Feedback'
                        ),
                      },
                    ]}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                    {t(
                      'landing_feedback_form_stream',
                      'Feedback / Support Stream'
                    )}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={feedbackStream}
                    onChange={(v: string[]) =>
                      setFeedbackStream(
                        (v[0] as
                          | 'Feature Request'
                          | 'Public Build Feedback'
                          | 'Beta Build Feedback') || 'Feature Request'
                      )
                    }
                    options={[
                      {
                        id: 'Feature Request',
                        label: t('landing_fb_stream_feature', 'Feature Request'),
                      },
                      {
                        id: 'Public Build Feedback',
                        label: t(
                          'landing_fb_stream_public',
                          'Public Build Feedback'
                        ),
                      },
                      {
                        id: 'Beta Build Feedback',
                        label: t(
                          'landing_fb_stream_beta',
                          'Beta Build Feedback'
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            </div>

            {feedbackStream !== 'Core Bug Report' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                  {t('landing_feedback_form_sentiment', 'Sentiment')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'Positive' as const,
                      icon: t('icon_thumb_up', 'thumb_up'),
                      label: t(
                        'landing_feedback_sentiment_pos',
                        'Positive / Praise'
                      ),
                    },
                    {
                      id: 'Constructive' as const,
                      icon: t('icon_lightbulb', 'lightbulb'),
                      label: t(
                        'landing_feedback_sentiment_neu',
                        'Constructive / Idea'
                      ),
                    },
                    {
                      id: 'Critical' as const,
                      icon: t('icon_priority_high', 'priority_high'),
                      label: t(
                        'landing_feedback_sentiment_neg',
                        'Friction / Pain Point'
                      ),
                    },
                  ].map((sent) => {
                    const active = feedbackSentiment === sent.id;
                    return (
                      <button
                        key={sent.id}
                        type="button"
                        onClick={() => setFeedbackSentiment(sent.id)}
                        className={`p-3 rounded-xl glass-surface border flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${active
                            ? 'border-[var(--accent)] sa-glass-active text-[var(--text)]'
                            : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
                          }`}
                      >
                        <span
                          className={`material-symbols-outlined !text-[15px] ${active ? 'text-[var(--accent)]' : ''
                            }`}
                        >
                          {sent.icon}
                        </span>
                        <span className="truncate">{sent.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </UniversalGroup>

          <UniversalGroup
            title={t('landing_fb_group_details', 'Feedback & Details')}
            icon={t('icon_description', 'description')}
          >
            <UniversalInput
              label={`${t('landing_feedback_form_title', 'Summary / Title')} *`}
              value={feedbackTitle}
              onChange={setFeedbackTitle}
              placeholder={t(
                'landing_feedback_form_title_ph',
                'Concise summary of your feedback, feature request, or core bug...'
              )}
            />

            <UniversalTextArea
              label={`${t('landing_feedback_form_body', 'Detailed Feedback or Reproduction Steps')} *`}
              value={feedbackBody}
              onChange={setFeedbackBody}
              placeholder={t(
                'landing_feedback_form_body_ph',
                'Describe what you love, what should be improved, or steps to reproduce a core platform bug...'
              )}
              className="min-h-[170px] sm:min-h-[190px]"
            />
          </UniversalGroup>

          {feedbackStream === 'Core Bug Report' && (
            <UniversalGroup
              title={t('dossier_attached_logs', 'Attached Telemetry')}
              icon={t('icon_terminal', 'terminal')}
              headerAction={
                <div className="flex flex-wrap items-center gap-2 py-2">
                  <label className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                      {t('icon_upload_file', 'upload_file')}
                    </span>
                    <span>{t('support_attach_log', 'Attach Log File')}</span>
                    <input
                      type="file"
                      accept=".txt,.log,.html,.xml,.json"
                      onChange={handleManualLogUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setIsEditingAutoTelemetry((prev) => !prev)
                    }
                    className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {isEditingAutoTelemetry
                        ? t('icon_check', 'check')
                        : t('icon_edit', 'edit')}
                    </span>
                    <span>
                      {isEditingAutoTelemetry
                        ? t('done', 'Done')
                        : t('landing_bug_btn_edit_telemetry', 'Edit Details')}
                    </span>
                  </button>
                </div>
              }
            >
              <UniversalInput
                label={t(
                  'landing_feedback_form_diag',
                  'Build Version / OS / Diagnostic Notes (Optional)'
                )}
                value={feedbackDiagnostics}
                onChange={setFeedbackDiagnostics}
                placeholder={t(
                  'landing_feedback_form_diag_ph',
                  'e.g. Sanctuary OS v1.4 • Windows 11 / macOS / iOS PWA...'
                )}
              />

              {feedbackAutoLogs && (
                <TicketLogViewer logs={feedbackAutoLogs} />
              )}

              {isEditingAutoTelemetry && (
                <UniversalTextArea
                  label={t('ticket_attached_logs', 'Attached Logs')}
                  value={feedbackAutoLogs}
                  onChange={setFeedbackAutoLogs}
                  placeholder={t(
                    'landing_bug_logs_edit_ph',
                    'Auto-captured system telemetry and scrubbed status logs...'
                  )}
                  className="min-h-[120px] font-mono text-xs"
                />
              )}
            </UniversalGroup>
          )}

          <ActionButton
            variant="primary"
            className="w-full"
            icon={
              isSubmittingFeedback
                ? t('icon_sync', 'sync')
                : t('icon_send', 'send')
            }
            label={
              isSubmittingFeedback
                ? t('btn_submitting', 'Submitting...')
                : t('landing_feedback_send_btn', 'Submit Feedback')
            }
            onClick={handleSubmitPlatformFeedback}
            disabled={isSubmittingFeedback || fbMissingReasons.length > 0}
            tooltip={fbSubmitTooltipTitle}
            tooltipSubtitle={fbSubmitTooltipSub}
          />
        </div>
      </SidePanel>

      {/* =====================================================================
          DRAWER 2: DIRECT HUMAN CONTACT SIDEPANEL
         ===================================================================== */}
      <SidePanel
        isOpen={isContactDrawerOpen}
        onClose={() => setIsContactDrawerOpen(false)}
        title={t('landing_contact_short_title', 'Direct Contact')}
        subtitle={t('sanctuary_foundry', 'Sanctuary Foundry')}
        icon={t('icon_support_agent', 'support_agent')}
        widthClass="w-[92vw] md:w-[740px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_restart_alt', 'restart_alt')}
              tooltip={t('reset', 'Reset')}
              onClick={resetContactFlow}
            />
            <PanelHeaderButton
              icon={
                isSubmittingContact
                  ? t('icon_sync', 'sync')
                  : t('icon_send', 'send')
              }
              variant="accent"
              disabled={isSubmittingContact || contactMissingReasons.length > 0}
              tooltip={contactSubmitTooltipTitle}
              tooltipSubtitle={contactSubmitTooltipSub}
              onClick={handleSubmitDirectContact}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={t('icon_verified_user', 'verified_user')}
            overline={t('sanctuary_foundry', 'Sanctuary Foundry')}
            title={t('landing_contact_short_title', 'Direct Contact')}
            description={t(
              'landing_contact_drawer_clean_sub',
              'Every inquiry is reviewed directly by a member of the Sanctuary Foundry team.'
            )}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <StatBox
                label={t('landing_contact_form_channel', 'Inquiry Category')}
                value={contactCategoryLabel}
                icon={
                  isStrictDmcaFlow
                    ? t('icon_gavel', 'gavel')
                    : t('icon_mail', 'mail')
                }
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t('landing_contact_routing_label', 'Destination')}
                value={contactDestinationLabel}
                icon={t('icon_hub', 'hub')}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t('landing_contact_group_routing', 'Inquiry & Reply Contact')}
            icon={t('icon_tune', 'tune')}
          >
            <div
              className={`grid grid-cols-1 ${isLegalChannel ? 'sm:grid-cols-2' : ''
                } gap-3`}
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1 leading-tight">
                  {t('landing_contact_form_channel', 'Inquiry Category')}
                </label>
                <CustomDropdown
                  disableTint={true}
                  value={contactChannel}
                  onChange={(vals: string[]) => {
                    const nextCh = (vals[0] ||
                      'Direct Contact - General') as typeof contactChannel;
                    setContactChannel(nextCh);
                    if (
                      nextCh === 'Direct Contact - Legal & Compliance' &&
                      legalDraft.subType !== 'privacy_general' &&
                      (contactReplyTo.trim().startsWith('@') ||
                        BLINDED_EMAIL_REGEX.test(contactReplyTo.trim()))
                    ) {
                      setContactReplyTo('');
                    }
                  }}
                  options={[
                    {
                      id: 'Direct Contact - General',
                      label: t(
                        'landing_contact_type_general',
                        'General & Platform Inquiry'
                      ),
                    },
                    {
                      id: 'Direct Contact - Legal & Compliance',
                      label: t(
                        'landing_contact_type_legal',
                        'Legal, DMCA & Privacy'
                      ),
                    },
                    {
                      id: 'Direct Contact - Security',
                      label: t(
                        'landing_contact_type_security',
                        'Security & Vulnerability Disclosure'
                      ),
                    },
                  ]}
                />
              </div>

              {isLegalChannel && (
                <DmcaSubTypeSelector
                  draft={legalDraft}
                  onChange={(next) => {
                    setLegalDraft(next);
                    if (
                      next.subType !== 'privacy_general' &&
                      (contactReplyTo.trim().startsWith('@') ||
                        BLINDED_EMAIL_REGEX.test(contactReplyTo.trim()))
                    ) {
                      setContactReplyTo('');
                    }
                  }}
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <UniversalInput
                label={
                  isStrictDmcaFlow
                    ? `${t('dmca_email_short_label', 'Email Address')} *`
                    : `${t('landing_contact_form_reply_to', 'Reply Email or Handle')} *`
                }
                type={isStrictDmcaFlow ? 'email' : 'text'}
                className={isStrictDmcaFlow ? 'no-text-case' : undefined}
                value={effectiveContactReply}
                onChange={setContactReplyTo}
                placeholder={
                  isStrictDmcaFlow
                    ? 'legal@company.com'
                    : t(
                      'landing_contact_form_reply_to_ph',
                      'you@example.com or @handle...'
                    )
                }
              />
              {isStrictDmcaFlow &&
                Boolean(sessionEmail) &&
                BLINDED_EMAIL_REGEX.test(String(sessionEmail)) &&
                !contactReplyTo.trim() && (
                  <span className="text-[11px] font-medium text-[var(--subtext)] px-1 no-text-case">
                    {t(
                      'dmca_blinded_autofill_suppressed',
                      'Blinded email autofill was withheld because DMCA notices require a standard email address.'
                    )}
                  </span>
                )}
              {isStrictDmcaFlow &&
                effectiveContactReply.trim().length > 0 &&
                !isRealLegalEmail(effectiveContactReply) && (
                  <span className="text-[11px] font-bold text-[var(--warning)] px-1 no-text-case">
                    {t(
                      'dmca_strict_email_validation_err',
                      'A valid, non-blinded email address is required for DMCA takedown and counter-notice filings.'
                    )}
                  </span>
                )}
            </div>
          </UniversalGroup>

          {isStrictDmcaFlow ? (
            <DmcaGuidedComplianceForm
              draft={legalDraft}
              onChange={setLegalDraft}
              games={games}
            />
          ) : (
            <UniversalGroup
              title={t('landing_contact_group_message', 'Message Details')}
              icon={t('icon_mail', 'mail')}
            >
              <UniversalInput
                label={`${t('landing_contact_form_subject', 'Subject')} *`}
                value={contactSubject}
                onChange={setContactSubject}
                placeholder={t(
                  'landing_contact_form_subject_ph',
                  'Subject of your inquiry...'
                )}
              />

              <UniversalTextArea
                label={`${t('landing_contact_form_body', 'Message')} *`}
                value={contactBody}
                onChange={setContactBody}
                placeholder={t(
                  'landing_contact_form_body_ph',
                  'Provide full context for our team...'
                )}
                className="min-h-[160px] sm:min-h-[190px] no-text-case"
              />
            </UniversalGroup>
          )}

          {isStrictDmcaFlow && legalDraft.subType === 'dmca_takedown' && (
            <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] flex items-start gap-3">
              <span className="material-symbols-outlined !text-[20px] text-[var(--warning)] shrink-0 mt-0.5">
                {t('icon_warning', 'warning')}
              </span>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1 no-text-case">
                <span className="text-xs font-black text-[var(--warning)] leading-snug no-text-case">
                  {t(
                    'dmca_deterrent_banner_title',
                    'Human Review • Full Legal Identity Forwarded to Accused {Mason}'
                  )}
                </span>
                <p className="text-xs text-[var(--text)] opacity-90 leading-relaxed m-0 no-text-case">
                  {t(
                    'dmca_deterrent_forwarding_body',
                    'Every notice is reviewed by human staff—never automated takedown bots. If validated, your Full Legal Name, Physical Mailing Address, and Email Address are forwarded directly to the accused {Mason} so they may contest the claim or file a § 512(g) counter-notice.'
                  )}
                </p>
                <p className="text-[11px] text-[var(--subtext)] leading-relaxed m-0 no-text-case">
                  {t(
                    'dmca_deterrent_scope_liability_body',
                    'Claims over {mod} ideas, gameplay mechanics, names, or personal drama are not copyrightable (17 U.S.C. § 102(b)) and are rejected outright, as are aliases or fake addresses. Knowingly misrepresenting infringement carries federal liability for damages and attorneys’ fees under 17 U.S.C. § 512(f).'
                  )}
                </p>
              </div>
            </div>
          )}

          <ActionButton
            variant="primary"
            className="w-full"
            icon={isSubmittingContact ? t('icon_sync', 'sync') : t('icon_send', 'send')}
            label={
              isSubmittingContact
                ? t('btn_submitting', 'Submitting...')
                : contactDefaultBtnLabel
            }
            onClick={handleSubmitDirectContact}
            disabled={isSubmittingContact || contactMissingReasons.length > 0}
            tooltip={contactSubmitTooltipTitle}
            tooltipSubtitle={contactSubmitTooltipSub}
          />
        </div>
      </SidePanel>

      {/* =====================================================================
          DRAWER 4: MY PLATFORM TICKETS & FEEDBACK SIDEPANEL
         ===================================================================== */}
      <SidePanel
        isOpen={isMyTicketsDrawerOpen}
        onClose={() => setIsMyTicketsDrawerOpen(false)}
        title={t(
          'landing_my_platform_tickets',
          'My Platform Tickets & Feedback'
        )}
        subtitle={t('keepers_title', 'Keepers Core')}
        icon={t('icon_support_agent', 'support_agent')}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[840px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t('icon_open_in_new', 'open_in_new')}
              tooltip={t('support_tickets', 'Support Tickets')}
              onClick={() => {
                setIsMyTicketsDrawerOpen(false);
                localStorage.setItem('sanctuary_settings_tab', 'TICKETS');
                useStore.getState().setView('settings');
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('navigateSettings', {
                      detail: { tab: 'TICKETS' },
                    })
                  );
                }, 50);
              }}
            />
            <PanelHeaderButton
              icon={t('icon_add_circle', 'add_circle')}
              tooltip={t(
                'landing_feedback_btn_open',
                'Transmit Platform Feedback'
              )}
              variant="accent"
              onClick={() => {
                setIsMyTicketsDrawerOpen(false);
                setIsFeedbackDrawerOpen(true);
              }}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t('icon_support_agent', 'support_agent')}
            overline={t('keepers_title', 'Keepers Core')}
            title={t(
              'landing_feedback_my_tickets_btn',
              'My Platform Tickets & Feedback'
            )}
            description={t(
              'support_desk_desc',
              'Review active support threads, inspect attached telemetry logs, or open a new support request.'
            )}
            badge={`${resolvedMyTicketsScope === 'spoke' && hasLoadedSpoke
                ? spokeTicketsCount
                : (myPlatformTickets?.length ?? 0)
              } ${t('support_tickets', 'Support Tickets')}`}
            badgeIcon={t('icon_confirmation_number', 'confirmation_number')}
            variant="accent"
          >
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              <ActionButton
                variant="glass"
                icon={t('icon_add_circle', 'add_circle')}
                label={t(
                  'landing_feedback_btn_open',
                  'Transmit Platform Feedback'
                )}
                onClick={() => {
                  setIsMyTicketsDrawerOpen(false);
                  setIsFeedbackDrawerOpen(true);
                }}
              />
              {hasLoadedSpoke && (
                <ActionButton
                  variant="glass"
                  icon={t('icon_confirmation_number', 'confirmation_number')}
                  label={`${activeSpokeName} • ${t('ticket_new', 'New Ticket')}`}
                  onClick={() => {
                    setIsMyTicketsDrawerOpen(false);
                    document.dispatchEvent(
                      new CustomEvent('open-support-modal')
                    );
                  }}
                />
              )}
            </div>
          </SidePanelHeroCard>

          {hasLoadedSpoke && (
            <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
              <DashboardStatTile
                variant="filter"
                icon={t('icon_receipt_long', 'receipt_long')}
                label={t('keepers_title', 'Keepers Core')}
                value={myPlatformTickets?.length ?? 0}
                isActive={resolvedMyTicketsScope === 'core'}
                onClick={() => setMyTicketsScope('core')}
              />
              <DashboardStatTile
                variant="filter"
                icon={t('icon_confirmation_number', 'confirmation_number')}
                label={activeSpokeName}
                value={spokeTicketsCount}
                isActive={resolvedMyTicketsScope === 'spoke'}
                onClick={() => setMyTicketsScope('spoke')}
              />
            </SidePanelFilterBar>
          )}

          <ActionPill
            className="w-full !max-w-none shrink-0"
            searchQuery={myTicketsSearch}
            setSearchQuery={setMyTicketsSearch}
            searchPlaceholder={t('ph_search_tickets', 'Search Tickets...')}
            primaryPopover={{
              icon: t('icon_tune', 'tune'),
              label: t('filters', 'Filters'),
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                      {t('ticket_status', 'Ticket Status')}
                    </span>
                    <InlineFilterGroup
                      value={myTicketsFilter}
                      onChange={(v) =>
                        setMyTicketsFilter(
                          v as 'all' | 'open' | 'pending' | 'closed'
                        )
                      }
                      options={[
                        { id: 'all', label: t('filter_all', 'All') },
                        { id: 'open', label: t('ticket_status_open', 'Open') },
                        {
                          id: 'pending',
                          label: t('ticket_status_in_progress', 'In Progress'),
                        },
                        { id: 'closed', label: t('filter_closed', 'Closed') },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />

          {resolvedMyTicketsScope === 'spoke' && hasLoadedSpoke ? (
            <UniversalGroup
              title={activeSpokeName}
              count={spokeTicketsCount}
              icon={t('icon_confirmation_number', 'confirmation_number')}
            >
              <CitizenTickets
                key={`landing-spoke-${activeWorkspaceId}`}
                userId={userId}
                tableName="sanctuary_tickets"
                onCountChange={setSpokeTicketsCount}
                onSelectTicket={(tk) =>
                  setSelectedMyTicket({
                    ...tk,
                    table_name: 'sanctuary_tickets',
                  })
                }
                onOpenNewTicket={() => {
                  setIsMyTicketsDrawerOpen(false);
                  document.dispatchEvent(new CustomEvent('open-support-modal'));
                }}
                embedded={true}
                isSidePanel={true}
                hideActionPill={true}
                externalSearch={myTicketsSearch}
                externalFilter={myTicketsFilter}
              />
            </UniversalGroup>
          ) : (
            <UniversalGroup
              title={t(
                'landing_feedback_my_tickets_btn',
                'My Platform Tickets & Feedback'
              )}
              count={myPlatformTickets?.length ?? 0}
              icon={t('icon_receipt_long', 'receipt_long')}
            >
              <CitizenTickets
                key="landing-core-keeper"
                userId={userId}
                tableName="keeper_tickets"
                externalTickets={myPlatformTickets}
                onSelectTicket={(tk) =>
                  setSelectedMyTicket({ ...tk, table_name: 'keeper_tickets' })
                }
                onOpenNewTicket={() => {
                  setIsMyTicketsDrawerOpen(false);
                  setIsFeedbackDrawerOpen(true);
                }}
                embedded={true}
                isSidePanel={true}
                hideActionPill={true}
                externalSearch={myTicketsSearch}
                externalFilter={myTicketsFilter}
              />
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      <TicketDossierSidePanel
        isOpen={!!selectedMyTicket}
        onClose={() => setSelectedMyTicket(null)}
        ticket={selectedMyTicket}
        tableName={selectedMyTicket?.table_name || 'keeper_tickets'}
        isReadOnly={false}
        canReply={true}
        onReplyAdded={(newMetadata) => {
          if (selectedMyTicket && newMetadata) {
            setSelectedMyTicket({ ...selectedMyTicket, metadata: newMetadata });
          }
          fetchMyPlatformTickets();
          window.dispatchEvent(new CustomEvent('sanctuary-tickets-updated'));
        }}
      />
    </>
  );
}

