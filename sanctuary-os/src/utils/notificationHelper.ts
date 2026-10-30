import { isPermissionGranted, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './envUtils';
import { getSpokeClientById } from '../supabase';

export type NotificationDeliveryMode = 'OS' | 'APP' | 'NONE';

export type NotificationCategory =
  | 'keepers_news'
  | 'patch_update_logs'
  | 'defcon'
  | 'alert_banner'
  | 'system_dispatch'
  | 'new_posts'
  | 'replies'
  | 'support';

export const GLOBAL_ONLY_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'keepers_news',
  'patch_update_logs',
];

export const SPOKE_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'alert_banner',
  'system_dispatch',
  'defcon',
  'new_posts',
  'replies',
  'support',
];

export const ALL_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  ...GLOBAL_ONLY_NOTIFICATION_CATEGORIES,
  ...SPOKE_NOTIFICATION_CATEGORIES,
];

export type SystemNotificationPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

declare global {
  interface Window {
    __sanctuary_notified_cache: Set<string>;
  }
}

const DELIVERED_STORAGE_KEY = 'sanctuary_delivered_notifs_v1';
const DELIVERED_SEEDED_KEY = 'sanctuary_delivered_notifs_seeded_v2';
const HUB_READ_STORAGE_KEY = 'sanctuary_read_hub_notifs_v1';
const HUB_DISMISSED_STORAGE_KEY = 'sanctuary_dismissed_hub_notifs_v1';
const CROSS_WORKSPACE_STORAGE_KEY = 'sanctuary_notify_cross_workspace';
const CROSS_WORKSPACE_SPOKES_KEY = 'sanctuary_notify_cross_workspace_spokes';
const SCOPE_PREF_STORAGE_KEY = 'sanctuary_notify_scope_pref';
const MAX_DELIVERED_IDS = 500;

const LEGACY_KEY_MAP: Record<NotificationCategory, string> = {
  keepers_news: 'sanctuary_notify_keepers_news',
  patch_update_logs: 'sanctuary_notify_patch_update_logs',
  defcon: 'sanctuary_notify_defcon',
  alert_banner: 'sanctuary_notify_alert_banner',
  system_dispatch: 'sanctuary_notify_system_dispatch',
  new_posts: 'sanctuary_notify_new_posts',
  replies: 'sanctuary_notify_replies',
  support: 'sanctuary_notify_support',
};

function getDeliveredSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  if (!window.__sanctuary_notified_cache) {
    let initial: string[] = [];
    try {
      const raw = localStorage.getItem(DELIVERED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) initial = parsed.map(String);
      }
    } catch (e) {
      // ignore storage errors
    }
    window.__sanctuary_notified_cache = new Set(initial);
  }
  return window.__sanctuary_notified_cache;
}

function persistDeliveredSet(set: Set<string>) {
  try {
    const arr = Array.from(set);
    const trimmed = arr.length > MAX_DELIVERED_IDS ? arr.slice(arr.length - MAX_DELIVERED_IDS) : arr;
    localStorage.setItem(DELIVERED_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // ignore storage errors
  }
}

export function hasDeliveredNotification(uniqueId: string): boolean {
  if (!uniqueId) return false;
  return getDeliveredSet().has(uniqueId);
}

export function markNotificationDelivered(uniqueId: string): void {
  if (!uniqueId) return;
  const set = getDeliveredSet();
  if (set.has(uniqueId)) return;
  set.add(uniqueId);
  persistDeliveredSet(set);
}

export function clearDeliveredNotification(uniqueId: string): void {
  if (!uniqueId) return;
  const set = getDeliveredSet();
  if (set.delete(uniqueId)) {
    persistDeliveredSet(set);
  }
}

/**
 * Seeds existing notification IDs on the very first run so historical backlog
 * is never spammed as OS notifications when a user first boots or opts in.
 */
export function seedInitialDeliveredNotifications(ids: string[]): boolean {
  if (typeof window === 'undefined') return false;
  const alreadySeeded = localStorage.getItem(DELIVERED_SEEDED_KEY) === 'true';
  if (alreadySeeded) return false;
  const set = getDeliveredSet();
  ids.forEach((id) => {
    if (id) set.add(id);
  });
  persistDeliveredSet(set);
  try {
    localStorage.setItem(DELIVERED_SEEDED_KEY, 'true');
  } catch (e) {}
  return true;
}

function normalizeSpokeKey(spokeId?: string): string {
  const clean = String(spokeId || '').trim();
  if (!clean || clean === 'global' || clean === 'default_workspace') {
    return '';
  }
  return clean;
}

export function getCrossWorkspaceNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(CROSS_WORKSPACE_STORAGE_KEY);
  if (val === null) return true;
  return val === 'true';
}

export function setCrossWorkspaceNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CROSS_WORKSPACE_STORAGE_KEY, String(enabled));
  if (enabled) {
    const raw = localStorage.getItem(CROSS_WORKSPACE_SPOKES_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 0) {
          localStorage.removeItem(CROSS_WORKSPACE_SPOKES_KEY);
        }
      } catch {
        localStorage.removeItem(CROSS_WORKSPACE_SPOKES_KEY);
      }
    }
  }
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function getAllowedCrossWorkspaceSpokes(allSpokeIds: string[] = []): string[] {
  if (typeof window === 'undefined') return allSpokeIds;
  if (!getCrossWorkspaceNotificationsEnabled()) return [];
  const raw = localStorage.getItem(CROSS_WORKSPACE_SPOKES_KEY);
  if (raw === null) {
    return allSpokeIds;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const validIds = parsed.map((id) => String(id || '').trim()).filter(Boolean);
      if (allSpokeIds.length > 0) {
        return validIds.filter((id) => allSpokeIds.includes(id));
      }
      return validIds;
    }
  } catch {
    // ignore parse error
  }
  return allSpokeIds;
}

export function setAllowedCrossWorkspaceSpokes(spokeIds: string[]): void {
  if (typeof window === 'undefined') return;
  const cleaned = Array.from(
    new Set((spokeIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  localStorage.setItem(CROSS_WORKSPACE_SPOKES_KEY, JSON.stringify(cleaned));
  localStorage.setItem(CROSS_WORKSPACE_STORAGE_KEY, String(cleaned.length > 0));
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function getNotificationScopePreference(): string {
  if (typeof window === 'undefined') return 'global';
  return localStorage.getItem(SCOPE_PREF_STORAGE_KEY) || 'global';
}

export function setNotificationScopePreference(scope: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SCOPE_PREF_STORAGE_KEY, scope || 'global');
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function hasSpokeNotificationOverrides(spokeId?: string): boolean {
  if (typeof window === 'undefined') return false;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke) return false;
  return SPOKE_NOTIFICATION_CATEGORIES.some((cat) => {
    const val = localStorage.getItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`);
    return val === 'OS' || val === 'APP' || val === 'NONE';
  });
}

export function clearSpokeNotificationOverrides(spokeId?: string): void {
  if (typeof window === 'undefined') return;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke) return;
  SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
    localStorage.removeItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`);
  });
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function getNotificationMode(
  category: NotificationCategory,
  spokeId?: string
): NotificationDeliveryMode {
  if (typeof window === 'undefined') return 'APP';

  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (cleanSpoke && !GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    const spokeMode = localStorage.getItem(`sanctuary_notify_mode_${cleanSpoke}_${category}`);
    if (spokeMode === 'OS' || spokeMode === 'APP' || spokeMode === 'NONE') {
      return spokeMode;
    }
  }

  const storedMode = localStorage.getItem(`sanctuary_notify_mode_${category}`);
  if (storedMode === 'OS' || storedMode === 'APP' || storedMode === 'NONE') {
    return storedMode;
  }

  const legacyKey = LEGACY_KEY_MAP[category];
  if (legacyKey && localStorage.getItem(legacyKey) === 'false') {
    return 'NONE';
  }

  const osOptIn = localStorage.getItem('sanctuary_os_notifications_enabled') === 'true';
  if (isDesktop() || osOptIn) {
    return 'OS';
  }
  return 'APP';
}

export function setNotificationMode(
  category: NotificationCategory,
  mode: NotificationDeliveryMode,
  spokeId?: string
): void {
  if (typeof window === 'undefined') return;
  const cleanSpoke = normalizeSpokeKey(spokeId);

  if (cleanSpoke && !GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    localStorage.setItem(`sanctuary_notify_mode_${cleanSpoke}_${category}`, mode);
  } else {
    localStorage.setItem(`sanctuary_notify_mode_${category}`, mode);
    const legacyKey = LEGACY_KEY_MAP[category];
    if (legacyKey) {
      localStorage.setItem(legacyKey, (mode !== 'NONE').toString());
    }
  }

  if (mode === 'OS') {
    localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
  }
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function setAllNotificationModes(
  mode: NotificationDeliveryMode,
  spokeId?: string
): void {
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (cleanSpoke) {
    SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
      localStorage.setItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`, mode);
    });
  } else {
    ALL_NOTIFICATION_CATEGORIES.forEach((cat) => {
      localStorage.setItem(`sanctuary_notify_mode_${cat}`, mode);
      const legacyKey = LEGACY_KEY_MAP[cat];
      if (legacyKey) {
        localStorage.setItem(legacyKey, (mode !== 'NONE').toString());
      }
    });
  }
  if (mode === 'OS') {
    localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
  }
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function mapDbNotificationTypeToCategory(
  dbType?: string,
  message?: string
): NotificationCategory {
  const rawType = String(dbType || '').toLowerCase();
  const msg = String(message || '').toLowerCase();

  if (rawType === 'keepers_news' || rawType === 'foundry_news') {
    return 'keepers_news';
  }
  if (rawType === 'patch_update_logs' || rawType === 'release_notes') {
    return 'patch_update_logs';
  }
  if (rawType === 'defcon') {
    return 'defcon';
  }
  if (rawType === 'alert_banner' || rawType === 'spoke_alert') {
    return 'alert_banner';
  }
  if (rawType === 'reply' || rawType === 'comment_reply' || rawType === 'post_like') {
    return 'replies';
  }
  if (
    rawType === 'support_reply' ||
    rawType === 'ticket_reply' ||
    rawType === 'report_resolved'
  ) {
    return 'support';
  }
  if (rawType === 'new_post') {
    return 'new_posts';
  }
  if (rawType === 'system_broadcast' || rawType === 'broadcast') {
    if (msg.startsWith('sanctuary foundry')) {
      return 'keepers_news';
    }
    if (
      msg.includes('urgent alert') ||
      msg.includes('new alert') ||
      msg.includes('alert:') ||
      msg.includes('lockdown') ||
      msg.includes('defcon')
    ) {
      return 'alert_banner';
    }
    return 'system_dispatch';
  }
  return 'system_dispatch';
}

function readLocalIdSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    }
  } catch (e) {}
  return new Set();
}

function writeLocalIdSet(key: string, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(set).slice(-MAX_DELIVERED_IDS);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {}
}

export function markHubNotificationRead(id: string): void {
  if (!id) return;
  const set = readLocalIdSet(HUB_READ_STORAGE_KEY);
  set.add(id);
  writeLocalIdSet(HUB_READ_STORAGE_KEY, set);
}

export function markAllHubNotificationsRead(ids: string[]): void {
  const set = readLocalIdSet(HUB_READ_STORAGE_KEY);
  ids.forEach((id) => {
    if (id) set.add(id);
  });
  writeLocalIdSet(HUB_READ_STORAGE_KEY, set);
}

export function dismissHubNotification(id: string): void {
  if (!id) return;
  const set = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
  set.add(id);
  writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, set);
}

export function dismissAllHubNotifications(ids: string[]): void {
  const set = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
  ids.forEach((id) => {
    if (id) set.add(id);
  });
  writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, set);
}

let cachedGamesMeta: Array<{ id: string; schema_id: string; name: string; icon?: string }> | null = null;
let cachedGamesAt = 0;

export async function getAvailableSpokeWorkspaces(
  supabaseAuth: any,
  storeWorkspaces?: any[]
): Promise<Array<{ id: string; schema_id: string; name: string; icon?: string }>> {
  const map = new Map<string, { id: string; schema_id: string; name: string; icon?: string }>();

  if (Array.isArray(storeWorkspaces)) {
    storeWorkspaces.forEach((w: any) => {
      const schemaId = String(w?.schema_id || w?.id || '').trim();
      if (schemaId && schemaId !== 'default_workspace') {
        map.set(schemaId, {
          id: String(w.id || schemaId),
          schema_id: schemaId,
          name: String(w.name || schemaId),
          icon: w.icon,
        });
      }
    });
  }

  const now = Date.now();
  if (!cachedGamesMeta || now - cachedGamesAt > 60_000) {
    try {
      const { data } = await supabaseAuth
        .from('sanctuary_games')
        .select('id, name, schema_id, icon, is_active')
        .not('is_active', 'eq', false);
      if (Array.isArray(data)) {
        cachedGamesMeta = data
          .filter((g: any) => g?.schema_id && g.schema_id !== 'default_workspace')
          .map((g: any) => ({
            id: String(g.id || g.schema_id),
            schema_id: String(g.schema_id).trim(),
            name: String(g.name || g.schema_id).trim(),
            icon: g.icon,
          }));
        cachedGamesAt = now;
      }
    } catch (e) {
      // ignore offline error
    }
  }

  if (Array.isArray(cachedGamesMeta)) {
    cachedGamesMeta.forEach((g) => {
      if (!map.has(g.schema_id)) {
        map.set(g.schema_id, g);
      } else {
        const existing = map.get(g.schema_id)!;
        if (existing.name === existing.schema_id && g.name) {
          existing.name = g.name;
        }
      }
    });
  }

  return Array.from(map.values());
}

export async function fetchUnifiedSanctuaryNotifications(opts: {
  supabase: any;
  supabaseAuth: any;
  session: any;
  activeWorkspaceId?: string;
  workspaces?: any[];
}): Promise<any[]> {
  const { supabase, supabaseAuth, session, activeWorkspaceId, workspaces } = opts;
  const token = session?.access_token || '';
  const crossWorkspaceEnabled = getCrossWorkspaceNotificationsEnabled();

  const readHubSet = readLocalIdSet(HUB_READ_STORAGE_KEY);
  const dismissedHubSet = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);

  const availableSpokes = await getAvailableSpokeWorkspaces(supabaseAuth, workspaces);
  const activeSpokeClean = normalizeSpokeKey(activeWorkspaceId);
  const allSpokeSchemaIds = availableSpokes.map((s) => s.schema_id);
  const allowedCrossSet = new Set(getAllowedCrossWorkspaceSpokes(allSpokeSchemaIds));

  const targetSpokes = availableSpokes.filter((s) => {
    const isActiveSpoke = s.schema_id === activeSpokeClean || s.id === activeSpokeClean;
    if (isActiveSpoke) return true;
    return crossWorkspaceEnabled && allowedCrossSet.has(s.schema_id);
  });

  if (
    targetSpokes.length === 0 &&
    activeSpokeClean
  ) {
    targetSpokes.push({
      id: activeSpokeClean,
      schema_id: activeSpokeClean,
      name: activeSpokeClean,
    });
  }

  const hubBroadcastPromise = (async () => {
    const items: any[] = [];
    const seenRowIds = new Set<string>();

    try {
      // 1. keeper_system_broadcasts ONLY for Release Notes (excludes EULA/Privacy/Terms & System Directives)
      // 2. system_broadcasts ONLY for active Public Keepers News (Announcement, Blog, Press, Update, Maintenance, Info, Event)
      const [releaseRes, publicNewsRes] = await Promise.all([
        supabaseAuth
          .from('keeper_system_broadcasts')
          .select('id, title, description, message, category, target_audience, is_active, is_pinned, created_at')
          .in('category', ['ReleasePost_Public', 'ReleasePost_Dev', 'ReleaseNotesBlog'])
          .order('created_at', { ascending: false })
          .limit(6),
        supabaseAuth
          .from('system_broadcasts')
          .select('id, title, description, message, category, target_audience, is_active, is_pinned, created_at')
          .in('category', ['Announcement', 'Blog', 'Press', 'Update', 'Maintenance', 'Info', 'Event'])
          .ilike('target_audience', '%Public%')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const releaseRows = Array.isArray(releaseRes?.data) ? releaseRes.data : [];
      for (const row of releaseRows) {
        if (!row?.id || seenRowIds.has(`rel:${row.id}`)) continue;
        seenRowIds.add(`rel:${row.id}`);
        if (row.is_active === false) continue;

        const cat = String(row.category || '').trim();
        const rawTitle = String(row.title || '').trim();
        const isDev =
          cat === 'ReleasePost_Dev' || rawTitle === '[KEEPERS_RELEASE_POST_DEV]';
        const rawMsg = String(row.message || '');
        const metaMatch = rawMsg.match(/^<!--\s*RELEASE_META:(\{.*?\})\s*-->\s*/s);
        let parsedMeta: any = {};
        if (metaMatch && metaMatch[1]) {
          try {
            parsedMeta = JSON.parse(metaMatch[1]);
          } catch {}
        }
        const versionStr = String(parsedMeta.version || '').replace(/^v/i, '').trim();
        const summaryStr = String(parsedMeta.summary || row.description || '').trim();
        const cleanTitle = !rawTitle.startsWith('[KEEPERS_') && rawTitle
          ? rawTitle
          : isDev
            ? `Daily Dev Build${versionStr ? ` v${versionStr}` : ''}`
            : `Public Release${versionStr ? ` v${versionStr}` : ''}`;

        const notifId = `hub-release-${row.id}-${versionStr || row.created_at}`;
        if (dismissedHubSet.has(notifId)) continue;
        if (getNotificationMode('patch_update_logs', 'global') === 'NONE') continue;

        items.push({
          id: notifId,
          type: 'patch_update_logs',
          _rawType: 'patch_update_logs',
          _category: 'patch_update_logs' as NotificationCategory,
          title: cleanTitle,
          message: summaryStr
            ? `${cleanTitle}${versionStr ? ` (v${versionStr})` : ''}: ${summaryStr}`
            : `${cleanTitle}${versionStr ? ` (v${versionStr})` : ''} release notes are live.`,
          created_at: row.created_at || new Date().toISOString(),
          is_read: readHubSet.has(notifId),
          _spokeId: 'global',
          _spokeName: 'Sanctuary Foundry',
          _isCrossWorkspace: false,
          _source: 'hub_broadcast',
          _releaseChannel: isDev ? 'dev' : 'stable',
          _version: versionStr,
          _rawPost: {
            ...row,
            title: cleanTitle,
            message: rawMsg.replace(/^<!--\s*RELEASE_META:\{.*?\}\s*-->\s*/s, ''),
          },
        });
      }

      const newsRows = Array.isArray(publicNewsRes?.data) ? publicNewsRes.data : [];
      for (const row of newsRows) {
        if (!row?.id || seenRowIds.has(`news:${row.id}`)) continue;
        seenRowIds.add(`news:${row.id}`);
        if (row.is_active === false) continue;

        const cat = String(row.category || '').trim();
        const rawTitle = String(row.title || '').trim();
        if (
          rawTitle.startsWith('[KEEPERS_') ||
          cat === 'EULA' ||
          cat === 'Privacy' ||
          cat === 'Terms' ||
          cat === 'Directive' ||
          cat === 'Legal'
        ) {
          continue;
        }

        const notifId = `hub-keepers-${row.id}`;
        if (dismissedHubSet.has(notifId)) continue;
        if (getNotificationMode('keepers_news', 'global') === 'NONE') continue;

        const descPreview = String(row.description || row.message || '')
          .replace(/\[IMG:[^\]]+\]/gi, '')
          .replace(/[#*_`~>]/g, '')
          .trim()
          .slice(0, 180);

        items.push({
          id: notifId,
          type: 'keepers_news',
          _rawType: 'keepers_news',
          _category: 'keepers_news' as NotificationCategory,
          title: rawTitle || 'Sanctuary Foundry News',
          message: descPreview
            ? `${rawTitle}: ${descPreview}`
            : `Sanctuary Foundry published Keepers News: ${rawTitle}`,
          created_at: row.created_at || new Date().toISOString(),
          is_read: readHubSet.has(notifId),
          _spokeId: 'global',
          _spokeName: 'Sanctuary Foundry',
          _isCrossWorkspace: false,
          _source: 'hub_broadcast',
          _rawPost: row,
        });
      }
    } catch (e) {
      // ignore offline error
    }

    return items;
  })();

  const notifyAuthorOnly =
    typeof window !== 'undefined' &&
    localStorage.getItem('sanctuary_notify_author_only') === 'true';
  let masonAlerts: Record<string, boolean> | null = null;
  if (typeof window !== 'undefined') {
    const savedMasonAlerts = localStorage.getItem('sanctuary_mason_alerts');
    if (savedMasonAlerts) {
      try {
        masonAlerts = JSON.parse(savedMasonAlerts);
      } catch {}
    }
  }

  const spokePromises = targetSpokes.map(async (spoke) => {
    const spokeNotifs: any[] = [];
    const seenBroadcastRefIds = new Set<string>();

    // 1. Fetch personal & broadcast notifications from this Spoke via game-gateway
    if (token) {
      try {
        const { data } = await supabase.rpc('secure_fetch_notifications', {
          p_token: token,
          p_game_id: spoke.schema_id,
        });
        if (Array.isArray(data)) {
          for (const n of data) {
            const category = mapDbNotificationTypeToCategory(n.type, n.message);
            let uiType = n.type;
            if (n.type === 'comment_reply' || n.type === 'post_like') {
              uiType = 'reply';
            } else if (n.type === 'ticket_reply' || n.type === 'report_resolved') {
              uiType = 'support_reply';
            } else if (category === 'keepers_news') {
              uiType = 'keepers_news';
            } else if (category === 'patch_update_logs') {
              uiType = 'patch_update_logs';
            } else if (category === 'alert_banner') {
              uiType = 'alert_banner';
            }

            if (getNotificationMode(category, spoke.schema_id) === 'NONE') {
              continue;
            }
            if (uiType === 'reply' && notifyAuthorOnly && n.post_author_id && n.actor_id !== n.post_author_id) {
              continue;
            }
            if (uiType === 'new_post' && masonAlerts && n.mason_id && masonAlerts[n.mason_id] === false) {
              continue;
            }

            if (n.reference_id) {
              seenBroadcastRefIds.add(String(n.reference_id));
            }

            spokeNotifs.push({
              ...n,
              type: uiType,
              _rawType: n.type,
              _category: category,
              _spokeId: spoke.schema_id,
              _spokeName: spoke.name,
              _isCrossWorkspace:
                Boolean(activeSpokeClean) && spoke.schema_id !== activeSpokeClean,
              _source: 'spoke_db',
              _db: 'spoke' as const,
            });
          }
        }
      } catch {
        // ignore spoke rpc error
      }
    }

    // 2. Also ping this Spoke's active system_broadcasts alerts directly so cross-spoke Global Alerts
    // are always visible even if the user didn't receive a per-user notifications row
    try {
      const spokeClient = await getSpokeClientById(spoke.schema_id);
      if (spokeClient) {
        const { data: activeAlerts } = await spokeClient
          .from('system_broadcasts')
          .select('id, title, description, message, category, target_audience, is_active, is_pinned, created_at')
          .eq('is_active', true)
          .in('category', ['Alert', 'Game Version Alert', 'Malware Alert', 'Artifact Alert'])
          .order('created_at', { ascending: false })
          .limit(5);

        if (Array.isArray(activeAlerts)) {
          for (const alertRow of activeAlerts) {
            if (!alertRow?.id || seenBroadcastRefIds.has(String(alertRow.id))) continue;
            const synthId = `spoke-alert-${spoke.schema_id}-${alertRow.id}`;
            if (dismissedHubSet.has(synthId)) continue;
            if (getNotificationMode('alert_banner', spoke.schema_id) === 'NONE') continue;

            spokeNotifs.push({
              id: synthId,
              reference_id: alertRow.id,
              type: 'alert_banner',
              _rawType: 'system_broadcast',
              _category: 'alert_banner' as NotificationCategory,
              title: alertRow.title || `${spoke.name} Alert`,
              message: `${spoke.name} Team has posted an Urgent Alert: ${alertRow.title}`,
              created_at: alertRow.created_at || new Date().toISOString(),
              is_read: readHubSet.has(synthId),
              _spokeId: spoke.schema_id,
              _spokeName: spoke.name,
              _isCrossWorkspace:
                Boolean(activeSpokeClean) && spoke.schema_id !== activeSpokeClean,
              _source: 'hub_broadcast',
              _rawPost: alertRow,
            });
          }
        }
      }
    } catch {
      // ignore direct spoke alert query error
    }

    return spokeNotifs;
  });

  const [hubItems, ...spokeLists] = await Promise.all([
    hubBroadcastPromise,
    ...spokePromises,
  ]);

  const allSpokeItems = spokeLists.flat();

  // Deduplicate: if a spoke_db notification already references a hub_broadcast reference_id, avoid double-listing
  const spokeReferenceIds = new Set(
    allSpokeItems
      .map((s: any) => (s.reference_id ? String(s.reference_id) : ''))
      .filter(Boolean)
  );

  const dedupedHubItems = hubItems.filter((h: any) => {
    if (h._rawPost?.id && spokeReferenceIds.has(String(h._rawPost.id))) {
      return false;
    }
    return true;
  });

  const merged = [...dedupedHubItems, ...allSpokeItems];
  const seenIds = new Set<string>();
  const uniqueMerged = merged.filter((item) => {
    const key = `${item._spokeId || 'global'}::${item.id}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  uniqueMerged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return uniqueMerged;
}

export async function getSystemNotificationPermissionState(): Promise<SystemNotificationPermissionState> {
  try {
    if (isDesktop()) {
      // Native desktop Tauri uses Rust OS toast notifications (send_sanctuary_notification)
      // which do not require transient WebView2 browser permission prompts on each reboot.
      if (typeof window !== 'undefined' && localStorage.getItem('sanctuary_os_notifications_enabled') !== 'false') {
        localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
      }
      return 'granted';
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    if (window.Notification.permission === 'granted') return 'granted';
    if (window.Notification.permission === 'denied') return 'denied';
    if (localStorage.getItem('sanctuary_os_notifications_enabled') === 'true') {
      const granted = await isPermissionGranted().catch(() => false);
      if (granted) return 'granted';
    }
    return 'prompt';
  } catch (e) {
    return isDesktop() ? 'granted' : 'prompt';
  }
}

export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermissionState> {
  try {
    if (isDesktop()) {
      localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
      window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
      return 'granted';
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    let perm = window.Notification.permission;
    if (perm !== 'granted') {
      perm = await window.Notification.requestPermission();
    }
    if (perm === 'granted') {
      localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
      window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
      return 'granted';
    }
    return perm === 'denied' ? 'denied' : 'prompt';
  } catch (err) {
    console.error('Failed to request system notification permission:', err);
    return isDesktop() ? 'granted' : 'denied';
  }
}

function sanitizeNotificationTitle(rawTitle: string): string {
  const trimmed = String(rawTitle || '').trim();
  if (/^\[[a-z0-9_.-]+\]$/i.test(trimmed)) {
    const inner = trimmed.slice(1, -1).toLowerCase();
    if (inner.includes('keepers')) return 'Keepers News';
    if (inner.includes('patch') || inner.includes('update')) return 'Patch Update Logs';
    if (inner.includes('alert')) return 'Global Alert';
    if (inner.includes('support')) return 'Support Alert';
    if (inner.includes('repl')) return 'Comm-Link Reply';
    if (inner.includes('post')) return 'Comm-Link Post';
    return 'Sanctuary OS';
  }
  return trimmed.replace(/\[([a-z0-9_.-]+)\]/gi, (_, k) =>
    String(k).replace(/^(notify_|notif_|ui\.|btn_)/i, '').replace(/_/g, ' ')
  );
}

function sanitizeNotificationBody(body: string): string {
  const clean = String(body || '')
    .replace(/\[(.*?)\](\(.*?\))?/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[#*_`~>]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 160 ? `${clean.substring(0, 157).trim()}...` : clean;
}

export async function notifyOS(
  title: string,
  body: string,
  actionTypeId?: string,
  overrideSetting: boolean = false,
  uniqueId?: string,
  data?: Record<string, any>
): Promise<boolean> {
  const cleanTitle = sanitizeNotificationTitle(title);
  const dedupeKey = uniqueId || `${actionTypeId || 'GEN'}::${cleanTitle}::${body}`;
  if (!overrideSetting && hasDeliveredNotification(dedupeKey)) {
    return false;
  }

  const cleanBody = sanitizeNotificationBody(body);

  try {
    if (isDesktop()) {
      if (!overrideSetting) {
        markNotificationDelivered(dedupeKey);
      }
      try {
        await invoke('send_sanctuary_notification', { title: cleanTitle, body: cleanBody });
      } catch (invokeErr) {
        sendNotification({ title: cleanTitle, body: cleanBody, actionTypeId });
      }
      return true;
    }

    // Web / PWA Delivery
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    let perm = window.Notification.permission;
    if (perm !== 'granted' && overrideSetting) {
      perm = await window.Notification.requestPermission();
    }
    if (perm !== 'granted') {
      return false;
    }

    if (!overrideSetting) {
      markNotificationDelivered(dedupeKey);
    }

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(cleanTitle, {
            body: cleanBody,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: dedupeKey,
            data: { actionTypeId, ...(data || {}) },
          });
          return true;
        }
      } catch (swErr) {
        // Fallback to window.Notification below
      }
    }

    const webNotif = new window.Notification(cleanTitle, {
      body: cleanBody,
      icon: '/pwa-192x192.png',
      tag: dedupeKey,
      data: { actionTypeId, ...(data || {}) },
    });
    webNotif.onclick = () => {
      window.focus();
      webNotif.close();
    };
    return true;
  } catch (err) {
    console.error('Failed to send OS/PWA notification:', err);
    return false;
  }
}

export interface DispatchNotificationOptions {
  uniqueId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  spokeId?: string;
  onInApp?: () => void;
  data?: Record<string, any>;
}

/**
 * Unified router for DEFCON Alerts, Keepers News, Patch Update Logs, Comm-Link Posts, Support Alerts, and Spoke Global Alerts.
 * Ensures each notification is only ever dispatched once and respects the per-type & per-spoke mode ('OS' | 'APP' | 'NONE').
 */
export async function dispatchSanctuaryNotification(opts: DispatchNotificationOptions): Promise<void> {
  const { uniqueId, category, title, body, spokeId, onInApp, data } = opts;
  const mode = getNotificationMode(category, spokeId);

  if (mode === 'NONE') {
    return;
  }

  if (hasDeliveredNotification(uniqueId)) {
    return;
  }

  // Mark as delivered immediately so concurrent polls/realtime events never double-send
  markNotificationDelivered(uniqueId);

  if (onInApp) {
    onInApp();
  }

  if (mode === 'OS') {
    await notifyOS(title, body, category.toUpperCase(), true, uniqueId, data);
  }
}
