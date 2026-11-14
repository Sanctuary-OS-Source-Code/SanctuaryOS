import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLexicon } from '../LexiconContext';
import { SettingsToggle, TabContainer, SettingsGrid, CustomSettingsDropdown } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';
import {
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
} from '../components/universal/UniversalLayout';
import { LiquidGlassAlertCard } from '../components/BlueprintPatchReadiness';
import {
  ActionButton,
  SidePanel,
  ActionPill,
  InlineFilterGroup,
  HoverTooltip,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  CustomDropdown,
  VAULT_CHIP_CLASS,
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
  getNotificationMode,
  setNotificationMode,
  setAllNotificationModes,
  getCrossWorkspaceNotificationsEnabled,
  setCrossWorkspaceNotificationsEnabled,
  getAllowedCrossWorkspaceSpokes,
  setAllowedCrossWorkspaceSpokes,
  setNotificationScopePreference,
  clearSpokeNotificationOverrides,
  getAvailableSpokeWorkspaces,
  getSystemNotificationPermissionState,
  requestSystemNotificationPermission,
  notifyOS,
  getModAlertsBlueprintScope,
  setModAlertsBlueprintScope,
  getMutedSpokesForCategory,
  setMutedSpokesForCategory,
  syncCrossDeviceNotificationState,
  getNotificationLastSyncedAt,
} from '../utils/notificationHelper';

export default function NotificationsTab() {
  const { t } = useLexicon();
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);
  const playSets = useStore((state: any) => state.playSets);
  const session = useStore((state: any) => state.session);
  const localOnly = useStore((state: any) => state.localOnly);

  const [modAlertsBpScope, setModAlertsBpScopeState] = useState<string>(() =>
    getModAlertsBlueprintScope()
  );

  const [availableSpokes, setAvailableSpokes] = useState<
    Array<{ id: string; schema_id: string; name: string; icon?: string }>
  >([]);

  const [crossWorkspaceEnabled, setCrossWorkspaceEnabledState] = useState<boolean>(() =>
    getCrossWorkspaceNotificationsEnabled()
  );

  const readGlobalModes = useCallback(() => {
    return {
      keepers_news: getNotificationMode('keepers_news', 'global'),
      patch_update_logs: getNotificationMode('patch_update_logs', 'global'),
      defcon: getNotificationMode('defcon', 'global'),
      alert_banner: getNotificationMode('alert_banner', 'global'),
      system_dispatch: getNotificationMode('system_dispatch', 'global'),
      mod_alerts: getNotificationMode('mod_alerts', 'global'),
      new_posts: getNotificationMode('new_posts', 'global'),
      replies: getNotificationMode('replies', 'global'),
      support: getNotificationMode('support', 'global'),
    };
  }, []);

  const [modes, setModes] = useState<Record<NotificationCategory, NotificationDeliveryMode>>(() =>
    readGlobalModes()
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
    setNotificationScopePreference('global');
    let mounted = true;
    getAvailableSpokeWorkspaces(supabaseAuth, workspaces).then((list) => {
      if (mounted) {
        setAvailableSpokes(list);
      }
    });
    return () => {
      mounted = false;
    };
  }, [workspaces, activeWorkspaceId]);

  const readMutedSpokesMap = useCallback(() => {
    const map = {} as Record<NotificationCategory, string[]>;
    ALL_NOTIFICATION_CATEGORIES.forEach((cat) => {
      map[cat] = getMutedSpokesForCategory(cat);
    });
    return map;
  }, []);

  const [mutedSpokesByCat, setMutedSpokesByCat] = useState<Record<NotificationCategory, string[]>>(
    () => readMutedSpokesMap()
  );
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    getNotificationLastSyncedAt()
  );

  const syncState = useCallback(async () => {
    setModAlertsBpScopeState(getModAlertsBlueprintScope());
    setCrossWorkspaceEnabledState(getCrossWorkspaceNotificationsEnabled());
    setModes(readGlobalModes());
    setMutedSpokesByCat(readMutedSpokesMap());
    setLastSyncedAt(getNotificationLastSyncedAt());
    const perm = await getSystemNotificationPermissionState();
    setPermissionState(perm);
  }, [readGlobalModes, readMutedSpokesMap]);

  useEffect(() => {
    syncState();
    const handleSyncCompleted = () => setLastSyncedAt(getNotificationLastSyncedAt());
    window.addEventListener('sanctuary_notification_prefs_changed', syncState);
    window.addEventListener('sanctuary_notification_sync_completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('sanctuary_notification_prefs_changed', syncState);
      window.removeEventListener('sanctuary_notification_sync_completed', handleSyncCompleted);
    };
  }, [syncState]);

  const handleManualCloudSync = async () => {
    if (!session?.user?.id || localOnly || isSyncingCloud) return;
    setIsSyncingCloud(true);
    try {
      const ok = await syncCrossDeviceNotificationState(session);
      setLastSyncedAt(getNotificationLastSyncedAt());
      if (ok) {
        useStore
          .getState()
          .pushStatus(
            t(
              'notify_cloud_sync_complete',
              'Zero-PII alert & notification state synced across devices.'
            )
          );
      }
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleActiveSpokesForCategoryChange = (
    category: NotificationCategory,
    selectedActiveSpokeIds: string[]
  ) => {
    const allIds = availableSpokes.map((s) => s.schema_id);
    const activeSet = new Set(selectedActiveSpokeIds.map((id) => String(id || '').trim()));
    const nextMuted = allIds.filter((id) => !activeSet.has(id));
    setMutedSpokesForCategory(category, nextMuted);
    setMutedSpokesByCat((prev) => ({ ...prev, [category]: nextMuted }));
  };

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

  const toggleCrossWorkspace = () => {
    const nextVal = !crossWorkspaceEnabled;
    const allIds = availableSpokes.map((s) => s.schema_id);
    if (nextVal) {
      setCrossWorkspaceEnabledState(true);
      setCrossWorkspaceNotificationsEnabled(true);
      const existing = getAllowedCrossWorkspaceSpokes(allIds);
      setAllowedCrossWorkspaceSpokes(existing.length > 0 ? existing : allIds);
    } else {
      setCrossWorkspaceEnabledState(false);
      setCrossWorkspaceNotificationsEnabled(false);
    }
  };

  const clearAnyLegacySpokeOverrides = () => {
    availableSpokes.forEach((sp) => {
      if (sp?.schema_id) clearSpokeNotificationOverrides(sp.schema_id);
      if (sp?.id) clearSpokeNotificationOverrides(sp.id);
    });
  };

  const handleModeChange = async (
    category: NotificationCategory,
    nextMode: NotificationDeliveryMode
  ) => {
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
    clearAnyLegacySpokeOverrides();
    setNotificationMode(category, nextMode);
    setModes((prev) => ({ ...prev, [category]: nextMode }));
  };

  const handleEnableSystemNotifications = async () => {
    const perm = await requestSystemNotificationPermission();
    setPermissionState(perm);
    if (perm === 'granted') {
      clearAnyLegacySpokeOverrides();
      ALL_NOTIFICATION_CATEGORIES.forEach((cat) => {
        if (getNotificationMode(cat, 'global') !== 'NONE') {
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
    clearAnyLegacySpokeOverrides();
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

  const bulkModeValue = useMemo(() => {
    const uniqueModes = new Set(ALL_NOTIFICATION_CATEGORIES.map((cat) => modes[cat]));
    if (uniqueModes.size === 1) {
      return Array.from(uniqueModes)[0] as NotificationDeliveryMode;
    }
    return 'CUSTOM';
  }, [modes]);

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

  const spokeOptions = useMemo(() => {
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

  const isGranted = permissionState === 'granted';
  const isDenied = permissionState === 'denied';
  const enabledMasonCount = followedMasons.filter((m) => Boolean(masonAlerts[m.id])).length;
  const isCloudSyncReady = Boolean(session?.user?.id && !localOnly);

  const renderCategoryCard = (card: {
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
    isGlobalOnly?: boolean;
    extraFooter?: React.ReactNode;
  }) => {
    const allSpokeIds = availableSpokes.map((s) => s.schema_id);
    const mutedSet = new Set(mutedSpokesByCat[card.id] || []);
    const activeSpokeIdsForCat = allSpokeIds.filter((id) => !mutedSet.has(id));
    const mutedCount = allSpokeIds.length - activeSpokeIdsForCat.length;
    const isMutedGlobally = modes[card.id] === 'NONE';
    const showSpokeMuteSelector =
      !card.isGlobalOnly && availableSpokes.length > 0 && !isMutedGlobally;

    const spokeMuteDisplayLabel =
      mutedCount === 0
        ? t('notify_spokes_all_active', 'All Workspaces Active')
        : activeSpokeIdsForCat.length === 0
          ? t('notify_all_spokes_muted', 'All Workspaces Muted')
          : `${activeSpokeIdsForCat.length} ${t('active', 'Active')} • ${mutedCount} ${t('notify_mode_muted', 'Muted')}`;

    return (
      <UniversalCard
        key={card.id}
        headerStyle="inline"
        title={card.title}
        subtitle={card.subtitle}
        icon={card.icon}
        isActive={!isMutedGlobally}
        statusColor={
          isMutedGlobally ||
          (!card.isGlobalOnly && allSpokeIds.length > 0 && activeSpokeIdsForCat.length === 0)
            ? 'warning'
            : undefined
        }
        actions={
          !card.isGlobalOnly && mutedCount > 0 ? (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[11px] text-[var(--warning)]">
                {t('icon_notifications_paused', 'notifications_paused')}
              </span>
              <span>{`${mutedCount} ${t('notify_mode_muted', 'Muted')}`}</span>
            </span>
          ) : undefined
        }
        footer={
          <div className="flex flex-col gap-2.5 w-full">
            <CustomSettingsDropdown
              value={modes[card.id]}
              options={deliveryOptions}
              onChange={(val: NotificationDeliveryMode) => handleModeChange(card.id, val)}
            />

            {!isMutedGlobally && card.extraFooter}

            {showSpokeMuteSelector && (
              <div
                className="flex flex-col gap-1.5 pt-2 border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-80 flex items-center gap-1">
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {mutedCount > 0
                        ? t('icon_notifications_paused', 'notifications_paused')
                        : t('icon_workspaces', 'workspaces')}
                    </span>
                    {t('notify_enabled_workspaces_label', 'Enabled Workspaces')}
                  </span>
                  {mutedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleActiveSpokesForCategoryChange(card.id, allSpokeIds)}
                      className="text-[10px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      {t('notify_unmute_all_spokes', 'Unmute All')}
                    </button>
                  )}
                </div>
                <CustomDropdown
                  multiSelect={true}
                  disableTint={true}
                  value={activeSpokeIdsForCat}
                  options={spokeOptions}
                  displayLabel={spokeMuteDisplayLabel}
                  placeholder={t('notify_all_spokes_muted', 'All Workspaces Muted')}
                  onChange={(vals: string[]) =>
                    handleActiveSpokesForCategoryChange(
                      card.id,
                      Array.isArray(vals) ? vals : []
                    )
                  }
                />
              </div>
            )}
          </div>
        }
      />
    );
  };

  const foundryCards: Array<{
    id: NotificationCategory;
    title: string;
    subtitle: string;
    icon: string;
    isGlobalOnly?: boolean;
  }> = [
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
        'Sanctuary OS Public and Dev Build release notes and patch logs.'
      ),
      icon: t('icon_new_releases', 'new_releases'),
      isGlobalOnly: true,
    },
  ];

  const modAlertsScopeOptions = useMemo(() => {
    return [
      {
        id: 'ACTIVE',
        label: t('staging_desktop_bp_active_badge', 'Active {Blueprint}'),
      },
      {
        id: 'ALL_VAULT',
        label: t('filter_all_vault_scope', 'All {Vault}'),
      },
      ...(Array.isArray(playSets)
        ? playSets.map((ps: any) => ({
            id: String(ps?.name || 'Blueprint'),
            label: `${t('term_blueprint', '{Blueprint}')}: ${String(ps?.name || 'Blueprint')}`,
          }))
        : []),
    ];
  }, [playSets, t]);

  return (
    <div className="flex flex-col gap-12 w-full pb-32">
      {/* SECTION 1: Delivery Setup & Cross-Device Sync */}
      <TabContainer
        title={t('notif_section_setup_sync', 'Notification Setup & Sync')}
        icon={t('icon_notifications_active', 'notifications_active')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={isDenied}
            icon={
              isDenied
                ? t('icon_notifications_off', 'notifications_off')
                : t('icon_cloud_done', 'cloud_done')
            }
            accentVar={isDenied ? 'var(--danger)' : 'var(--accent)'}
            iconColorClass={isDenied ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}
            badgeIcon={
              isCloudSyncReady
                ? t('icon_enhanced_encryption', 'enhanced_encryption')
                : t('icon_devices', 'devices')
            }
            badgeLabel={
              isCloudSyncReady
                ? t('notify_zero_pii_synced_badge', 'Zero-PII Synced')
                : t('notify_local_device_badge', 'Local Device')
            }
            overline={t('notify_sync_guide_overline', 'Cross-Device Deduplication')}
            title={
              isDenied
                ? t('notif_os_status_blocked', 'Permission Blocked')
                : t('notify_sync_guide_title', 'Once Per Alert Across All Rigs')
            }
            description={t(
              'notify_sync_clean_desc',
              'Seen or dismissed alerts—including the Command Center Global Alert Tile—sync automatically across Desktop, Steam Deck, Web, and Mobile with zero-PII encryption so each alert notifies you at most once.'
            )}
            actionLabel={
              isCloudSyncReady
                ? isSyncingCloud
                  ? t('loading', 'Loading')
                  : t('notify_btn_sync_now', 'Sync Alert State Now')
                : !isGranted
                  ? t('notif_os_btn_enable', 'Enable System Notifications')
                  : undefined
            }
            actionIcon={
              isCloudSyncReady
                ? t('icon_sync', 'sync')
                : t('icon_notifications_active', 'notifications_active')
            }
            actionVariant={isDenied ? 'danger' : 'glass'}
            onAction={
              isCloudSyncReady
                ? handleManualCloudSync
                : !isGranted
                  ? handleEnableSystemNotifications
                  : undefined
            }
          >
            {lastSyncedAt && isCloudSyncReady && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75">
                <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                  {t('icon_check_circle', 'check_circle')}
                </span>
                <span>
                  {`${t('notify_last_synced_prefix', 'Last synced')}: ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
            )}
          </LiquidGlassAlertCard>

          <UniversalCard
            headerStyle="inline"
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
            isActive={isGranted}
            statusColor={isDenied ? 'danger' : undefined}
            actions={
              <span className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[11px] ${
                    isGranted
                      ? 'text-[var(--success)]'
                      : isDenied
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--accent)]'
                  }`}
                >
                  {isGranted
                    ? t('icon_check_circle', 'check_circle')
                    : isDenied
                      ? t('icon_block', 'block')
                      : t('icon_notifications', 'notifications')}
                </span>
                <span>
                  {isGranted
                    ? t('active', 'Active')
                    : isDenied
                      ? t('notif_os_status_blocked', 'Permission Blocked')
                      : t('status', 'Status')}
                </span>
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

          <UniversalCard
            headerStyle="inline"
            title={t('notif_bulk_preset_title', 'Bulk Delivery Preset')}
            subtitle={t(
              'notif_bulk_preset_clean_desc',
              'Quickly switch every alert category below to System (OS), In-App Only, or Muted all at once.'
            )}
            icon={t('icon_done_all', 'done_all')}
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

          <UniversalCard
            headerStyle="inline"
            title={t('notify_background_workspaces_title', 'Background Workspace Alerts')}
            subtitle={t(
              'notify_background_workspaces_desc',
              'ON: Delivers alerts from your other unmuted game workspaces in the background.\nOFF: Only delivers alerts for your currently active workspace.'
            )}
            icon={t('icon_workspaces', 'workspaces')}
            isActive={crossWorkspaceEnabled}
            onClick={toggleCrossWorkspace}
            actions={<SettingsToggle checked={crossWorkspaceEnabled} />}
          />
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 2: Sanctuary Foundry (Core OS) */}
      <TabContainer
        title={t('notif_section_foundry', 'Sanctuary Foundry (Core OS)')}
        icon={t('icon_shield', 'shield')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={false}
            icon={t('icon_shield', 'shield')}
            accentVar="var(--accent)"
            iconColorClass="text-[var(--accent)]"
            badgeIcon={t('icon_public', 'public')}
            badgeLabel={t('notify_scope_global_short', 'Global')}
            overline={t('notify_foundry_guide_overline', 'Keepers Core Broadcasts')}
            title={t('notify_foundry_guide_title', 'Platform News & OS Build Logs')}
            description={t(
              'notify_foundry_guide_desc',
              'Keepers Core dispatches apply across the entire Sanctuary OS ecosystem—covering official platform announcements, security updates, and Public or Dev Build release notes.'
            )}
          />
          {foundryCards.map((card) => renderCategoryCard(card))}
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 3: Game & Mod Alerts */}
      <TabContainer
        title={t('notif_section_game_mod_alerts', 'Game & {Mod} Alerts')}
        icon={t('icon_warning', 'warning')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={false}
            icon={t('icon_notifications_paused', 'notifications_paused')}
            accentVar="var(--accent)"
            iconColorClass="text-[var(--accent)]"
            badgeIcon={t('icon_workspaces', 'workspaces')}
            badgeLabel={`${availableSpokes.length || 1} ${t('workspaces', 'Workspaces')}`}
            overline={t('notify_spoke_guide_overline', 'Per-Alert Workspace Filtering')}
            title={t('notify_spoke_guide_title', 'Mute Secondary Workspaces Per Alert Type')}
            description={t(
              'notify_spoke_clean_desc',
              'Each alert type below lets you pick how it notifies you and which game workspaces are enabled—so you can keep urgent advisories active everywhere while muting {Mod} updates on secondary games.'
            )}
          />

          {renderCategoryCard({
            id: 'alert_banner',
            title: t('notify_alert_banner', 'Global Alerts (Spoke Wayfinders)'),
            subtitle: t(
              'notify_alert_banner_desc',
              'Urgent network-wide security advisories and pinned alerts broadcast by Spoke Wayfinders.'
            ),
            icon: t('icon_warning', 'warning'),
          })}

          {renderCategoryCard({
            id: 'system_dispatch',
            title: t('notify_system_dispatch', 'System Dispatches'),
            subtitle: t(
              'notify_system_dispatch_desc',
              'Official community announcements, maintenance notices, and updates from Spoke Wayfinders.'
            ),
            icon: t('icon_admin_panel_settings', 'admin_panel_settings'),
          })}

          {renderCategoryCard({
            id: 'defcon',
            title: t('notify_defcon_title', 'Game Update & Lockdown Alerts'),
            subtitle: t(
              'notify_defcon_desc',
              'Emergency alerts when a new game update is detected or a safety lockdown is triggered.'
            ),
            icon: t('icon_shield', 'shield'),
          })}

          {renderCategoryCard({
            id: 'mod_alerts',
            title: t('notify_mod_alerts_title', '{Mod} Alerts & Patch Casualties'),
            subtitle: t(
              'notify_mod_alerts_desc',
              'Alerts when installed {mods} in your {Vault} or {Blueprints} have updates available, compatibility warnings, or patch casualties.'
            ),
            icon: t('icon_radar', 'radar'),
            extraFooter: (
              <div
                className="flex flex-col gap-1.5 pt-2 border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)]"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-80 px-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t('icon_map', 'map')}
                  </span>
                  {t('notify_mod_alerts_scope_short', 'Monitored {Mods}')}
                </span>
                <CustomSettingsDropdown
                  value={modAlertsBpScope}
                  options={modAlertsScopeOptions}
                  onChange={(val: string) => {
                    setModAlertsBpScopeState(val);
                    setModAlertsBlueprintScope(val);
                  }}
                />
              </div>
            ),
          })}
        </SettingsGrid>
      </TabContainer>

      {/* SECTION 4: Comm-Link & Support (Single Cohesive Row — Sub-options Folded Into Parent Cards) */}
      <TabContainer
        title={t('notif_section_commlink', 'Comm-Link & Support')}
        icon={t('icon_forum', 'forum')}
      >
        <SettingsGrid>
          <LiquidGlassAlertCard
            isAlertCard={false}
            icon={t('icon_forum', 'forum')}
            accentVar="var(--accent)"
            iconColorClass="text-[var(--accent)]"
            badgeIcon={t('icon_notifications_active', 'notifications_active')}
            badgeLabel={`${enabledMasonCount}/${followedMasons.length} ${t('term_masons', '{Masons}')}`}
            overline={t('notify_commlink_guide_overline', 'Creator & Ticket Subscriptions')}
            title={t('notify_commlink_guide_title', 'Followed {Masons}, Replies & Support')}
            description={t(
              'notify_commlink_guide_desc',
              'Manage notifications for new {Mason} {dispatches}, thread replies, and Support Ticket updates—with per-workspace mute controls and granular per-{Mason} opt-in.'
            )}
            actionLabel={t('notif_per_mason_btn', 'Manage {Mason} Alerts')}
            actionIcon={t('icon_tune', 'tune')}
            actionVariant="glass"
            onAction={() => setShowMasonPanel(true)}
          />

          {renderCategoryCard({
            id: 'new_posts',
            title: t('btn_new_posts', 'Comm-Link Posts'),
            subtitle: t('notify_new_posts_desc', 'Notify when followed {Masons} publish new posts.'),
            icon: t('icon_post_add', 'post_add'),
            extraFooter: (
              <div
                className="pt-2 border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <ActionButton
                  variant="glass"
                  icon={t('icon_tune', 'tune')}
                  label={`${t('notif_per_mason_btn', 'Manage {Mason} Alerts')} (${enabledMasonCount}/${followedMasons.length})`}
                  onClick={() => setShowMasonPanel(true)}
                  className="w-full justify-center"
                />
              </div>
            ),
          })}

          {renderCategoryCard({
            id: 'replies',
            title: t('ui.replies', 'Comm-Link Replies'),
            subtitle: t('notify_replies_desc', 'Direct replies and responses on Comm-Link threads.'),
            icon: t('icon_chat_bubble', 'chat_bubble'),
            extraFooter: (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNotifyAuthorOnly();
                }}
                className="flex items-center justify-between gap-2 px-3 py-2.5 mt-0.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] cursor-pointer transition-all"
              >
                <span className="text-[11px] font-bold text-[var(--text)] leading-snug">
                  {t('notify_author_only', 'Creator Replies Only')}
                </span>
                <SettingsToggle checked={notifyAuthorOnly} />
              </div>
            ),
          })}

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
        title={t('notif_per_mason', 'Per-{Mason} Post Alerts')}
        subtitle={t('notif_per_mason_desc', 'Enable specific post alerts for {Masons} you follow.')}
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
            title={t('notif_per_mason', 'Per-{Mason} Post Alerts')}
            description={t(
              'notif_per_mason_desc',
              'Enable specific post alerts for {Masons} you follow.'
            )}
            badge={`${enabledMasonCount} / ${followedMasons.length}`}
            variant="accent"
          >
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                icon={t('icon_group', 'group')}
                iconColorClass="text-[var(--accent)]"
                label={t('notif_per_mason', 'Per-{Mason} Post Alerts')}
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
                        {
                          id: 'standard',
                          label: t('status_standard_clearance', 'Standard Clearance'),
                        },
                      ]}
                    />
                  </div>
                </div>
              ),
            }}
          />

          <UniversalGroup
            title={t('notif_per_mason', 'Per-{Mason} Post Alerts')}
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
                  title={t('settings_no_masons', 'No {Masons} Followed')}
                  subtitle={t(
                    'notif_per_mason_desc',
                    'Enable specific post alerts for {Masons} you follow.'
                  )}
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
                        t(
                          'notif_per_mason_card_fallback_sub',
                          'Receive notifications when this {mason} publishes new {dispatches} or updates.'
                        )
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
