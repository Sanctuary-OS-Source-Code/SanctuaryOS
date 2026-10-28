import React from 'react';
import { useLexicon } from '../LexiconContext';
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  SidePanelTitleInput,
  CustomDropdown,
  EmptyState,
} from '../shared';
import {
  UniversalInput,
  UniversalTextArea,
  StatBox,
} from '../components/universal/UniversalLayout';
import { UniversalCard } from '../components/universal/UniversalCard';
import TicketDossierSidePanel from '../side-panels/TicketDossierSidePanel';

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
  activeFbStep,
  setActiveFbStep,
  maxFbStep,
  setMaxFbStep,
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
  activeContactStep,
  setActiveContactStep,
  maxContactStep,
  setMaxContactStep,
  sessionEmail,
  isMyTicketsDrawerOpen,
  setIsMyTicketsDrawerOpen,
  myPlatformTickets,
  selectedMyTicket,
  setSelectedMyTicket,
  fetchMyPlatformTickets,
}: LandingSupportDrawersProps) {
  const { t } = useLexicon();

  return (
    <>
      {/* =====================================================================
          DRAWER 1: CORE PLATFORM FEEDBACK & BUG SUPPORT (CHAT-LIKE GUIDED FLOW)
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
        widthClass="w-[90vw] md:w-[680px]"
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
              tooltip={t(
                'landing_feedback_submit_btn',
                'Dispatch to Keepers Core'
              )}
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
              'landing_feedback_scope_desc',
              "This channel is strictly for positive or constructive feedback and bug reports regarding the Core Sanctuary OS Platform (Desktop App, Website, and Mobile PWA). Do not submit individual game spoke {mod} disputes, {mason} drama, or spoke moderation appeals here—use the Support desk inside that game's workspace."
            )}
            variant="warning"
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t('category', 'Category')}
                value={`${feedbackPlatform} • ${feedbackStream}`}
                icon={
                  feedbackStream === 'Core Bug Report'
                    ? t('icon_bug_report', 'bug_report')
                    : t('icon_rate_review', 'rate_review')
                }
                iconColorClass="text-[var(--accent)]"
                colorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t('step_progress', 'Step Progress')}
                value={`${Math.min(activeFbStep + 1, 4)} / 4`}
                icon={t('icon_checklist', 'checklist')}
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
                    {t('icon_check_circle', 'check_circle')}
                  </span>
                  {t('step_completed', 'Step Completed')}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] truncate">
                  {t('landing_feedback_form_platform', 'Target Platform')}
                </h4>
                <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                  {`${feedbackPlatform} • ${
                    feedbackStream === 'Core Bug Report'
                      ? t('landing_fb_bug_title', 'Core Platform Bug Reports')
                      : t(
                          'landing_feedback_card_title',
                          'Submit Platform Feedback'
                        )
                  }`}
                </p>
              </div>
              <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                {t('icon_edit', 'edit')}
              </span>
            </div>
          ) : (
            <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 1 / 4`}
                  </span>
                  {activeFbStep < maxFbStep && (
                    <button
                      type="button"
                      onClick={() => setActiveFbStep(maxFbStep)}
                      className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                    >
                      {t('jump_to_latest', 'Jump to Latest')}
                      <span className="material-symbols-outlined !text-xs">
                        {t('icon_fast_forward', 'fast_forward')}
                      </span>
                    </button>
                  )}
                </div>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_fb_step1_title',
                    'Which platform and channel are you transmitting for?'
                  )}
                </h3>
                <p className="text-xs text-[var(--subtext)] opacity-75">
                  {t(
                    'landing_fb_step1_sub',
                    'Select the target Core Sanctuary OS platform and whether you are sharing feedback or reporting a reproducible Core OS bug.'
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t('landing_feedback_form_platform', 'Target Platform')}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: 'Desktop App' as const,
                      icon: t('icon_desktop_windows', 'desktop_windows'),
                      label: t('landing_fb_desktop_title', 'Desktop App'),
                      sub: t(
                        'landing_fb_desktop_sub',
                        'Native Windows & macOS Client'
                      ),
                    },
                    {
                      id: 'Website' as const,
                      icon: t('icon_language', 'language'),
                      label: t('landing_fb_web_title', 'Website'),
                      sub: t('landing_fb_web_sub', 'Cloud Portal & Browser Hub'),
                    },
                    {
                      id: 'Mobile PWA' as const,
                      icon: t('icon_smartphone', 'smartphone'),
                      label: t('landing_fb_pwa_title', 'Mobile PWA'),
                      sub: t(
                        'landing_fb_pwa_sub',
                        'iOS & Android Standalone App'
                      ),
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
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {plat.icon}
                        </span>
                        <span className="text-xs font-black">{plat.label}</span>
                        <span className="text-[10px] text-[var(--subtext)] opacity-75 leading-snug">
                          {plat.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t(
                    'landing_feedback_form_stream',
                    'Feedback / Support Stream'
                  )}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (feedbackStream === 'Core Bug Report') {
                        setFeedbackStream('Feature Request');
                      }
                    }}
                    className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      feedbackStream !== 'Core Bug Report'
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[22px]">
                      {t('icon_rate_review', 'rate_review')}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-black">
                        {t(
                          'landing_feedback_card_title',
                          'Submit Platform Feedback'
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--subtext)] opacity-75">
                        {t(
                          'landing_banner_fb_bottom',
                          'Feature Requests • Public & Beta Builds'
                        )}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackStream('Core Bug Report');
                      autoCapturePlatformDiagnostics();
                      setActiveFbStep(2);
                      setMaxFbStep((prev) => Math.max(prev, 2));
                    }}
                    className={`p-3.5 rounded-2xl glass-surface border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      feedbackStream === 'Core Bug Report'
                        ? 'border-[var(--danger)] text-[var(--danger)]'
                        : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[22px]">
                      {t('icon_bug_report', 'bug_report')}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-black">
                        {t(
                          'landing_fb_bug_title',
                          'Core Platform Bug Reports'
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--subtext)] opacity-75">
                        {t(
                          'landing_fb_bug_sub',
                          'Keepers Core Ticket System'
                        )}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_done', 'done')}
                  label={t('confirm', 'Confirm')}
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
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {t(
                      'landing_feedback_form_stream',
                      'Feedback / Support Stream'
                    )}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {feedbackStream === 'Core Bug Report'
                      ? `${feedbackStream} • ${feedbackBugChannel}`
                      : `${feedbackStream} • ${feedbackSentiment}`}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activeFbStep === 1 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                      {`${t('step', 'STEP')} 2 / 4`}
                    </span>
                    {activeFbStep < maxFbStep && (
                      <button
                        type="button"
                        onClick={() => setActiveFbStep(maxFbStep)}
                        className="text-[10px] font-black text-[var(--subtext)] hover:text-[var(--text)] uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                      >
                        {t('jump_to_latest', 'Jump to Latest')}
                        <span className="material-symbols-outlined !text-xs">
                          {t('icon_fast_forward', 'fast_forward')}
                        </span>
                      </button>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {feedbackStream === 'Core Bug Report'
                      ? t(
                          'landing_fb_step2_bug_title',
                          'Which build stream & environment did the bug occur on?'
                        )
                      : t(
                          'landing_fb_step2_fb_title',
                          'Select your feedback stream and sentiment'
                        )}
                  </h3>
                </div>

                {feedbackStream === 'Core Bug Report' ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        {
                          id: 'Public Build' as const,
                          icon: t('icon_verified', 'verified'),
                          label: t(
                            'landing_fb_stream_public',
                            'Public Build Feedback'
                          ),
                        },
                        {
                          id: 'Beta / Dev Build' as const,
                          icon: t('icon_science', 'science'),
                          label: t(
                            'landing_fb_stream_beta',
                            'Beta Build Feedback'
                          ),
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
                                ? 'border-[var(--accent)] text-[var(--accent)]'
                                : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]'
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px]">
                              {b.icon}
                            </span>
                            <span className="text-xs font-black">
                              {b.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

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
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        {
                          id: 'Feature Request' as const,
                          icon: t('icon_lightbulb', 'lightbulb'),
                          label: t(
                            'landing_fb_stream_feature',
                            'Feature Request'
                          ),
                        },
                        {
                          id: 'Public Build Feedback' as const,
                          icon: t('icon_public', 'public'),
                          label: t(
                            'landing_fb_stream_public',
                            'Public Build Feedback'
                          ),
                        },
                        {
                          id: 'Beta Build Feedback' as const,
                          icon: t('icon_science', 'science'),
                          label: t(
                            'landing_fb_stream_beta',
                            'Beta Build Feedback'
                          ),
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
                                ? 'border-[var(--accent)] text-[var(--accent)]'
                                : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]'
                            }`}
                          >
                            <span className="material-symbols-outlined !text-[20px]">
                              {s.icon}
                            </span>
                            <span className="text-xs font-black">
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t('landing_feedback_form_sentiment', 'Sentiment')}
                      </span>
                      <div className="grid grid-cols-3 gap-2.5">
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
                              className={`p-3 rounded-xl glass-surface border flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                active
                                  ? 'border-[var(--accent)] text-[var(--accent)]'
                                  : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]'
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
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
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
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {feedbackTitle}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {feedbackBody}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activeFbStep === 2 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 3 / 4`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t(
                      'landing_feedback_form_body',
                      'Detailed Feedback or Reproduction Steps'
                    )}
                  </h3>
                </div>

                {feedbackStream === 'Core Bug Report' && (
                  <div className="glass-surface p-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                          {t('icon_terminal', 'terminal')}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-[var(--text)] truncate">
                            {t(
                              'landing_bug_auto_telemetry_title',
                              'Auto-Captured Telemetry & Scrubbed Logs'
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                            {`${feedbackPlatform} • ${feedbackBugChannel} • ${
                              feedbackAutoLogs
                                ? `${feedbackAutoLogs.split('\n').length} ${t('landing_bug_log_lines', 'log lines attached')}`
                                : t(
                                    'landing_bug_logs_ready',
                                    'Diagnostics attached'
                                  )
                            }`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 cursor-pointer transition-all">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                            {t('icon_upload_file', 'upload_file')}
                          </span>
                          <span>
                            {t('support_attach_log', 'Attach Log File')}
                          </span>
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
                          className="px-2.5 py-1.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isEditingAutoTelemetry
                              ? t('icon_check', 'check')
                              : t('icon_edit', 'edit')}
                          </span>
                          <span>
                            {isEditingAutoTelemetry
                              ? t('done', 'Done')
                              : t(
                                  'landing_bug_btn_edit_telemetry',
                                  'Edit Details'
                                )}
                          </span>
                        </button>
                      </div>
                    </div>

                    {isEditingAutoTelemetry && (
                      <div className="flex flex-col gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t(
                                'landing_feedback_form_platform',
                                'Target Platform'
                              )}
                            </span>
                            <CustomDropdown
                              disableTint={true}
                              value={feedbackPlatform}
                              onChange={(v: string[]) =>
                                setFeedbackPlatform(
                                  (v[0] as any) || 'Website'
                                )
                              }
                              options={[
                                {
                                  id: 'Desktop App',
                                  label: t(
                                    'landing_fb_desktop_title',
                                    'Desktop App'
                                  ),
                                },
                                {
                                  id: 'Website',
                                  label: t('landing_fb_web_title', 'Website'),
                                },
                                {
                                  id: 'Mobile PWA',
                                  label: t(
                                    'landing_fb_pwa_title',
                                    'Mobile PWA'
                                  ),
                                },
                              ]}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                              {t(
                                'landing_feedback_form_stream',
                                'Feedback / Support Stream'
                              )}
                            </span>
                            <CustomDropdown
                              disableTint={true}
                              value={feedbackBugChannel}
                              onChange={(v: string[]) =>
                                setFeedbackBugChannel(
                                  (v[0] as any) || 'Public Build'
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
                        </div>

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

                        <UniversalTextArea
                          label={t('dossier_attached_logs', 'Attached Logs')}
                          value={feedbackAutoLogs}
                          onChange={setFeedbackAutoLogs}
                          placeholder={t(
                            'landing_bug_logs_edit_ph',
                            'Auto-captured system telemetry and scrubbed status logs...'
                          )}
                          className="min-h-[110px] font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                <SidePanelTitleInput
                  label={`${t('landing_feedback_form_title', 'Summary / Title')} *`}
                  icon={t('icon_title', 'title')}
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
                />

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
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
                  {`${t('step', 'STEP')} 4 / 4`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_feedback_submit_btn',
                    'Dispatch to Keepers Core'
                  )}
                </h3>
                <p className="text-xs text-[var(--subtext)] opacity-80">
                  {t(
                    'landing_feedback_drawer_sub',
                    'Routed Directly to Keepers Core • Core OS Scope Only'
                  )}
                </p>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_send', 'send')}
                  label={
                    isSubmittingFeedback
                      ? t('btn_submitting', 'Submitting...')
                      : t(
                          'landing_feedback_submit_btn',
                          'Dispatch to Keepers Core'
                        )
                  }
                  onClick={handleSubmitPlatformFeedback}
                  disabled={
                    isSubmittingFeedback ||
                    !feedbackTitle.trim() ||
                    !feedbackBody.trim()
                  }
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
        title={t(
          'landing_contact_drawer_title',
          'Direct Human Contact — Keepers Core'
        )}
        subtitle={t(
          'landing_contact_human_badge',
          '100% Human-Reviewed • Never Routed to AI Bots'
        )}
        icon={t('icon_support_agent', 'support_agent')}
        widthClass="w-[90vw] md:w-[660px]"
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
              tooltip={t(
                'landing_contact_submit_btn',
                'Send Direct Human Inquiry'
              )}
              onClick={handleSubmitDirectContact}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={t('icon_verified_user', 'verified_user')}
            overline={t(
              'landing_contact_human_badge',
              '100% Human-Reviewed • Never Routed to AI Bots'
            )}
            title={t('landing_contact_card_title', 'Direct Human Contact')}
            description={t(
              'landing_contact_drawer_sub',
              'Every inquiry submitted here is reviewed directly by a human Keeper. No chatbots, no automated deflection.'
            )}
            variant="accent"
          >
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                label={t('landing_contact_form_channel', 'Inquiry Channel')}
                value={contactChannel.replace('Direct Contact - ', '')}
                icon={t('icon_mail', 'mail')}
                iconColorClass="text-[var(--accent)]"
                colorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t('step_progress', 'Step Progress')}
                value={`${Math.min(activeContactStep + 1, 3)} / 3`}
                icon={t('icon_checklist', 'checklist')}
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
                    {t('icon_check_circle', 'check_circle')}
                  </span>
                  {t('step_completed', 'Step Completed')}
                </span>
                <h4 className="text-sm font-black text-[var(--text)] truncate">
                  {t('landing_contact_form_channel', 'Inquiry Channel')}
                </h4>
                <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                  {`${contactChannel} • ${contactReplyTo || sessionEmail || ''}`}
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
                  {t('landing_contact_form_channel', 'Inquiry Channel')}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'Direct Contact - General' as const,
                    icon: t('icon_mail', 'mail'),
                    label: t(
                      'landing_contact_type_general',
                      'General & Platform Inquiry'
                    ),
                  },
                  {
                    id: 'Direct Contact - Legal & Compliance' as const,
                    icon: t('icon_gavel', 'gavel'),
                    label: t(
                      'landing_contact_type_legal',
                      'Legal, DMCA & Privacy Compliance'
                    ),
                  },
                  {
                    id: 'Direct Contact - Security' as const,
                    icon: t('icon_shield_lock', 'shield_lock'),
                    label: t(
                      'landing_contact_type_security',
                      'Security & Vulnerability Disclosure'
                    ),
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
                          ? 'border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)]'
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
                label={`${t('landing_contact_form_reply_to', 'Your Reply Email or Discord Handle')} *`}
                value={contactReplyTo || sessionEmail || ''}
                onChange={setContactReplyTo}
                placeholder={t(
                  'landing_contact_form_reply_to_ph',
                  'you@example.com or @handle so a human Keeper can respond...'
                )}
              />

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_done', 'done')}
                  label={t('confirm', 'Confirm')}
                  disabled={!(contactReplyTo.trim() || sessionEmail)}
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
                      {t('icon_check_circle', 'check_circle')}
                    </span>
                    {t('step_completed', 'Step Completed')}
                  </span>
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    {contactSubject}
                  </h4>
                  <p className="text-xs text-[var(--subtext)] opacity-80 truncate font-mono">
                    {contactBody}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[var(--subtext)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all">
                  {t('icon_edit', 'edit')}
                </span>
              </div>
            ) : activeContactStep === 1 ? (
              <div className="glass-panel border-2 border-[var(--accent)] rounded-3xl p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] w-max">
                    {`${t('step', 'STEP')} 2 / 3`}
                  </span>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                    {t('landing_contact_form_body', 'Message')}
                  </h3>
                </div>

                <SidePanelTitleInput
                  label={`${t('landing_contact_form_subject', 'Subject')} *`}
                  icon={t('icon_subject', 'subject')}
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
                    'Provide full context for the Keepers team...'
                  )}
                />

                <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                  <ActionButton
                    variant="primary"
                    icon={t('icon_done', 'done')}
                    label={t('confirm', 'Confirm')}
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
                  {`${t('step', 'STEP')} 3 / 3`}
                </span>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight mt-1">
                  {t(
                    'landing_contact_submit_btn',
                    'Send Direct Human Inquiry'
                  )}
                </h3>
              </div>

              <div className="flex justify-end pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <ActionButton
                  variant="primary"
                  icon={t('icon_send', 'send')}
                  label={
                    isSubmittingContact
                      ? t('btn_submitting', 'Submitting...')
                      : t(
                          'landing_contact_submit_btn',
                          'Send Direct Human Inquiry'
                        )
                  }
                  onClick={handleSubmitDirectContact}
                  disabled={
                    isSubmittingContact ||
                    !contactSubject.trim() ||
                    !contactBody.trim()
                  }
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
        title={t(
          'landing_my_platform_tickets',
          'My Platform Tickets & Feedback'
        )}
        subtitle={t('keepers_title', 'Keepers Core')}
        icon={t('icon_inbox', 'inbox')}
        widthClass="w-[90vw] md:w-[680px]"
      >
        <div className="flex flex-col gap-3 pb-6">
          {myPlatformTickets.length === 0 ? (
            <EmptyState
              icon={t('icon_inbox', 'inbox')}
              title={t('no_tickets', 'No Support Tickets')}
              className="py-12"
            />
          ) : (
            myPlatformTickets.map((tk) => (
              <UniversalCard
                key={tk.id}
                layout="vertical"
                onClick={() => setSelectedMyTicket(tk)}
                icon={t('icon_receipt_long', 'receipt_long')}
                title={tk.title}
                subtitle={`${tk.ticket_type || 'Feedback'} • ${new Date(tk.created_at).toLocaleDateString()}`}
                footer={
                  <div className="flex items-center justify-between w-full text-[10px] font-mono font-bold text-[var(--subtext)]">
                    <span>{String(tk.status || 'NEW').toUpperCase()}</span>
                    <span className="text-[var(--accent)]">
                      {`${(tk.metadata?.replies || []).length} ${t('tab_posts', '{Dispatches}')} →`}
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
    </>
  );
}

