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
  CustomDropdown,
} from '../shared';
import { supabase, supabaseAuth } from '../supabase';
import { useStore } from '../store';
import { getSupporterState } from '../utils/supporterManager';
import { isDesktop } from '../utils/envUtils';
import {
  NotificationCategory,
  NotificationDeliveryMode,
  SystemNotificationPermissionState,
  ALL_NOTIFICATION_CATEGORIES,
  GLOBAL_ONLY_NOTIFICATION_CATEGORIES,
  SPOKE_NOTIFICATION_CATEGORIES,
  getNotificationMode,
  setNotificationMode,
  setAllNotificationModes,
  getCrossWorkspaceNotificationsEnabled,
  setCrossWorkspaceNotificationsEnabled,
  getAllowedCrossWorkspaceSpokes,
  setAllowedCrossWorkspaceSpokes,
  getNotificationScopePreference,
  setNotificationScopePreference,
  hasSpokeNotificationOverrides,
  clearSpokeNotificationOverrides,
  getAvailableSpokeWorkspaces,
  getSystemNotificationPermissionState,
  requestSystemNotificationPermission,
  notifyOS,
} from '../utils/notificationHelper';

export default function NotificationsTab() {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);

  const [availableSpokes, setAvailableSpokes] = useState<
    Array<{ id: string; schema_id: string; name: string; icon?: string }>
  >([]);

  const [selectedScope, setSelectedScope] = useState<string>(() => {
    const saved = getNotificationScopePreference();
    if (saved && saved !== 'global') return saved;
    return 'global';
  });

  const [crossWorkspaceEnabled, setCrossWorkspaceEnabledState] = useState<boolean>(() =>
    getCrossWorkspaceNotificationsEnabled()
  );

  const [allowedCrossSpokes, setAllowedCrossSpokesState] = useState<string[]>(() =>
    getAllowedCrossWorkspaceSpokes()
  );

  const activeSpokeKey = selectedScope === 'global' ? undefined : selectedScope;

  const readModesForScope = useCallback((spokeKey?: string) => {
    return {
      keepers_news: getNotificationMode('keepers_news', 'global'),
      patch_update_logs: getNotificationMode('patch_update_logs', 'global'),
      defcon: getNotificationMode('defcon', spokeKey),
      alert_banner: getNotificationMode('alert_banner', spokeKey),
      system_dispatch: getNotificationMode('system_dispatch', spokeKey),
      new_posts: getNotificationMode('new_posts', spokeKey),
      replies: getNotificationMode('replies', spokeKey),
      support: getNotificationMode('support', spokeKey),
    };
  }, []);

  const [modes, setModes] = useState<Record<NotificationCategory, NotificationDeliveryMode>>(() =>
    readModesForScope(activeSpokeKey)
  );

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

  useEffect(() => {
    let mounted = true;
    getAvailableSpokeWorkspaces(supabaseAuth, workspaces).then((list) => {
      if (mounted) {
        setAvailableSpokes(list);
        const allIds = list.map((s) => s.schema_id);
        setAllowedCrossSpokesState(getAllowedCrossWorkspaceSpokes(allIds));
      }
    });
    return () => {
      mounted = false;
    };
  }, [workspaces, activeWorkspaceId]);

  const syncState = useCallback(async () => {
    const currentScope = getNotificationScopePreference();
    const spokeKey = currentScope === 'global' ? undefined : currentScope;
    setSelectedScope(currentScope);
    setCrossWorkspaceEnabledState(getCrossWorkspaceNotificationsEnabled());
    setAllowedCrossSpokesState(
      getAllowedCrossWorkspaceSpokes(availableSpokes.map((s) => s.schema_id))
    );
    setModes(readModesForScope(spokeKey));
    const perm = await getSystemNotificationPermissionState();
    setPermissionState(perm);
  }, [readModesForScope, availableSpokes]);

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

  const handleScopeChange = (nextScope: string) => {
    setSelectedScope(nextScope);
    setNotificationScopePreference(nextScope);
    const spokeKey = nextScope === 'global' ? undefined : nextScope;
    setModes(readModesForScope(spokeKey));
  };

  const toggleCrossWorkspace = () => {
    const nextVal = !crossWorkspaceEnabled;
    const allIds = availableSpokes.map((s) => s.schema_id);
    if (nextVal) {
      setCrossWorkspaceEnabledState(true);
      setCrossWorkspaceNotificationsEnabled(true);
      const nextSpokes = getAllowedCrossWorkspaceSpokes(allIds);
      const effectiveSpokes = nextSpokes.length > 0 ? nextSpokes : allIds;
      setAllowedCrossSpokesState(effectiveSpokes);
      setAllowedCrossWorkspaceSpokes(effectiveSpokes);
    } else {
      setCrossWorkspaceEnabledState(false);
      setCrossWorkspaceNotificationsEnabled(false);
      setAllowedCrossSpokesState([]);
    }
  };

  const handleAllowedCrossSpokesChange = (nextIds: string[]) => {
    const cleaned = Array.isArray(nextIds) ? nextIds.map(String) : [];
    setAllowedCrossSpokesState(cleaned);
    setAllowedCrossWorkspaceSpokes(cleaned);
    setCrossWorkspaceEnabledState(cleaned.length > 0);
  };

  const handleResetSpokeOverrides = () => {
    if (!activeSpokeKey) return;
    clearSpokeNotificationOverrides(activeSpokeKey);
    setModes(readModesForScope(activeSpokeKey));
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
    const targetSpoke = GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)
      ? undefined
      : activeSpokeKey;
    setNotificationMode(category, nextMode, targetSpoke);
    setModes((prev) => ({ ...prev, [category]: nextMode }));
  };

  const handleEnableSystemNotifications = async () => {
    const perm = await requestSystemNotificationPermission();
    setPermissionState(perm);
    if (perm === 'granted') {
      ALL_NOTIFICATION_CATEGORIES.forEach((cat) => {
        if (getNotificationMode(cat, activeSpokeKey) !== 'NONE') {
          setNotificationMode(cat, 'OS', activeSpokeKey);
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
    setAllNotificationModes(targetMode, activeSpokeKey);
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

  const bulkModeValue = useMemo(() => {
    const targetCats =
      selectedScope === 'global' ? ALL_NOTIFICATION_CATEGORIES : SPOKE_NOTIFICATION_CATEGORIES;
    const uniqueModes = new Set(targetCats.map((cat) => modes[cat]));
    if (uniqueModes.size === 1) {
      return Array.from(uniqueModes)[0] as NotificationDeliveryMode;
    }
    return 'CUSTOM';
  }, [modes, selectedScope]);

  const bulkDeliveryOptions = useMemo(() => {
    const base = [
      { id: 'OS', label: t('notif_mode_os', 'System (OS)') },
      { id: 'APP', label: t('notif_mode_app', 'In-App Only') },
      { id: 'NONE', label: t('notif_mode_none', 'None (Muted)') },
    ];
    if (bulkModeValue === 'CUSTOM') {
      base.push({
        id: 'CUSTOM',
        label: t('notif_mode_custom', 'Custom (Per-Category)'),
      });
    }
    return base;
  }, [bulkModeValue, t]);

  const crossSpokeOptions = useMemo(() => {
    return availableSpokes.map((spoke) => {
      const isCurrent =
        spoke.schema_id === activeWorkspaceId || spoke.id === activeWorkspaceId;
      return {
        id: spoke.schema_id,
        label: isCurrent
          ? `${spoke.name} (${t('active', 'Active')})`
          : spoke.name,
      };
    });
  }, [availableSpokes, activeWorkspaceId, t]);

  const scopeOptions = useMemo(() => {
    const opts = [
      {
        id: 'global',
        label: t('notify_scope_global', 'Global (All Spokes)'),
      },
    ];
    availableSpokes.forEach((spoke) => {
      const isCurrent =
        spoke.schema_id === activeWorkspaceId || spoke.id === activeWorkspaceId;
      opts.push({
        id: spoke.schema_id,
        label: isCurrent
          ? `${spoke.name} (${t('active', 'Active')})`
          : `${spoke.name} (${t('notify_scope_spoke_suffix', 'Spoke')})`,
      });
    });
    return opts;
  }, [availableSpokes, activeWorkspaceId, t]);

  const selectedSpokeName = useMemo(() => {
    if (selectedScope === 'global') return t('notify_scope_global_short', 'Global');
    const found = availableSpokes.find(
      (s) => s.schema_id === selectedScope || s.id === selectedScope
    );
    return found?.name || selectedScope;
  }, [selectedScope, availableSpokes, t]);

  const spokeHasCustomOverrides = Boolean(
    activeSpokeKey && hasSpokeNotificationOverrides(activeSpokeKey)
  );

  const foundryCards: {
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
    isGlobalOnly?: boolean;
  }[] = [
    {
      id: 'keepers_news',
      title: t('notify_keepers_news', 'Keepers News'),
      subtitle: t(
        'notify_keepers_news_desc',
        'Official news, announcements, and platform dispatches from Sanctuary Foundry.'
      ),
      icon: t('icon_campaign', 'campaign'),
      isGlobalOnly: true,
    },
    {
      id: 'patch_update_logs',
      title: t('notify_patch_update_logs', 'Patch Update Logs'),
      subtitle: t(
        'notify_patch_update_logs_desc',
        'Sanctuary OS Public and Daily Dev Build release notes and patch logs.'
      ),
      icon: t('icon_new_releases', 'new_releases'),
      isGlobalOnly: true,
    },
  ];

  const spokeAlertCards: {
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
    isGlobalOnly?: boolean;
  }[] = [
    {
      id: 'alert_banner',
      title: t('notify_alert_banner', 'Global Alerts (Spoke Wayfinders)'),
      subtitle: t(
        'notify_alert_banner_desc',
        'Urgent network-wide security advisories and pinned alerts broadcast by Spoke Wayfinders.'
      ),
      icon: t('icon_warning', 'warning'),
    },
    {
      id: 'system_dispatch',
      title: t('notify_system_dispatch', 'System Dispatches'),
      subtitle: t(
        'notify_system_dispatch_desc',
        'Official community announcements, maintenance notices, and updates from Spoke Wayfinders.'
      ),
      icon: t('icon_admin_panel_settings', 'admin_panel_settings'),
    },
    {
      id: 'defcon',
      title: t('notify_defcon_title', 'Game Update & Lockdown Alerts'),
      subtitle: t(
        'notify_defcon_desc',
        'Emergency alerts when a new game update is detected or a safety lockdown is triggered.'
      ),
      icon: t('icon_shield', 'shield'),
    },
  ];

  const renderCategoryCard = (card: {
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
    isGlobalOnly?: boolean;
  }) => {
    const scopeBadgeText = card.isGlobalOnly
      ? t('notify_scope_global_short', 'Global')
      : selectedSpokeName;

    return (
      <UniversalCard
        key={card.id}
        title={card.title}
        subtitle={card.subtitle}
        icon={card.icon}
        actions={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] text-[9px] font-black uppercase tracking-wider">
            <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
              {card.isGlobalOnly
                ? t('icon_public', 'public')
                : selectedScope === 'global'
                  ? t('icon_public', 'public')
                  : t('icon_sports_esports', 'sports_esports')}
            </span>
            {scopeBadgeText}
          </span>
        }
        footer={
          <CustomSettingsDropdown
            value={modes[card.id]}
            options={deliveryOptions}
            onChange={(val: NotificationDeliveryMode) => handleModeChange(card.id, val)}
          />
        }
      />
    );
  };

  const isGranted = permissionState === 'granted';
  const isDenied = permissionState === 'denied';
  const enabledMasonCount = followedMasons.filter((m) => Boolean(masonAlerts[m.id])).length;

  return (
    <div className="flex flex-col gap-30 w-full pb-48">
      {/* SECTION 1: System Delivery & Routing Scope */}
      <TabContainer
        title={t('notif_section_routing', 'System Delivery & Scope')}
        icon={t('icon_tune', 'tune')}
      >
        <SettingsGrid>
          {/* 1. Test: System & PWA Notification Status / Test Alert Card */}
          <UniversalCard
            title={t('notif_os_banner_title', 'System & PWA Notifications')}
            subtitle={
              isGranted
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
                    )
            }
            icon={
              isGranted
                ? t('icon_notifications_active', 'notifications_active')
                : isDenied
                  ? t('icon_notifications_off', 'notifications_off')
                  : t('icon_notifications', 'notifications')
            }
            actions={
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-transparent text-[9px] font-black uppercase tracking-wider ${
                  isGranted
                    ? 'border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)]'
                    : isDenied
                      ? 'border-[color-mix(in_srgb,var(--danger)_42%,transparent)] text-[var(--danger)]'
                      : 'border-[color-mix(in_srgb,var(--accent)_42%,transparent)] text-[var(--accent)]'
                }`}
              >
                <span className="material-symbols-outlined !text-[11px]">
                  {isGranted
                    ? t('icon_check_circle', 'check_circle')
                    : isDenied
                      ? t('icon_block', 'block')
                      : t('icon_notifications', 'notifications')}
                </span>
                {isGranted
                  ? t('active', 'Active')
                  : isDenied
                    ? t('notif_os_status_blocked', 'Permission Blocked')
                    : t('status', 'Status')}
              </span>
            }
            footer={
              <div className="flex flex-col gap-2 w-full">
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
                    className="w-full justify-center"
                  />
                )}
                <ActionButton
                  variant="glass"
                  icon={t('icon_send', 'send')}
                  label={t('notif_os_btn_test', 'Send Test Notification')}
                  onClick={handleSendTestNotification}
                  className="w-full justify-center"
                />
              </div>
            }
          />

          {/* 2. OS or App: Bulk Delivery Preset Card */}
          <UniversalCard
            title={t('notif_bulk_preset_title', 'Bulk Delivery Preset')}
            subtitle={t(
              'notif_bulk_preset_desc',
              'Apply a delivery mode to all notification categories in the selected scope at once.'
            )}
            icon={t('icon_done_all', 'done_all')}
            actions={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] text-[9px] font-black uppercase tracking-wider">
                <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                  {selectedScope === 'global'
                    ? t('icon_public', 'public')
                    : t('icon_sports_esports', 'sports_esports')}
                </span>
                {selectedSpokeName}
              </span>
            }
            footer={
              <CustomSettingsDropdown
                value={bulkModeValue}
                options={bulkDeliveryOptions}
                onChange={(val: string) => {
                  if (val === 'OS' || val === 'APP' || val === 'NONE') {
                    handleSetAllModes(val);
                  }
                }}
              />
            }
          />

          {/* 3. Scope: Notification Rule Scope Card */}
          <UniversalCard
            title={t('notify_rule_scope_title', 'Notification Rule Scope')}
            subtitle={t(
              'notify_rule_scope_desc',
              'Configure delivery rules globally across all workspaces, or customize rules per individual Spoke.'
            )}
            icon={t('icon_hub', 'hub')}
            actions={
              selectedScope !== 'global' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-transparent border-[color-mix(in_srgb,var(--accent)_38%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider">
                  <span className="material-symbols-outlined !text-[11px]">
                    {spokeHasCustomOverrides
                      ? t('icon_tune', 'tune')
                      : t('icon_public', 'public')}
                  </span>
                  {spokeHasCustomOverrides
                    ? t('notify_scope_custom_badge', 'Custom Spoke Rules')
                    : t('notify_scope_inherited_badge', 'Inherits Global')}
                </span>
              ) : undefined
            }
            footer={
              <div className="flex flex-col gap-2 w-full">
                <CustomSettingsDropdown
                  value={selectedScope}
                  options={scopeOptions}
                  onChange={(val: string) => handleScopeChange(val)}
                />
                {spokeHasCustomOverrides && (
                  <ActionButton
                    variant="glass"
                    icon={t('icon_restart_alt', 'restart_alt')}
                    label={t('notify_scope_reset_btn', 'Reset Spoke to Global Defaults')}
                    onClick={handleResetSpokeOverrides}
                    className="w-full justify-center !py-1.5 !text-[10px]"
                  />
                )}
              </div>
            }
          />

          {/* 4. Cross: Cross-Workspace Notifications Card */}
          <UniversalCard
            title={t('notify_cross_workspace_title', 'Cross-Workspace Notifications')}
            subtitle={t(
              'notify_cross_workspace_desc',
              'Show notifications from other workspaces while a different workspace is selected on this device.'
            )}
            icon={t('icon_public', 'public')}
            onClick={toggleCrossWorkspace}
            actions={<SettingsToggle checked={crossWorkspaceEnabled} />}
            footer={
              <div className="relative w-full z-10" onClick={(e) => e.stopPropagation()}>
                <CustomDropdown
                  multiSelect={true}
                  disableTint={true}
                  value={crossWorkspaceEnabled ? allowedCrossSpokes : []}
                  options={crossSpokeOptions}
                  onChange={handleAllowedCrossSpokesChange}
                  placeholder={t(
                    'notify_cross_none_placeholder',
                    'Disabled (Active Workspace Only)'
                  )}
                />
              </div>
            }
          />
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 2: Sanctuary Foundry (Core OS) */}
      <TabContainer
        title={t('notif_section_foundry', 'Sanctuary Foundry (Core OS)')}
        icon={t('icon_shield', 'shield')}
      >
        <SettingsGrid>
          {foundryCards.map(renderCategoryCard)}
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 3: Spoke Alerts & Safeguards */}
      <TabContainer
        title={t('notif_section_spoke_alerts', 'Spoke Alerts & Safeguards')}
        icon={t('icon_warning', 'warning')}
      >
        <SettingsGrid>
          {spokeAlertCards.map(renderCategoryCard)}
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 4: Comm-Link & Support */}
      <TabContainer
        title={t('notif_section_commlink', 'Comm-Link & Support')}
        icon={t('icon_forum', 'forum')}
      >
        <SettingsGrid>
          {renderCategoryCard({
            id: 'new_posts',
            title: t('btn_new_posts', 'Comm-Link Posts'),
            subtitle: t('notify_new_posts_desc', 'Notify when followed {Masons} publish new posts.'),
            icon: t('icon_post_add', 'post_add'),
          })}

          <UniversalCard
            title={t('notif_per_mason', 'Per-{Mason} Post Alerts')}
            subtitle={t('notif_per_mason_desc', 'Enable specific post alerts for {Masons} you follow.')}
            icon={t('icon_notifications_active', 'notifications_active')}
            onClick={() => setShowMasonPanel(true)}
            actions={
              <div className="px-2.5 py-1 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_36%,transparent)] flex items-center gap-1.5">
                <span className="material-symbols-outlined !text-[12px] theme-text-accent">
                  {t('icon_notifications_active', 'notifications_active')}
                </span>
                <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                  {enabledMasonCount} / {followedMasons.length}
                </span>
              </div>
            }
            footer={
              <ActionButton
                variant="glass"
                icon={t('icon_tune', 'tune')}
                label={t('notif_per_mason_btn', 'Manage {Mason} Alerts')}
                className="w-full justify-center pointer-events-none"
              />
            }
          />

          {renderCategoryCard({
            id: 'replies',
            title: t('ui.replies', 'Comm-Link Replies'),
            subtitle: t('notify_replies_desc', 'Direct replies and responses on Comm-Link threads.'),
            icon: t('icon_chat_bubble', 'chat_bubble'),
          })}

          <UniversalCard
            title={t('notify_author_only', 'Creator Replies Only')}
            subtitle={t('notify_author_only_desc', 'Only notify when the original post creator replies.')}
            icon={t('icon_person', 'person')}
            onClick={toggleNotifyAuthorOnly}
            actions={<SettingsToggle checked={notifyAuthorOnly} />}
          />

          {renderCategoryCard({
            id: 'support',
            title: t('notify_support', 'Support Alerts'),
            subtitle: t('notify_support_desc', 'Replies and updates on your support tickets.'),
            icon: t('icon_contact_support', 'contact_support'),
          })}
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
    </div>
  );
}
