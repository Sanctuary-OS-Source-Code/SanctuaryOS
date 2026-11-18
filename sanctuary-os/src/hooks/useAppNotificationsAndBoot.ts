import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModalStore } from "../store/modalStore";
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from "@tauri-apps/api/path";
import { useStore, syncMasterSchemas, syncGameDatabases, getSafeSchema } from "../store";
import { isPlaceholderWorkspaceKey, findMatchingWorkspaceEntry } from "../utils/workspaceConfigMatch";
import { supabase, supabaseAuth, getActiveGameClient, isStandaloneFork, RESOLVED_SANCTUARY_CONFIG } from "../supabase";
import { loadDLCMap } from "../shared";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain, getSubdomain } from "../utils/routingUtils";
import { deriveSpokeRelinkCommitmentHash } from "../utils/stagingCrypto";
import { loadExceptionRulesFromSpoke } from "../components/KnownExceptionRules";
import {
  dispatchSanctuaryNotification,
  getNotificationMode,
  mapDbNotificationTypeToCategory,
  seedInitialDeliveredNotifications,
  hasDeliveredNotification,
  fetchUnifiedSanctuaryNotifications,
  syncCrossDeviceNotificationState,
} from "../utils/notificationHelper";
import { deriveUserNotificationSyncToken } from "../utils/stagingCrypto";

export function useAppNotificationsAndBoot({
  t,
  activeWorkspaceId,
  isGameDatabasesSynced,
  setUserRole,
  setOsRole,
  playSets,
  setStatus,
  session,
  runRadarSweep,
  setView,
  playsetsLoaded,
  setPlaysetsLoaded,
  setIsConfigured,
  setPendingWorkspaceSetupId,
  setLivePath,
  setModsPath,
  setVaultPath,
  setIsNotificationSidebarOpen,
  setUnreadNotificationCount,
  prevUnreadRef,
  isInitialLoadRef,
  setOwnedDLC,
  setMaskedDLC,
  fetchCloudLabQueue,
}: any) {
  useEffect(() => {
    const resolveDefaultWebSpoke = () => {
      try {
        const last = (localStorage.getItem('sanctuary_last_active_workspace') || '').trim();
        if (last && last !== 'default_workspace' && last !== 'global') return last;
      } catch {}
      const wsList = useStore.getState().workspaces || [];
      const firstWs = wsList.find(
        (w: any) => w?.id && w.id !== 'default_workspace' && w.id !== 'global'
      );
      return firstWs?.id || '';
    };

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const wantHandshake = params.get('open_passkey_handshake') === '1';
        const wantNotifs = params.get('open_notifications') === '1';

        if ((wantHandshake || wantNotifs) && !isDesktop() && isRootDomain()) {
          const targetSpoke = resolveDefaultWebSpoke();
          if (targetSpoke) {
            window.location.replace(`/${targetSpoke}${window.location.search}${window.location.hash || ''}`);
            return;
          }
        }

        let cleaned = false;
        if (wantHandshake) {
          params.delete('open_passkey_handshake');
          cleaned = true;
          try {
            sessionStorage.setItem('sanctuary_pending_push_action', 'passkey_handshake');
          } catch {}
          useModalStore.getState().setIsPasskeyHandshakePanelOpen(true);
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('sanctuary-open-passkey-handshake'));
          }, 250);
        }
        if (wantNotifs) {
          params.delete('open_notifications');
          cleaned = true;
          try {
            sessionStorage.setItem('sanctuary_pending_push_action', 'notifications');
          } catch {}
          setIsNotificationSidebarOpen(true);
        }
        if (cleaned) {
          const qs = params.toString();
          const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
          window.history.replaceState({}, '', nextUrl);
        }
      } catch {}
    }

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SANCTUARY_NOTIFICATION_CLICK') {
        const isHandshake = event.data?.data?.actionTypeId === 'PASSKEY_HANDSHAKE';
        if (!isDesktop() && isRootDomain()) {
          const targetSpoke = resolveDefaultWebSpoke();
          window.location.href = `/${targetSpoke}?${isHandshake ? 'open_passkey_handshake=1' : 'open_notifications=1'}`;
          return;
        }
        if (isHandshake) {
          useModalStore.getState().setIsPasskeyHandshakePanelOpen(true);
          window.dispatchEvent(new CustomEvent('sanctuary-open-passkey-handshake'));
        } else {
          setIsNotificationSidebarOpen(true);
        }
      } else if (event.data?.type === 'SANCTUARY_PUSH_RECEIVED') {
        window.dispatchEvent(new Event('refresh_notifications'));
        if (event.data?.data?.actionTypeId === 'PASSKEY_HANDSHAKE') {
          window.dispatchEvent(new CustomEvent('sanctuary-open-passkey-handshake'));
        }
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const pendingAction = sessionStorage.getItem('sanctuary_pending_push_action');
      if (!pendingAction) return;
      if (pendingAction === 'passkey_handshake') {
        useModalStore.getState().setIsPasskeyHandshakePanelOpen(true);
        window.dispatchEvent(new CustomEvent('sanctuary-open-passkey-handshake'));
        if (session?.user?.id) {
          sessionStorage.removeItem('sanctuary_pending_push_action');
        }
      } else if (pendingAction === 'notifications') {
        setIsNotificationSidebarOpen(true);
        sessionStorage.removeItem('sanctuary_pending_push_action');
      }
    } catch {}
  }, [session?.user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (isDesktop()) return;
    const syncPush = () => {
      import('../utils/webPushClient')
        .then(({ syncPwaWebPushSubscription }) => syncPwaWebPushSubscription())
        .catch(() => {});
    };
    syncPush();
    window.addEventListener('sanctuary_notification_prefs_changed', syncPush);
    return () => {
      window.removeEventListener('sanctuary_notification_prefs_changed', syncPush);
    };
  }, [session?.user?.id, activeWorkspaceId]);

  useEffect(() => {
    const getTitleForDbType = (dbType?: string, spokeName?: string, isCrossWs?: boolean) => {
      let baseTitle = t('notify_system_dispatch', 'System Dispatch');
      switch (dbType) {
        case 'keepers_news':
          baseTitle = t('notify_keepers_news', 'Keepers News');
          break;
        case 'patch_update_logs':
          baseTitle = t('notify_patch_update_logs', 'Patch Update Logs');
          break;
        case 'alert_banner':
          baseTitle = t('notify_alert_banner', 'Global Alerts (Spoke Wayfinders)');
          break;
        case 'reply':
        case 'comment_reply':
        case 'post_like':
          baseTitle = t('ui.replies', 'Comm-Link Reply');
          break;
        case 'support_reply':
        case 'ticket_reply':
        case 'report_resolved':
          baseTitle = t('notify_support', 'Support Alert');
          break;
        case 'new_post':
          baseTitle = t('btn_new_posts', 'Comm-Link Post');
          break;
        case 'system_broadcast':
        default:
          baseTitle = t('notify_system_dispatch', 'System Dispatch');
          break;
      }
      if (isCrossWs && spokeName) {
        return `${spokeName} • ${baseTitle}`;
      }
      return baseTitle;
    };

    const fetchUnread = async (skipCloudPull = false) => {
      if (!navigator.onLine || localStorage.getItem('sanctuary_local_only') === 'true') return;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const activeSession = sessionData?.session || session;

        if (!skipCloudPull && activeSession?.user?.id) {
          await syncCrossDeviceNotificationState(activeSession);
        }

        const data = await fetchUnifiedSanctuaryNotifications({
          supabase,
          supabaseAuth,
          session: activeSession,
          activeWorkspaceId: activeWorkspaceId || undefined,
          workspaces: useStore.getState().workspaces,
        });

        if (data && Array.isArray(data)) {
          // On the very first boot on this device, seed existing notification IDs so historical backlog isn't spammed
          seedInitialDeliveredNotifications(
            data.flatMap((n: any) => [
              `notif:${n.id}`,
              `notif:${n._spokeId || 'global'}:${n.id}`,
            ])
          );

          const enabledUnread = data.filter((n: any) => {
            if (n.is_read) return false;
            const cat = n._category || mapDbNotificationTypeToCategory(n.type, n.message);
            return getNotificationMode(cat, n._spokeId) !== 'NONE';
          });

          const totalUnread = enabledUnread.length;

          for (const notif of enabledUnread) {
            const uniqueId = `notif:${notif._spokeId || 'global'}:${notif.id}`;
            const cat =
              notif._category ||
              mapDbNotificationTypeToCategory(notif.type, notif.message);
            const extraMeta = {
              category: cat,
              spokeId: notif._spokeId,
              referenceId: notif.reference_id,
              dbType: notif.type,
            };
            if (
              !hasDeliveredNotification(uniqueId, extraMeta) &&
              !hasDeliveredNotification(`notif:${notif.id}`, extraMeta)
            ) {
              dispatchSanctuaryNotification({
                uniqueId,
                category: cat,
                spokeId: notif._spokeId,
                title: getTitleForDbType(
                  notif.type,
                  notif._spokeName,
                  notif._isCrossWorkspace
                ),
                body: notif.message || '',
                onInApp: () => {
                  setStatus(`notifications_active ${t('tab_notifs', 'Notifications')}`);
                  window.dispatchEvent(new Event('new_notification_arrived'));
                },
                data: {
                  notificationId: notif.id,
                  referenceId: notif.reference_id,
                  type: notif.type,
                  spokeId: notif._spokeId,
                },
              });
            }
          }

          prevUnreadRef.current = totalUnread;
          isInitialLoadRef.current = false;
          setUnreadNotificationCount(totalUnread);
        } else {
          setUnreadNotificationCount(0);
        }
      } catch (e) {
        // Ignore transient offline error
      }
    };

    let cancelled = false;
    let interval: any = null;
    let realtimeChannel: any = null;
    let subscribedClient: any = null;
    let hubSyncChannel: any = null;

    const handleRefreshEvent = () => fetchUnread(true);

    const setupNetworkFeatures = async () => {
      if (cancelled) return;
      fetchUnread(false);
      if (!interval) {
        interval = setInterval(() => fetchUnread(false), 30000);
      }
      if (session?.user?.id && navigator.onLine && localStorage.getItem('sanctuary_local_only') !== 'true') {
        if (!realtimeChannel) {
          const spokeClient = getActiveGameClient();
          const targetClient = spokeClient || (isStandaloneFork ? supabaseAuth : null);
          if (targetClient) {
            subscribedClient = targetClient;
            realtimeChannel = targetClient
              .channel(`sanctuary_user_notifs_${session.user.id}_${activeWorkspaceId || 'spoke'}`)
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'notifications',
                  filter: `user_id=eq.${session.user.id}`,
                },
                () => {
                  fetchUnread(false);
                }
              )
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'system_broadcasts',
                },
                async (payload: any) => {
                  const row = payload?.new;
                  if (row?.id && row?.is_active) {
                    if (session?.user?.id) {
                      await syncCrossDeviceNotificationState(session);
                    }
                    const isUrgent = Boolean(row.is_pinned) || String(row.category || '').includes('Alert');
                    dispatchSanctuaryNotification({
                      uniqueId: isUrgent ? `urgent_broadcast:${row.id}` : `broadcast:${row.id}`,
                      category: isUrgent ? 'alert_banner' : 'system_dispatch',
                      spokeId: activeWorkspaceId || undefined,
                      title: row.title || t('notify_system_dispatch', 'System Dispatch'),
                      body: row.message || row.content || '',
                      data: { broadcastId: row.id, referenceId: row.id, type: 'system_broadcast' },
                    });
                  }
                  fetchUnread(true);
                }
              )
              .subscribe();
          }
        }

        if (!hubSyncChannel && supabaseAuth) {
          try {
            const notifSyncToken = await deriveUserNotificationSyncToken(
              session.user.id,
              session.user.email
            );
            if (!cancelled && !hubSyncChannel && notifSyncToken) {
              hubSyncChannel = supabaseAuth
                .channel(`sanctuary_notif_sync_${notifSyncToken.slice(0, 16)}`)
                .on(
                  'postgres_changes',
                  {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'citizen_staging_queue',
                    filter: `user_token=eq.${notifSyncToken}`,
                  },
                  (payload: any) => {
                    if (payload?.new?.payload_type === 'notification_state_sync') {
                      syncCrossDeviceNotificationState(session).catch(() => {});
                    }
                  }
                )
                .subscribe();
            }
          } catch {}
        }
      }
    };

    setupNetworkFeatures();

    const handleOnline = () => {
      if (localStorage.getItem("sanctuary_local_only") !== "true") {
        fetchUnread(false);
        setupNetworkFeatures();
      }
    };

    window.addEventListener('refresh_notifications', handleRefreshEvent);
    window.addEventListener('sanctuary_notification_prefs_changed', handleRefreshEvent);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (realtimeChannel) {
        try {
          if (subscribedClient && typeof subscribedClient.removeChannel === 'function') {
            subscribedClient.removeChannel(realtimeChannel);
          } else if (typeof realtimeChannel.unsubscribe === 'function') {
            realtimeChannel.unsubscribe();
          }
        } catch (e) {}
      }
      if (hubSyncChannel) {
        try {
          if (supabaseAuth && typeof supabaseAuth.removeChannel === 'function') {
            supabaseAuth.removeChannel(hubSyncChannel);
          } else if (typeof hubSyncChannel.unsubscribe === 'function') {
            hubSyncChannel.unsubscribe();
          }
        } catch (e) {}
      }
      window.removeEventListener('refresh_notifications', handleRefreshEvent);
      window.removeEventListener('sanctuary_notification_prefs_changed', handleRefreshEvent);
      window.removeEventListener('online', handleOnline);
    };
  }, [session?.user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    let isMounted = true;
    const loadFsPlaysets = async () => {
      try {
        let loadedSets: any[] = [];

        if (isDesktop()) {
          const filePath = await appDataDir();
          if (!(await exists(filePath))) {
            await mkdir(filePath, { recursive: true });
          }
          const fullPath = await join(filePath, `sanctuary_${activeWorkspaceId}_playsets.json`);
          const legacySepPath = `${filePath}\\sanctuary_${activeWorkspaceId}_playsets.json`;
          const storageKey = `sanctuary_${activeWorkspaceId}_playsets`;

          if (await exists(fullPath)) {
            const contents = await readTextFile(fullPath);
            loadedSets = JSON.parse(contents);
          } else if (fullPath !== legacySepPath && (await exists(legacySepPath))) {
            const contents = await readTextFile(legacySepPath);
            loadedSets = JSON.parse(contents);
            await writeTextFile(fullPath, JSON.stringify(loadedSets));
          } else {
            const cached = localStorage.getItem(storageKey);
            if (cached) {
              loadedSets = JSON.parse(cached);
              await writeTextFile(fullPath, JSON.stringify(loadedSets));
            }
          }

          try {
            const rawLocal = localStorage.getItem(storageKey);
            const localArr = rawLocal ? JSON.parse(rawLocal) : [];
            const isLocalFolderEntry = (s: any) =>
              s &&
              s.id &&
              (String(s.id).startsWith("f_") || String(s.id).startsWith("local_")) &&
              Array.isArray(s.items) &&
              !Array.isArray(s.mods) &&
              !s.isCollection;
            const localFoldersFromLs = Array.isArray(localArr) ? localArr.filter(isLocalFolderEntry) : [];
            const fsFolderIds = new Set(
              (Array.isArray(loadedSets) ? loadedSets : [])
                .filter(isLocalFolderEntry)
                .map((s: any) => String(s.id))
            );
            const mergedFolders = [
              ...(Array.isArray(loadedSets) ? loadedSets : []).filter(isLocalFolderEntry),
              ...localFoldersFromLs.filter((lf: any) => !fsFolderIds.has(String(lf.id))),
            ];
            if (localFoldersFromLs.some((lf: any) => !fsFolderIds.has(String(lf.id)))) {
              loadedSets = [
                ...(Array.isArray(loadedSets) ? loadedSets : []),
                ...localFoldersFromLs.filter((lf: any) => !fsFolderIds.has(String(lf.id))),
              ];
            }
            if (mergedFolders.length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(mergedFolders));
            } else {
              localStorage.removeItem(storageKey);
            }
          } catch {}
        } else {
          const cached = localStorage.getItem(`sanctuary_${activeWorkspaceId}_playsets`);
          if (cached) {
            loadedSets = JSON.parse(cached);
          }
        }

        if (isMounted) {
          const store = useStore.getState();
          store.setPlaySets(loadedSets);

          if (store.activeSetName) {
            const foundIdx = loadedSets.findIndex((s: any) => s.name === store.activeSetName);
            if (foundIdx !== -1) {
              store.setActivePlaySetIndex(foundIdx);
            }
          } else if (loadedSets.length > 0) {
            store.setActiveSetName(loadedSets[0].name);
            store.setActivePlaySetIndex(0);
          }

          setPlaysetsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load playsets from FS", err);
        if (isMounted) setPlaysetsLoaded(true);
      }
    };

    loadFsPlaysets();
    return () => { isMounted = false; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!playsetsLoaded || !activeWorkspaceId) return;
    const saveFsPlaysets = async () => {
      try {
        if (isDesktop()) {
          const filePath = await appDataDir();
          if (!(await exists(filePath))) {
            await mkdir(filePath, { recursive: true });
          }
          const fullPath = await join(filePath, `sanctuary_${activeWorkspaceId}_playsets.json`);
          await writeTextFile(fullPath, JSON.stringify(playSets));
        } else {
          try {
            localStorage.setItem(`sanctuary_${activeWorkspaceId}_playsets`, JSON.stringify(playSets));
          } catch (e) {
            console.warn("localStorage quota exceeded for playsets.");
          }
        }
      } catch (err) {
        console.error("Failed to save playsets to FS", err);
      }
    };
    const debounceTimeout = setTimeout(saveFsPlaysets, 300);
    return () => clearTimeout(debounceTimeout);
  }, [playSets, playsetsLoaded, activeWorkspaceId]);

  const didInitDLC = useRef(false);
  useEffect(() => {
    if (didInitDLC.current) return;
    didInitDLC.current = true;
    const bootDLCProtocol = async () => {
      try {
        if (!isDesktop()) {
          loadDLCMap().catch(console.warn);
          const webSubdomain = getSubdomain() || (isStandaloneFork ? RESOLVED_SANCTUARY_CONFIG.standaloneWorkspace.id : null);

          if (webSubdomain) {
            try {
              // Await schema and game databases sync before setting activeWorkspaceId
              // This ensures UI doesn't mount and query before Core OS credentials load.
              await Promise.all([
                syncMasterSchemas(webSubdomain),
                syncGameDatabases()
              ]);
            } catch (e) {
              console.warn("Sync failed on boot", e);
            }

            // Essential for web to prevent bleeding from past workspaces
            useStore.getState().hydrateWorkspaceState(webSubdomain);
            useStore.setState({ activeWorkspaceId: webSubdomain });

            setIsConfigured(true);
          } else {
            // Root domain on web -> Show Hub
            useStore.getState().hydrateWorkspaceState("default_workspace");
            useStore.setState({ activeWorkspaceId: "default_workspace" });
            setIsConfigured(false);
          }
          return;
        }
        const [config, globalConfig]: [any, any] = await Promise.all([
          invoke("get_saved_coordinates").catch(() => ({})),
          invoke("get_global_config").catch(() => ({})),
        ]);
        const activeWorkspace = findMatchingWorkspaceEntry(
          globalConfig?.active_workspace_id,
          globalConfig?.workspaces || []
        );
        const schemaId =
          (!isPlaceholderWorkspaceKey(activeWorkspace?.schema_id)
            ? activeWorkspace?.schema_id
            : "") ||
          (!isPlaceholderWorkspaceKey(globalConfig?.active_workspace_id)
            ? globalConfig?.active_workspace_id
            : "") ||
          "default_schema";

        // Load cached schema instantly so UI can render without leaking another spoke's default schema
        const cachedSchema = localStorage.getItem(`sanctuary_master_schema_${schemaId}`);
        if (cachedSchema) {
          useStore.getState().setActiveGameSchema(getSafeSchema(JSON.parse(cachedSchema), schemaId));
        } else {
          useStore.getState().setActiveGameSchema(getSafeSchema({}, schemaId));
        }

        const cachePromise = (globalConfig?.active_workspace_id && config?.vault_path)
          ? invoke<string>("load_master_cache", { vaultPath: config.vault_path }).catch((e) => {
              console.error("Failed to load master cache during boot:", e);
              return null;
            })
          : Promise.resolve(null);

        // Hydrate Game Database URLs (instant from cache when available) in parallel with local master cache read
        const [, cacheStr] = await Promise.all([
          syncGameDatabases(globalConfig?.workspaces).catch(console.warn),
          cachePromise,
        ]);

        // Sync master schemas and DLC registry in the background after spoke database URLs are ready
        syncMasterSchemas(schemaId).catch(console.warn);
        loadDLCMap().catch(console.warn);
        loadExceptionRulesFromSpoke().catch(console.warn);

        // Do not blindly overwrite sanctuary_last_active_workspace with globalConfig here!
        // globalConfig might have 'default_workspace' if the rust config is empty, which destroys the user's selection.

        let initialModList = useStore.getState().modList;

        if (cacheStr) {
          try {
            const parsedCache = JSON.parse(cacheStr);
            if (Array.isArray(parsedCache) && parsedCache.length > 0) {
              initialModList = parsedCache;
              setStatus(`${t("status_offline_cache_prefix", "Offline Cache Loaded:")} ${parsedCache.length} ${t("status_offline_cache_suffix", "{Mods} In Your {Vault}.")}`);
            }
          } catch (e) {
            console.error("Failed to parse master cache during boot:", e);
          }
        }

        const hasAllConfiguredPaths = Boolean(
          config?.live_path?.trim() &&
            config?.mods_path?.trim() &&
            config?.vault_path?.trim()
        );
        if (hasAllConfiguredPaths) {
          setPendingWorkspaceSetupId(null);
          setIsConfigured(true);
        } else {
          setIsConfigured(false);
          const pendingSetupId = localStorage.getItem(
            "sanctuary_pending_workspace_setup"
          );
          if (pendingSetupId && !isPlaceholderWorkspaceKey(pendingSetupId)) {
            setPendingWorkspaceSetupId(pendingSetupId);
            setView("dashboard");
          } else {
            setPendingWorkspaceSetupId(null);
          }
        }
        setLivePath(config?.live_path || "");
        setModsPath(config?.mods_path || "");
        setVaultPath(config?.vault_path || "");
        useStore.getState().setDocsPath(config?.docs_path || config?.user_data_path || "");

        let resolvedWorkspaceId = globalConfig?.active_workspace_id;
        if (isPlaceholderWorkspaceKey(resolvedWorkspaceId)) {
          resolvedWorkspaceId =
            localStorage.getItem("sanctuary_pending_workspace_setup") ||
            localStorage.getItem("sanctuary_last_active_workspace") ||
            localStorage.getItem("sanctuary_active_workspace");
        }
        if (isPlaceholderWorkspaceKey(resolvedWorkspaceId)) {
          const w = useStore.getState().workspaces;
          const firstValid = Array.isArray(w)
            ? w.find(
                (ws: any) =>
                  !isPlaceholderWorkspaceKey(ws?.id) ||
                  !isPlaceholderWorkspaceKey(ws?.schema_id)
              )
            : null;
          if (firstValid) {
            resolvedWorkspaceId = firstValid.id || firstValid.schema_id;
          } else {
            resolvedWorkspaceId = "default_workspace";
          }
        }

        if (resolvedWorkspaceId) {
          useStore.getState().hydrateWorkspaceState(resolvedWorkspaceId);
          localStorage.setItem('sanctuary_last_active_workspace', resolvedWorkspaceId);
        }

        const cachedNetUpdates = useStore.getState().networkUpdates;
        if (Array.isArray(initialModList) && initialModList.length > 0 && cachedNetUpdates) {
          const applyNetState = (item: any) => {
            if (!item) return item;
            let next = item;
            const isBroken = cachedNetUpdates.broken?.some((b: any) => (b.hash && b.hash === item.hash) || (b.name && b.name === item.name));
            const isObsolete = cachedNetUpdates.obsolete?.some((b: any) => (b.hash && b.hash === item.hash) || (b.name && b.name === item.name));
            const upd = cachedNetUpdates.updated?.find((u: any) => (u.hash && u.hash === item.hash) || (u.name && u.name === item.name));
            if (isBroken && next.status !== 'broken') next = { ...next, status: 'broken' };
            else if (isObsolete && next.status !== 'obsolete') next = { ...next, status: 'obsolete' };
            if (upd) {
              next = {
                ...next,
                hasUpdate: true,
                newVersion: upd.newVersion || next.newVersion,
                newGameVersion: upd.newGameVersion || next.newGameVersion,
                download_url: upd.download_url || next.download_url,
              };
            }
            if (Array.isArray(next.flavors)) {
              next = { ...next, flavors: next.flavors.map(applyNetState) };
            }
            return next;
          };
          initialModList = initialModList.map(applyNetState);
        }

        useStore.setState((state) => ({
          // Only fallback to local workspaces if syncGameDatabases failed to populate them
          workspaces: state.workspaces?.length > 0 ? state.workspaces : (globalConfig?.workspaces || []),
          activeWorkspaceId: resolvedWorkspaceId,
          modList: initialModList,
          isGlobalConfigLoaded: true
        }));

        if (resolvedWorkspaceId && config?.live_path) {
          invoke<string[]>("scan_installed_dlc", {
            livePath: config.live_path,
          })
            .then((physicalDLC) => setOwnedDLC(physicalDLC))
            .catch(console.warn);
          if (config.launch_args) {
            const maskMatch = config.launch_args.match(/-disablepack:([\w,]+)/i);
            if (maskMatch?.[1]) {
              const masked = maskMatch[1]
                .split(",")
                .map((s: string) => s.trim().toUpperCase());
              setMaskedDLC(masked);
            }
          }
        }
      } catch (err) {
        console.error("DLC Protocol Sync Failed:", err);
        useStore.setState({ isGlobalConfigLoaded: true });
      }
    };
    bootDLCProtocol();
  }, []);

  useEffect(() => {
    async function fetchUserRole() {
      if (!isGameDatabasesSynced) return;
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      if (session?.user) {
        let currentOsRole = "citizen";
        try {
          const { data: osData, error: osError } = await supabaseAuth
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!osError && osData && osData.role) {
            currentOsRole = osData.role.toLowerCase();
          }
        } catch (e) { console.error(e); }

        setOsRole(currentOsRole);

        let newRole = "citizen";
        try {
          const gameClient = getActiveGameClient();
          if (gameClient) {
            const relinkCommitmentHash = await deriveSpokeRelinkCommitmentHash(
              session.user.id
            ).catch(() => "");
            const syncRes: any = await supabase.rpc("secure_sync_spoke_profile", {
              p_token: session.access_token,
              p_relink_commitment_hash: relinkCommitmentHash || undefined,
            });

            if (syncRes?.data && !syncRes.data.error && syncRes.data.role) {
              newRole = syncRes.data.role.toLowerCase();
            } else {
              const { data: gameData, error: gameError } = await gameClient
                .from("profiles")
                .select("role")
                .eq("id", session.user.id)
                .maybeSingle();

              if (!gameError && gameData && gameData.role) {
                newRole = gameData.role.toLowerCase();
              }
            }
          }
        } catch (e: any) {
          console.error(e);
        }
        if (isStandaloneFork && (newRole === "wayfinder" || currentOsRole === "wayfinder")) {
          currentOsRole = "keeper";
        }
        setOsRole(currentOsRole);
        setUserRole(newRole);

        const currentView = useStore.getState().view;
        const elevatedHubs = ["MasonHub", "ArchitectHub", "Oversight", "WayfinderHub", "KeepersCore", "SADefcon"];
        if (elevatedHubs.includes(currentView)) {
          if (currentView === "MasonHub" && !session) setView("dashboard");
          else if (currentView === "ArchitectHub" && !["architect", "oversight", "wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "Oversight" && !["oversight", "wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "WayfinderHub" && !["wayfinder", "admin"].includes(newRole)) setView("dashboard");
          else if (currentView === "KeepersCore" && !["core_dev", "admin", "keeper"].includes(currentOsRole)) setView("dashboard");
          else if (currentView === "SADefcon" && !["keeper", "admin"].includes(currentOsRole)) setView("dashboard");
        }
      }
    }
    fetchUserRole();
  }, [activeWorkspaceId, session, isGameDatabasesSynced]);

  const didInitBoot = useRef(false);
  useEffect(() => {
    if (didInitBoot.current) return;
    didInitBoot.current = true;

    const handleOnlineRoleFetch = () => {
      if (localStorage.getItem("sanctuary_local_only") !== "true") {
        window.location.reload();
      }
    };

    window.addEventListener('online', handleOnlineRoleFetch);

    async function boot() {
      if (!isDesktop()) {
        useStore.setState({ isGlobalConfigLoaded: true });
        setIsConfigured(true);
        return;
      }
      try {
        localStorage.removeItem("sanctuary_cloud_cache");
        const config: any = await invoke("get_saved_coordinates");

        if (config.live_path && config.mods_path && config.vault_path) {
          setIsConfigured(true);
          setLivePath(config.live_path);
          setModsPath(config.mods_path);
          setVaultPath(config.vault_path);
          useStore.getState().setDocsPath(config.docs_path || config.user_data_path || "");

          const currentSchema = useStore.getState().activeGameSchema;
          if (currentSchema) {
            await invoke('update_active_game_schema', { schema: currentSchema }).catch(console.error);
          }

          // Crash Guard: auto-heal and restore any save airgap stranded by a prior OS reboot or power loss
          const recoveryDocsBase = String(
            config.docs_path || config.user_data_path || config.mods_path || ""
          ).trim();
          if (recoveryDocsBase) {
            invoke<{ recovered: boolean; healed_from_vault_mirror: boolean }>(
              "recover_interrupted_lab_airgap",
              {
                docsPath: recoveryDocsBase,
                vaultPath: config.vault_path || "",
              }
            )
              .then(async (rep) => {
                if (rep?.recovered) {
                  try {
                    await invoke("repopulate_from_shelter");
                  } catch {}
                  setStatus(
                    t(
                      "lab_crash_recovery_restored",
                      "{Lab} Crash Guard: Your live save files were automatically verified and restored after an interrupted session."
                    )
                  );
                }
              })
              .catch(() => {});
          }

          // Defer heavy Vault / Conflict Radar disk scans briefly so workspace preparation & master cache hydration finish with zero I/O contention
          setTimeout(() => {
            runRadarSweep(false);
            fetchCloudLabQueue();
          }, 20);
          invoke("initialize_vault_watch").catch(console.warn);
          const docsBase = String(config.docs_path || config.user_data_path || "").trim();
          if (docsBase) {
            invoke("initialize_airgap_watch", {
              docsPath: docsBase,
              vaultPath: config.vault_path,
            }).catch(console.warn);
          }

          invoke("initialize_settings_watch", {
            modsPath: config.mods_path,
            vaultPath: config.vault_path,
          }).catch(console.warn);
        }
      } catch (e) {
        setStatus(t("status_boot_failure", "BOOT FAILURE: Check coordinates."));
      }
    }

    boot();
    return () => { window.removeEventListener('online', handleOnlineRoleFetch); };
  }, []);
}
