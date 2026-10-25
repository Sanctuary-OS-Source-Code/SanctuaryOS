import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLexicon } from '../LexiconContext';
import { SettingsToggle, TabContainer, SettingsGrid, CustomSettingsDropdown } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import {
  ActionButton,
  SidePanel,
  ActionPill,
  InlineFilterGroup,
  HoverTooltip,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
} from '../shared';
import { supabase } from '../supabase';
import { useStore } from '../store';
import { getSupporterState } from '../utils/supporterManager';
import { isDesktop } from '../utils/envUtils';
import {
  NotificationCategory,
  NotificationDeliveryMode,
  SystemNotificationPermissionState,
  getNotificationMode,
  setNotificationMode,
  setAllNotificationModes,
  getSystemNotificationPermissionState,
  requestSystemNotificationPermission,
  notifyOS,
} from '../utils/notificationHelper';

export default function NotificationsTab() {
  const { t } = useLexicon();

  const [modes, setModes] = useState<Record<NotificationCategory, NotificationDeliveryMode>>(() => ({
    defcon: getNotificationMode('defcon'),
    alert_banner: getNotificationMode('alert_banner'),
    system_dispatch: getNotificationMode('system_dispatch'),
    new_posts: getNotificationMode('new_posts'),
    replies: getNotificationMode('replies'),
    support: getNotificationMode('support'),
  }));

  const [notifyAuthorOnly, setNotifyAuthorOnly] = useState(
    localStorage.getItem('sanctuary_notify_author_only') === 'true'
  );
  const [permissionState, setPermissionState] = useState<SystemNotificationPermissionState>(() =>
    isDesktop() ||
    (typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted')
      ? 'granted'
      : 'prompt'
  );
  const [showMasonPanel, setShowMasonPanel] = useState(false);

  const [masonAlerts, setMasonAlerts] = useState<Record<string, boolean>>(() =>
    JSON.parse(localStorage.getItem('sanctuary_mason_alerts') || '{}')
  );
  const [followedMasons, setFollowedMasons] = useState<any[]>([]);
  const [masonSearchQuery, setMasonSearchQuery] = useState('');
  const [masonAlertFilter, setMasonAlertFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [masonVerifiedFilter, setMasonVerifiedFilter] = useState<'all' | 'verified' | 'standard'>('all');

  const syncState = useCallback(async () => {
    setModes({
      defcon: getNotificationMode('defcon'),
      alert_banner: getNotificationMode('alert_banner'),
      system_dispatch: getNotificationMode('system_dispatch'),
      new_posts: getNotificationMode('new_posts'),
      replies: getNotificationMode('replies'),
      support: getNotificationMode('support'),
    });
    const perm = await getSystemNotificationPermissionState();
    setPermissionState(perm);
  }, []);

  useEffect(() => {
    syncState();
    window.addEventListener('sanctuary_notification_prefs_changed', syncState);
    return () => {
      window.removeEventListener('sanctuary_notification_prefs_changed', syncState);
    };
  }, [syncState]);

  const fetchFollows = useCallback(async () => {
    const mergedMap = new Map<string, any>();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      const { data } = await supabase
        .from('mason_followers')
        .select('mason_id, masons(*)')
        .eq('user_id', session.user.id);
      if (data) {
        for (const row of data as any[]) {
          const m = Array.isArray(row.masons) ? row.masons[0] : row.masons;
          if (m && m.id) {
            mergedMap.set(String(m.id), {
              id: String(m.id),
              name: m.name || t('unknown_architect', 'Unknown'),
              avatar_url: m.avatar_url || null,
              is_verified: Boolean(m.is_verified),
              tagline:
                m.tagline && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(m.tagline).replace(/^@/, ''))
                  ? String(m.tagline)
                  : '',
            });
          }
        }
      }
    }

    try {
      const localState = await getSupporterState();
      const localFollows = localState?.follows || [];
      const missingIds = localFollows
        .map((f) => String(f.mason_id))
        .filter((id) => id && !mergedMap.has(id));

      if (missingIds.length > 0) {
        const { data: extraMasons } = await supabase
          .from('masons')
          .select('*')
          .in('id', missingIds);
        if (extraMasons) {
          for (const m of extraMasons as any[]) {
            if (m && m.id) {
              mergedMap.set(String(m.id), {
                id: String(m.id),
                name: m.name || t('unknown_architect', 'Unknown'),
                avatar_url: m.avatar_url || null,
                is_verified: Boolean(m.is_verified),
                tagline:
                  m.tagline && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(m.tagline).replace(/^@/, ''))
                    ? String(m.tagline)
                    : '',
              });
            }
          }
        }
      }

      for (const f of localFollows) {
        const id = String(f.mason_id || '');
        if (id && !mergedMap.has(id)) {
          mergedMap.set(id, {
            id,
            name: f.mason_name || t('unknown_architect', 'Unknown'),
            avatar_url: null,
            is_verified: false,
            tagline: '',
          });
        }
      }
    } catch {
      // Ignore if local supporter vault unavailable
    }

    setFollowedMasons(
      Array.from(mergedMap.values()).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      )
    );
  }, [t]);

  useEffect(() => {
    fetchFollows();
  }, [fetchFollows, showMasonPanel]);

  const filteredFollowedMasons = useMemo(() => {
    const q = masonSearchQuery.trim().toLowerCase();
    return followedMasons.filter((m) => {
      if (q) {
        const matchName = String(m.name || '').toLowerCase().includes(q);
        const matchTagline = String(m.tagline || '').toLowerCase().includes(q);
        if (!matchName && !matchTagline) return false;
      }
      const isAlertOn = Boolean(masonAlerts[m.id]);
      if (masonAlertFilter === 'enabled' && !isAlertOn) return false;
      if (masonAlertFilter === 'disabled' && isAlertOn) return false;
      if (masonVerifiedFilter === 'verified' && !m.is_verified) return false;
      if (masonVerifiedFilter === 'standard' && m.is_verified) return false;
      return true;
    });
  }, [followedMasons, masonSearchQuery, masonAlertFilter, masonVerifiedFilter, masonAlerts]);

  const toggleMasonAlert = (id: string) => {
    const newVal = { ...masonAlerts, [id]: !masonAlerts[id] };
    setMasonAlerts(newVal);
    localStorage.setItem('sanctuary_mason_alerts', JSON.stringify(newVal));
  };

  const setAllMasonAlerts = (enabled: boolean) => {
    const next: Record<string, boolean> = { ...masonAlerts };
    followedMasons.forEach((m) => {
      next[m.id] = enabled;
    });
    setMasonAlerts(next);
    localStorage.setItem('sanctuary_mason_alerts', JSON.stringify(next));
  };

  const handleModeChange = async (category: NotificationCategory, nextMode: NotificationDeliveryMode) => {
    if (nextMode === 'OS' && permissionState !== 'granted') {
      const perm = await requestSystemNotificationPermission();
      setPermissionState(perm);
      if (perm === 'denied') {
        useStore
          .getState()
          .pushStatus(
            t(
              'notif_os_banner_desc_denied',
              'System notifications are blocked by your browser or device settings.'
            ),
            'warning'
          );
      }
    }
    setNotificationMode(category, nextMode);
    setModes((prev) => ({ ...prev, [category]: nextMode }));
  };

  const handleEnableSystemNotifications = async () => {
    const perm = await requestSystemNotificationPermission();
    setPermissionState(perm);
    if (perm === 'granted') {
      const categories: NotificationCategory[] = [
        'defcon',
        'alert_banner',
        'system_dispatch',
        'new_posts',
        'replies',
        'support',
      ];
      categories.forEach((cat) => {
        if (getNotificationMode(cat) !== 'NONE') {
          setNotificationMode(cat, 'OS');
        }
      });
      await syncState();
      await notifyOS(
        t('notif_test_title', 'Sanctuary OS — System Notification'),
        t(
          'notif_test_body',
          'System notifications are connected and ready. Alerts will only be sent once.'
        ),
        'TEST_PULSE',
        true,
        `test_optin_${Date.now()}`
      );
    }
  };

  const handleSendTestNotification = async () => {
    const perm = await requestSystemNotificationPermission();
    setPermissionState(perm);
    const sent = await notifyOS(
      t('notif_test_title', 'Sanctuary OS — System Notification'),
      t(
        'notif_test_body',
        'System notifications are connected and ready. Alerts will only be sent once.'
      ),
      'TEST_PULSE',
      true,
      `test_manual_${Date.now()}`
    );
    if (sent) {
      useStore
        .getState()
        .pushStatus(
          `${t('icon_check_circle', 'check_circle')} ${t('notif_test_title', 'Sanctuary OS — System Notification')}`,
          'success'
        );
    }
  };

  const handleSetAllModes = async (targetMode: NotificationDeliveryMode) => {
    if (targetMode === 'OS' && permissionState !== 'granted') {
      const perm = await requestSystemNotificationPermission();
      setPermissionState(perm);
    }
    setAllNotificationModes(targetMode);
    await syncState();
  };

  const toggleNotifyAuthorOnly = () => {
    const newVal = !notifyAuthorOnly;
    setNotifyAuthorOnly(newVal);
    localStorage.setItem('sanctuary_notify_author_only', newVal.toString());
  };

  const deliveryOptions = [
    { id: 'OS', label: t('notif_mode_os', 'System (OS)') },
    { id: 'APP', label: t('notif_mode_app', 'In-App Only') },
    { id: 'NONE', label: t('notif_mode_none', 'None (Muted)') },
  ];

  const categoryCards: {
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
  }[] = [
    {
      id: 'defcon',
      title: t('notify_defcon_title', 'Game Update & Lockdown Alerts'),
      subtitle: t(
        'notify_defcon_desc',
        'Emergency alerts when a new game update is detected or a safety lockdown is triggered.'
      ),
      icon: t('icon_shield', 'shield'),
    },
    {
      id: 'alert_banner',
      title: t('notify_alert_banner', 'Urgent Global Alerts'),
      subtitle: t('notify_alert_banner_desc', 'Critical network-wide alerts and pinned advisories.'),
      icon: t('icon_warning', 'warning'),
    },
    {
      id: 'system_dispatch',
      title: t('notify_system_dispatch', 'System Dispatches'),
      subtitle: t('notify_system_dispatch_desc', 'Official announcements and global dispatches.'),
      icon: t('icon_admin_panel_settings', 'admin_panel_settings'),
    },
    {
      id: 'new_posts',
      title: t('btn_new_posts', 'Comm-Link Posts'),
      subtitle: t('notify_new_posts_desc', "Notify when followed {Masons} publish new posts."),
      icon: t('icon_post_add', 'post_add'),
    },
    {
      id: 'replies',
      title: t('ui.replies', 'Comm-Link Replies'),
      subtitle: t('notify_replies_desc', 'Direct replies and responses on Comm-Link threads.'),
      icon: t('icon_chat_bubble', 'chat_bubble'),
    },
    {
      id: 'support',
      title: t('notify_support', 'Support Alerts'),
      subtitle: t('notify_support_desc', 'Replies and updates on your support tickets.'),
      icon: t('icon_contact_support', 'contact_support'),
    },
  ];

  const isGranted = permissionState === 'granted';
  const isDenied = permissionState === 'denied';
  const enabledMasonCount = followedMasons.filter((m) => Boolean(masonAlerts[m.id])).length;

  return (
    <>
      <TabContainer
        title={t('tab_notifs', 'Notifications')}
        icon={t('icon_notifications', 'notifications')}
      >
        {/* System & PWA Notification Opt-In / Status Card */}
        <div className="p-6 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div
                className={`w-12 h-12 rounded-2xl glass-surface flex items-center justify-center shrink-0 border ${
                  isGranted
                    ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)]'
                    : isDenied
                    ? 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)]'
                    : 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]'
                }`}
              >
                <span className="material-symbols-outlined !text-[24px]">
                  {isGranted
                    ? t('icon_notifications_active', 'notifications_active')
                    : isDenied
                    ? t('icon_notifications_off', 'notifications_off')
                    : t('icon_notifications', 'notifications')}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <h3 className="text-base font-black tracking-tight text-[var(--text)]">
                  {t('notif_os_banner_title', 'System & PWA Notifications')}
                </h3>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                  {isGranted
                    ? t(
                        'notif_os_banner_desc_granted',
                        'System notifications are active. Each alert is delivered once according to your per-category routing rules below.'
                      )
                    : isDenied
                    ? t(
                        'notif_os_banner_desc_denied',
                        'System notifications are blocked by your browser or device settings. Enable notification permissions in your OS or browser to use System (OS) alerts.'
                      )
                    : t(
                        'notif_os_banner_desc_prompt',
                        'Opt in to receive real desktop or phone notifications for Game Updates, Creator Posts, Support Replies, and Global Alerts.'
                      )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-stretch gap-2.5 shrink-0">
              {!isGranted && (
                <ActionButton
                  variant={isDenied ? 'danger' : 'accent'}
                  icon={
                    isDenied
                      ? t('icon_notifications_off', 'notifications_off')
                      : t('icon_notifications_active', 'notifications_active')
                  }
                  label={
                    isDenied
                      ? t('notif_os_status_blocked', 'Permission Blocked')
                      : t('notif_os_btn_enable', 'Enable System Notifications')
                  }
                  onClick={handleEnableSystemNotifications}
                  className="w-full lg:w-auto justify-center min-h-[42px]"
                />
              )}
              <ActionButton
                variant="glass"
                icon={t('icon_send', 'send')}
                label={t('notif_os_btn_test', 'Send Test Notification')}
                onClick={handleSendTestNotification}
                className="w-full lg:w-auto justify-center min-h-[42px]"
              />
              <ActionButton
                variant="glass"
                icon={t('icon_done_all', 'done_all')}
                label={t('notif_os_btn_all_os', 'Set All to System (OS)')}
                onClick={() => handleSetAllModes('OS')}
                className="w-full lg:w-auto justify-center min-h-[42px]"
              />
              <ActionButton
                variant="glass"
                icon={t('icon_app_Shortcut', 'app_registration')}
                label={t('notif_os_btn_all_app', 'Set All to In-App')}
                onClick={() => handleSetAllModes('APP')}
                className="w-full lg:w-auto justify-center min-h-[42px]"
              />
            </div>
          </div>
        </div>

        <SettingsGrid>
          {categoryCards.map((card) => (
            <UniversalCard
              key={card.id}
              title={card.title}
              subtitle={card.subtitle}
              icon={card.icon}
              footer={
                <CustomSettingsDropdown
                  value={modes[card.id]}
                  options={deliveryOptions}
                  onChange={(val: NotificationDeliveryMode) => handleModeChange(card.id, val)}
                />
              }
            />
          ))}

          <UniversalCard
            title={t('notify_author_only', 'Creator Replies Only')}
            subtitle={t('notify_author_only_desc', 'Only notify when the original post creator replies.')}
            icon={t('icon_person', 'person')}
            onClick={toggleNotifyAuthorOnly}
            actions={<SettingsToggle checked={notifyAuthorOnly} />}
          />

          <UniversalCard
            title={t('notif_per_mason', "Per-{Mason} Post Alerts")}
            subtitle={t('notif_per_mason_desc', "Enable specific post alerts for {Masons} you follow.")}
            icon={t('icon_notifications_active', 'notifications_active')}
            onClick={() => setShowMasonPanel(true)}
            actions={
              <div className="px-3 py-1.5 rounded-xl glass-surface backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 shadow-sm">
                <span className="material-symbols-outlined !text-[14px] theme-text-accent">
                  {t('icon_notifications_active', 'notifications_active')}
                </span>
                <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                  {enabledMasonCount} / {followedMasons.length}
                </span>
              </div>
            }
          >
            <ActionButton
              variant="glass"
              icon={t('icon_tune', 'tune')}
              label={t('notif_per_mason_btn', "Manage {Mason} Alerts")}
              className="w-full pointer-events-none mt-2"
            />
          </UniversalCard>
        </SettingsGrid>
      </TabContainer>

      <SidePanel
        isOpen={showMasonPanel}
        onClose={() => setShowMasonPanel(false)}
        title={t('notif_per_mason', "Per-{Mason} Post Alerts")}
        subtitle={t('notif_per_mason_desc', "Enable specific post alerts for {Masons} you follow.")}
        icon={t('icon_notifications_active', 'notifications_active')}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[760px]"
        headerActions={
          followedMasons.length > 0 ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t('icon_notifications_active', 'notifications_active')}
                tooltip={t('notif_per_mason_enable_all', 'Enable All')}
                onClick={() => setAllMasonAlerts(true)}
              />
              <PanelHeaderButton
                icon={t('icon_notifications_off', 'notifications_off')}
                tooltip={t('notif_per_mason_disable_all', 'Mute All')}
                onClick={() => setAllMasonAlerts(false)}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t('icon_notifications_active', 'notifications_active')}
            overline={t('tab_notifs', 'Notifications')}
            title={t('notif_per_mason', "Per-{Mason} Post Alerts")}
            description={t('notif_per_mason_desc', "Enable specific post alerts for {Masons} you follow.")}
            badge={`${enabledMasonCount} / ${followedMasons.length}`}
            variant="accent"
          >
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                icon={t('icon_group', 'group')}
                iconColorClass="text-[var(--accent)]"
                label={t('notif_per_mason', "Per-{Mason} Post Alerts")}
                value={followedMasons.length}
              />
              <StatBox
                icon={t('icon_notifications_active', 'notifications_active')}
                iconColorClass="text-[var(--success)]"
                label={t('comp_enabled', 'Alerts Enabled')}
                value={enabledMasonCount}
              />
            </div>
          </SidePanelHeroCard>

          <ActionPill
            searchQuery={masonSearchQuery}
            setSearchQuery={setMasonSearchQuery}
            searchPlaceholder={t('nav_search', 'Search...')}
            primaryPopover={{
              icon: t('icon_tune', 'tune'),
              label: t('filters', 'Filters'),
              content: (
                <div className="flex flex-col gap-4 w-[280px] p-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t('status', 'Status')}
                    </span>
                    <InlineFilterGroup
                      value={masonAlertFilter}
                      onChange={(v: string) => setMasonAlertFilter(v as any)}
                      options={[
                        { id: 'all', label: t('filter_all', 'All') },
                        { id: 'enabled', label: t('comp_enabled', 'Enabled') },
                        { id: 'disabled', label: t('comp_disabled', 'Disabled') },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                      {t('verified', 'Verified')}
                    </span>
                    <InlineFilterGroup
                      value={masonVerifiedFilter}
                      onChange={(v: string) => setMasonVerifiedFilter(v as any)}
                      options={[
                        { id: 'all', label: t('filter_all', 'All') },
                        { id: 'verified', label: t('verified', 'Verified') },
                        { id: 'standard', label: t('status_standard_clearance', 'Standard Clearance') },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />

          <UniversalGroup
            title={t('notif_per_mason', "Per-{Mason} Post Alerts")}
            icon={t('icon_group', 'group')}
            headerAction={
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)]">
                {filteredFollowedMasons.length}
              </span>
            }
          >
            {filteredFollowedMasons.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  icon={t('icon_person_search', 'person_search')}
                  title={t('settings_no_masons', "No {Masons} Followed")}
                  subtitle={t('notif_per_mason_desc', "Enable specific post alerts for {Masons} you follow.")}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {filteredFollowedMasons.map((m) => {
                  const isAlertEnabled = Boolean(masonAlerts[m.id]);
                  return (
                    <UniversalCard
                      key={m.id}
                      image={m.avatar_url || undefined}
                      icon={t('icon_person', 'person')}
                      isActive={isAlertEnabled}
                      title={
                        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                          <span className="truncate">{m.name}</span>
                          {m.is_verified && (
                            <span className="relative inline-flex items-center shrink-0 cursor-default">
                              <span className="material-symbols-outlined !text-[16px] text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]">
                                {t('icon_verified_user', 'verified_user')}
                              </span>
                              <HoverTooltip
                                title={t('verified', 'Verified')}
                                icon={t('icon_verified_user', 'verified_user')}
                                variant="success"
                              />
                            </span>
                          )}
                        </span>
                      }
                      subtitle={
                        m.tagline ||
                        t('notif_per_mason_card_fallback_sub', "Receive notifications when this {mason} publishes new {dispatches} or updates.")
                      }
                      onClick={() => toggleMasonAlert(m.id)}
                      actions={<SettingsToggle checked={isAlertEnabled} />}
                    />
                  );
                })}
              </div>
            )}
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
