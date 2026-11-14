import { isPermissionGranted, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './envUtils';
import { getSpokeClientById, supabaseAuth } from '../supabase';
import { useStore } from '../store';
import {
  type EncryptedNotificationSyncPayload,
  pullEncryptedNotificationSyncState,
  pushEncryptedNotificationSyncState,
} from './stagingCrypto';

export type NotificationDeliveryMode = 'OS' | 'APP' | 'NONE';

export type NotificationCategory =
  | 'keepers_news'
  | 'patch_update_logs'
  | 'defcon'
  | 'alert_banner'
  | 'system_dispatch'
  | 'mod_alerts'
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
  'mod_alerts',
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
const DELIVERED_MAP_STORAGE_KEY = 'sanctuary_delivered_notifs_map_v2';
const DELIVERED_SEEDED_KEY = 'sanctuary_delivered_notifs_seeded_v2';
const HUB_READ_STORAGE_KEY = 'sanctuary_read_hub_notifs_v1';
const HUB_DISMISSED_STORAGE_KEY = 'sanctuary_dismissed_hub_notifs_v1';
const DISMISSED_GLOBAL_ALERTS_KEY = 'sanctuary_dismissed_global_alerts_v2';
const LEGACY_DISMISSED_ALERT_KEY = 'sanctuary_dismissed_alert_id';
const CROSS_WORKSPACE_STORAGE_KEY = 'sanctuary_notify_cross_workspace';
const CROSS_WORKSPACE_SPOKES_KEY = 'sanctuary_notify_cross_workspace_spokes';
const SCOPE_PREF_STORAGE_KEY = 'sanctuary_notify_scope_pref';
const PREFS_UPDATED_AT_KEY = 'sanctuary_notify_prefs_updated_at_v1';
const LAST_SYNC_AT_KEY = 'sanctuary_notify_last_sync_at_v1';
const MAX_DELIVERED_IDS = 600;

let isApplyingRemotePrefs = false;
let pendingPushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightNotificationSync: Promise<boolean> | null = null;

function touchNotificationPrefsUpdatedAt(): void {
  if (typeof window === 'undefined' || isApplyingRemotePrefs) return;
  try {
    localStorage.setItem(PREFS_UPDATED_AT_KEY, String(Date.now()));
  } catch {}
  scheduleNotificationStatePush();
}

export function getNotificationLastSyncedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_SYNC_AT_KEY);
  } catch {
    return null;
  }
}

function readTimestampMap(mapKey: string, legacySetKey?: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(mapKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (k) result[k] = typeof v === 'number' && Number.isFinite(v) ? v : 1;
        }
      }
    }
    if (legacySetKey) {
      const legacyRaw = localStorage.getItem(legacySetKey);
      if (legacyRaw) {
        const legacyArr = JSON.parse(legacyRaw);
        if (Array.isArray(legacyArr)) {
          for (const item of legacyArr) {
            const k = String(item || '');
            if (k && !(k in result)) {
              result[k] = 1;
            }
          }
        }
      }
    }
  } catch {}
  return result;
}

function trimAndWriteTimestampMap(
  mapKey: string,
  map: Record<string, number>,
  legacySetKey?: string
): Record<string, number> {
  const entries = Object.entries(map)
    .filter(([k]) => Boolean(k))
    .sort((a, b) => a[1] - b[1]);
  const trimmedEntries =
    entries.length > MAX_DELIVERED_IDS
      ? entries.slice(entries.length - MAX_DELIVERED_IDS)
      : entries;
  const cleanMap: Record<string, number> = {};
  for (const [k, ts] of trimmedEntries) {
    cleanMap[k] = ts;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(mapKey, JSON.stringify(cleanMap));
      if (legacySetKey) {
        localStorage.setItem(legacySetKey, JSON.stringify(Object.keys(cleanMap)));
      }
    } catch {}
  }
  return cleanMap;
}

export function getCanonicalBroadcastAlertKey(
  spokeId: string | null | undefined,
  broadcastId: string | number
): string {
  const cleanSpoke = normalizeSpokeKey(spokeId);
  const cleanId = String(broadcastId || '').trim();
  if (!cleanId) return '';
  return cleanSpoke ? `canon:spoke_bc:${cleanSpoke}:${cleanId}` : `canon:hub_bc:${cleanId}`;
}

export function deriveCanonicalNotificationKeys(opts: {
  uniqueId?: string;
  category?: NotificationCategory;
  spokeId?: string | null;
  referenceId?: string | number | null;
  dbType?: string;
}): string[] {
  const keys = new Set<string>();
  const uid = String(opts.uniqueId || '').trim();
  const cleanSpoke = normalizeSpokeKey(opts.spokeId);
  const refId =
    opts.referenceId !== undefined && opts.referenceId !== null
      ? String(opts.referenceId).trim()
      : '';
  const dbType = String(opts.dbType || '').toLowerCase();

  if (uid) {
    keys.add(uid);

    // Unify Hub broadcasts across Desktop, Web, and PWA service worker tags
    const hubMatch = uid.match(/^(?:notif:(?:global:)?hub-(?:news|patch)-|hub-(?:news|patch)-|hub_bc_)(.+)$/);
    if (hubMatch?.[1]) {
      keys.add(`canon:hub_bc:${hubMatch[1]}`);
    }

    // Unify Spoke urgent/system broadcasts across CommandCenter, Realtime, and cross-spoke synthetic rows
    const urgentMatch = uid.match(/^(?:urgent_broadcast|broadcast):(.+)$/);
    if (urgentMatch?.[1]) {
      if (cleanSpoke) keys.add(`canon:spoke_bc:${cleanSpoke}:${urgentMatch[1]}`);
      keys.add(`canon:bc:${urgentMatch[1]}`);
    }

    const spokeAlertMatch = uid.match(/^(?:notif:[^:]+:)?spoke-alert-([^-]+(?:\w|-)*?)-(\d+|[0-9a-fA-F-]{8,})$/);
    if (spokeAlertMatch?.[1] && spokeAlertMatch?.[2]) {
      keys.add(`canon:spoke_bc:${spokeAlertMatch[1]}:${spokeAlertMatch[2]}`);
      keys.add(`canon:bc:${spokeAlertMatch[2]}`);
    }

    const defconMatch = uid.match(/^defcon_alert_([^_]+)_(.+)$/);
    if (defconMatch?.[1] && defconMatch?.[2]) {
      keys.add(`canon:defcon:${defconMatch[1]}:${defconMatch[2]}`);
    }

    const notifMatch = uid.match(/^notif:([^:]+):(.+)$/);
    if (notifMatch?.[1] && notifMatch?.[2]) {
      keys.add(`canon:notif:${notifMatch[1]}:${notifMatch[2]}`);
      keys.add(`notif:${notifMatch[2]}`);
    }
  }

  if (
    refId &&
    (opts.category === 'alert_banner' ||
      opts.category === 'system_dispatch' ||
      dbType === 'alert_banner' ||
      dbType === 'system_broadcast' ||
      dbType === 'broadcast')
  ) {
    if (cleanSpoke) keys.add(`canon:spoke_bc:${cleanSpoke}:${refId}`);
    keys.add(`canon:bc:${refId}`);
  }

  return Array.from(keys).filter(Boolean);
}

const LEGACY_KEY_MAP: Record<NotificationCategory, string> = {
  keepers_news: 'sanctuary_notify_keepers_news',
  patch_update_logs: 'sanctuary_notify_patch_update_logs',
  defcon: 'sanctuary_notify_defcon',
  alert_banner: 'sanctuary_notify_alert_banner',
  system_dispatch: 'sanctuary_notify_system_dispatch',
  mod_alerts: 'sanctuary_notify_mod_alerts',
  new_posts: 'sanctuary_notify_new_posts',
  replies: 'sanctuary_notify_replies',
  support: 'sanctuary_notify_support',
};

export function getModAlertsBlueprintScope(): string {
  if (typeof window === 'undefined') return 'ACTIVE';
  const raw = localStorage.getItem('sanctuary_mod_alerts_bp_scope');
  if (!raw || raw === 'undefined' || raw === 'null') return 'ACTIVE';
  return raw;
}

export function setModAlertsBlueprintScope(scope: string): void {
  if (typeof window === 'undefined') return;
  const clean = !scope || scope === 'undefined' || scope === 'null' ? 'ACTIVE' : scope;
  localStorage.setItem('sanctuary_mod_alerts_bp_scope', clean);
  touchNotificationPrefsUpdatedAt();
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

function getDeliveredSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  if (!window.__sanctuary_notified_cache) {
    const map = readTimestampMap(DELIVERED_MAP_STORAGE_KEY, DELIVERED_STORAGE_KEY);
    window.__sanctuary_notified_cache = new Set(Object.keys(map));
  }
  return window.__sanctuary_notified_cache;
}

function persistDeliveredKeysWithTimestamp(keys: string[], ts = Date.now(), triggerPush = true): boolean {
  if (typeof window === 'undefined' || keys.length === 0) return false;
  const set = getDeliveredSet();
  const map = readTimestampMap(DELIVERED_MAP_STORAGE_KEY, DELIVERED_STORAGE_KEY);
  let added = false;
  for (const k of keys) {
    if (!k) continue;
    if (!set.has(k) || !(k in map)) {
      added = true;
    }
    set.add(k);
    map[k] = Math.max(map[k] || 0, ts);
  }
  if (added) {
    const clean = trimAndWriteTimestampMap(DELIVERED_MAP_STORAGE_KEY, map, DELIVERED_STORAGE_KEY);
    window.__sanctuary_notified_cache = new Set(Object.keys(clean));
    if (triggerPush) {
      scheduleNotificationStatePush();
    }
  }
  return added;
}

export function hasDeliveredNotification(
  uniqueId: string,
  extraMeta?: {
    category?: NotificationCategory;
    spokeId?: string | null;
    referenceId?: string | number | null;
    dbType?: string;
  }
): boolean {
  if (!uniqueId) return false;
  const set = getDeliveredSet();
  if (set.has(uniqueId)) return true;
  const canonicalKeys = deriveCanonicalNotificationKeys({
    uniqueId,
    category: extraMeta?.category,
    spokeId: extraMeta?.spokeId,
    referenceId: extraMeta?.referenceId,
    dbType: extraMeta?.dbType,
  });
  return canonicalKeys.some((k) => set.has(k));
}

export function markNotificationDelivered(
  uniqueId: string,
  extraMeta?: {
    category?: NotificationCategory;
    spokeId?: string | null;
    referenceId?: string | number | null;
    dbType?: string;
  }
): void {
  if (!uniqueId) return;
  const canonicalKeys = deriveCanonicalNotificationKeys({
    uniqueId,
    category: extraMeta?.category,
    spokeId: extraMeta?.spokeId,
    referenceId: extraMeta?.referenceId,
    dbType: extraMeta?.dbType,
  });
  persistDeliveredKeysWithTimestamp(canonicalKeys, Date.now(), true);
}

export function clearDeliveredNotification(uniqueId: string): void {
  if (!uniqueId) return;
  const set = getDeliveredSet();
  const map = readTimestampMap(DELIVERED_MAP_STORAGE_KEY, DELIVERED_STORAGE_KEY);
  if (set.delete(uniqueId) || uniqueId in map) {
    delete map[uniqueId];
    const clean = trimAndWriteTimestampMap(DELIVERED_MAP_STORAGE_KEY, map, DELIVERED_STORAGE_KEY);
    window.__sanctuary_notified_cache = new Set(Object.keys(clean));
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
  const expanded: string[] = [];
  ids.forEach((id) => {
    if (id) {
      expanded.push(...deriveCanonicalNotificationKeys({ uniqueId: id }));
    }
  });
  persistDeliveredKeysWithTimestamp(expanded, Date.now(), true);
  try {
    localStorage.setItem(DELIVERED_SEEDED_KEY, 'true');
  } catch (e) {}
  return true;
}

function getDismissedGlobalAlertsMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  const map = readTimestampMap(DISMISSED_GLOBAL_ALERTS_KEY);
  try {
    const legacyId = localStorage.getItem(LEGACY_DISMISSED_ALERT_KEY);
    if (legacyId && !(legacyId in map)) {
      map[legacyId] = 1;
    }
  } catch {}
  return map;
}

export function isGlobalAlertDismissed(
  broadcastId: string | number | null | undefined,
  spokeId?: string | null
): boolean {
  if (broadcastId === null || broadcastId === undefined) return false;
  const cleanId = String(broadcastId).trim();
  if (!cleanId) return false;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  const map = getDismissedGlobalAlertsMap();
  if (cleanSpoke && `${cleanSpoke}:${cleanId}` in map) return true;
  return cleanId in map;
}

export function dismissGlobalAlert(
  broadcastId: string | number,
  spokeId?: string | null
): void {
  if (typeof window === 'undefined') return;
  const cleanId = String(broadcastId || '').trim();
  if (!cleanId) return;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  const now = Date.now();
  const map = getDismissedGlobalAlertsMap();
  map[cleanId] = now;
  if (cleanSpoke) {
    map[`${cleanSpoke}:${cleanId}`] = now;
  }
  trimAndWriteTimestampMap(DISMISSED_GLOBAL_ALERTS_KEY, map);
  try {
    localStorage.setItem(LEGACY_DISMISSED_ALERT_KEY, cleanId);
  } catch {}

  // Also mark canonical broadcast notification delivered & hub-dismissed so other devices never toast it
  const synthKeys = [
    `urgent_broadcast:${cleanId}`,
    `broadcast:${cleanId}`,
    `canon:bc:${cleanId}`,
    ...(cleanSpoke
      ? [`spoke-alert-${cleanSpoke}-${cleanId}`, `canon:spoke_bc:${cleanSpoke}:${cleanId}`]
      : []),
  ];
  persistDeliveredKeysWithTimestamp(synthKeys, now, false);
  if (cleanSpoke) {
    const dismissedSet = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
    dismissedSet.add(`spoke-alert-${cleanSpoke}-${cleanId}`);
    writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, dismissedSet);
  }

  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
  window.dispatchEvent(new Event('refresh_notifications'));
  scheduleNotificationStatePush();
}

function normalizeSpokeKey(spokeId?: string | null): string {
  const clean = String(spokeId || '').trim();
  if (!clean || clean === 'global' || clean === 'default_workspace') {
    return '';
  }
  return clean;
}

export function getMutedSpokesForCategory(category: NotificationCategory): string[] {
  if (typeof window === 'undefined' || GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    return [];
  }
  try {
    const raw = localStorage.getItem(`sanctuary_notify_muted_spokes_${category}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(
        new Set(parsed.map((id) => normalizeSpokeKey(String(id || ''))).filter(Boolean))
      );
    }
  } catch {}
  return [];
}

export function setMutedSpokesForCategory(
  category: NotificationCategory,
  mutedSpokeIds: string[]
): void {
  if (typeof window === 'undefined' || GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    return;
  }
  const cleaned = Array.from(
    new Set((mutedSpokeIds || []).map((id) => normalizeSpokeKey(id)).filter(Boolean))
  );
  localStorage.setItem(`sanctuary_notify_muted_spokes_${category}`, JSON.stringify(cleaned));
  touchNotificationPrefsUpdatedAt();
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
}

export function isCategoryMutedForSpoke(
  category: NotificationCategory,
  spokeId?: string | null
): boolean {
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke || GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    return false;
  }
  return getMutedSpokesForCategory(category).includes(cleanSpoke);
}

export function toggleSpokeMuteForCategory(
  category: NotificationCategory,
  spokeId: string | null | undefined
): boolean {
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke) return false;
  const current = getMutedSpokesForCategory(category);
  const willMute = !current.includes(cleanSpoke);
  const next = willMute
    ? [...current, cleanSpoke]
    : current.filter((id) => id !== cleanSpoke);
  setMutedSpokesForCategory(category, next);
  return willMute;
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
  touchNotificationPrefsUpdatedAt();
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
  touchNotificationPrefsUpdatedAt();
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

export function hasSpokeNotificationOverrides(spokeId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke) return false;
  return SPOKE_NOTIFICATION_CATEGORIES.some((cat) => {
    if (getMutedSpokesForCategory(cat).includes(cleanSpoke)) return true;
    const val = localStorage.getItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`);
    return val === 'OS' || val === 'APP' || val === 'NONE';
  });
}

export function clearSpokeNotificationOverrides(spokeId?: string | null): void {
  if (typeof window === 'undefined') return;
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (!cleanSpoke) return;
  SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
    localStorage.removeItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`);
    const muted = getMutedSpokesForCategory(cat);
    if (muted.includes(cleanSpoke)) {
      localStorage.setItem(
        `sanctuary_notify_muted_spokes_${cat}`,
        JSON.stringify(muted.filter((id) => id !== cleanSpoke))
      );
    }
  });
  touchNotificationPrefsUpdatedAt();
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
}

export function getNotificationMode(
  category: NotificationCategory,
  spokeId?: string | null
): NotificationDeliveryMode {
  if (typeof window === 'undefined') return 'APP';

  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (cleanSpoke && !GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    if (isCategoryMutedForSpoke(category, cleanSpoke)) {
      return 'NONE';
    }
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
  spokeId?: string | null
): void {
  if (typeof window === 'undefined') return;
  const cleanSpoke = normalizeSpokeKey(spokeId);

  if (cleanSpoke && !GLOBAL_ONLY_NOTIFICATION_CATEGORIES.includes(category)) {
    localStorage.setItem(`sanctuary_notify_mode_${cleanSpoke}_${category}`, mode);
    if (mode !== 'NONE') {
      const muted = getMutedSpokesForCategory(category);
      if (muted.includes(cleanSpoke)) {
        localStorage.setItem(
          `sanctuary_notify_muted_spokes_${category}`,
          JSON.stringify(muted.filter((id) => id !== cleanSpoke))
        );
      }
    }
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
  touchNotificationPrefsUpdatedAt();
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
}

export function setAllNotificationModes(
  mode: NotificationDeliveryMode,
  spokeId?: string | null
): void {
  const cleanSpoke = normalizeSpokeKey(spokeId);
  if (cleanSpoke) {
    SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
      localStorage.setItem(`sanctuary_notify_mode_${cleanSpoke}_${cat}`, mode);
      if (mode !== 'NONE') {
        const muted = getMutedSpokesForCategory(cat);
        if (muted.includes(cleanSpoke)) {
          localStorage.setItem(
            `sanctuary_notify_muted_spokes_${cat}`,
            JSON.stringify(muted.filter((id) => id !== cleanSpoke))
          );
        }
      }
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
  touchNotificationPrefsUpdatedAt();
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
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
  scheduleNotificationStatePush();
}

export function markAllHubNotificationsRead(ids: string[]): void {
  const set = readLocalIdSet(HUB_READ_STORAGE_KEY);
  ids.forEach((id) => {
    if (id) set.add(id);
  });
  writeLocalIdSet(HUB_READ_STORAGE_KEY, set);
  scheduleNotificationStatePush();
}

export function dismissHubNotification(id: string): void {
  if (!id) return;
  const set = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
  set.add(id);
  writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, set);
  const spokeAlertMatch = id.match(/^spoke-alert-([^-]+(?:\w|-)*?)-(\d+|[0-9a-fA-F-]{8,})$/);
  if (spokeAlertMatch?.[1] && spokeAlertMatch?.[2]) {
    dismissGlobalAlert(spokeAlertMatch[2], spokeAlertMatch[1]);
    return;
  }
  scheduleNotificationStatePush();
}

export function dismissAllHubNotifications(ids: string[]): void {
  const set = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
  ids.forEach((id) => {
    if (id) {
      set.add(id);
      const spokeAlertMatch = id.match(/^spoke-alert-([^-]+(?:\w|-)*?)-(\d+|[0-9a-fA-F-]{8,})$/);
      if (spokeAlertMatch?.[1] && spokeAlertMatch?.[2]) {
        const map = getDismissedGlobalAlertsMap();
        const now = Date.now();
        map[spokeAlertMatch[2]] = now;
        map[`${spokeAlertMatch[1]}:${spokeAlertMatch[2]}`] = now;
        trimAndWriteTimestampMap(DISMISSED_GLOBAL_ALERTS_KEY, map);
      }
    }
  });
  writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, set);
  window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
  scheduleNotificationStatePush();
}

let cachedGamesMeta: Array<{ id: string; schema_id: string; name: string; icon?: string }> | null = null;
let cachedGamesAt = 0;
let cachedGamesIsKeeper = false;

export async function getAvailableSpokeWorkspaces(
  supabaseAuth: any,
  storeWorkspaces?: any[]
): Promise<Array<{ id: string; schema_id: string; name: string; icon?: string }>> {
  const map = new Map<string, { id: string; schema_id: string; name: string; icon?: string }>();

  const isKeeper = useStore.getState().osRole === 'keeper';
  if (Array.isArray(storeWorkspaces)) {
    storeWorkspaces.forEach((w: any) => {
      if (w?.is_keepers_only === true && !isKeeper) return;
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
  const offlineSchemaIds = new Set<string>();
  if (!cachedGamesMeta || cachedGamesIsKeeper !== isKeeper || now - cachedGamesAt > 60_000) {
    try {
      const { data } = await supabaseAuth
        .from('sanctuary_games')
        .select('id, name, schema_id, icon, is_active, is_keepers_only');
      if (Array.isArray(data)) {
        data.forEach((g: any) => {
          if (g && (g.is_active === false || (g.is_keepers_only === true && !isKeeper))) {
            if (g.schema_id) offlineSchemaIds.add(String(g.schema_id).trim());
            if (g.id) offlineSchemaIds.add(String(g.id).trim());
          }
        });
        cachedGamesMeta = data
          .filter(
            (g: any) =>
              g?.schema_id &&
              g.schema_id !== 'default_workspace' &&
              g.is_active !== false &&
              (isKeeper || g.is_keepers_only !== true)
          )
          .map((g: any) => ({
            id: String(g.id || g.schema_id),
            schema_id: String(g.schema_id).trim(),
            name: String(g.name || g.schema_id).trim(),
            icon: g.icon,
          }));
        cachedGamesAt = now;
        cachedGamesIsKeeper = isKeeper;
      }
    } catch (e) {
      // ignore offline error
    }
  }

  offlineSchemaIds.forEach((id) => map.delete(id));

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
            ? `Dev Build${versionStr ? ` v${versionStr}` : ''}`
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
            if (
              dismissedHubSet.has(synthId) ||
              isGlobalAlertDismissed(alertRow.id, spoke.schema_id)
            ) {
              continue;
            }
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
      import('./webPushClient')
        .then(({ syncPwaWebPushSubscription }) => syncPwaWebPushSubscription())
        .catch(() => {});
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
            icon: '/pwa-192x192.png?v=sovereign_v7',
            badge: '/pwa-192x192.png?v=sovereign_v7',
            tag: dedupeKey,
            requireInteraction: actionTypeId === 'PASSKEY_HANDSHAKE',
            vibrate: actionTypeId === 'PASSKEY_HANDSHAKE' ? [200, 100, 200] : undefined,
            data: { actionTypeId, ...(data || {}) },
          } as any);
          return true;
        }
      } catch (swErr) {
        // Fallback to window.Notification below
      }
    }

    const webNotif = new window.Notification(cleanTitle, {
      body: cleanBody,
      icon: '/pwa-192x192.png?v=sovereign_v7',
      tag: dedupeKey,
      requireInteraction: actionTypeId === 'PASSKEY_HANDSHAKE',
      data: { actionTypeId, ...(data || {}) },
    });
    webNotif.onclick = () => {
      window.focus();
      if (actionTypeId === 'PASSKEY_HANDSHAKE') {
        window.dispatchEvent(new CustomEvent('sanctuary-open-passkey-handshake'));
      }
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
  spokeId?: string | null;
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

  const extraMeta = {
    category,
    spokeId,
    referenceId: data?.referenceId ?? data?.broadcastId ?? null,
    dbType: data?.type,
  };

  if (hasDeliveredNotification(uniqueId, extraMeta)) {
    return;
  }

  // Mark as delivered immediately (with canonical cross-surface & cross-device keys) so concurrent polls/devices never double-send
  markNotificationDelivered(uniqueId, extraMeta);

  if (onInApp) {
    onInApp();
  }

  if (mode === 'OS') {
    await notifyOS(title, body, category.toUpperCase(), true, uniqueId, data);
  }
}

function collectKnownSpokeIdsForPrefs(): string[] {
  const spokes = new Set<string>();
  const wsList = useStore.getState().workspaces || [];
  wsList.forEach((w: any) => {
    const clean = normalizeSpokeKey(w?.schema_id || w?.id);
    if (clean) spokes.add(clean);
  });
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (key.startsWith('sanctuary_notify_mode_')) {
          const rest = key.slice('sanctuary_notify_mode_'.length);
          for (const cat of SPOKE_NOTIFICATION_CATEGORIES) {
            if (rest.endsWith(`_${cat}`)) {
              const maybeSpoke = normalizeSpokeKey(rest.slice(0, -(cat.length + 1)));
              if (maybeSpoke) spokes.add(maybeSpoke);
            }
          }
        }
      }
    } catch {}
  }
  return Array.from(spokes);
}

function buildLocalNotificationSyncPayload(): EncryptedNotificationSyncPayload {
  const now = Date.now();
  const deliveredMap = readTimestampMap(DELIVERED_MAP_STORAGE_KEY, DELIVERED_STORAGE_KEY);
  const readHubIds: Record<string, number> = {};
  readLocalIdSet(HUB_READ_STORAGE_KEY).forEach((id) => {
    if (id) readHubIds[id] = 1;
  });
  const dismissedHubIds: Record<string, number> = {};
  readLocalIdSet(HUB_DISMISSED_STORAGE_KEY).forEach((id) => {
    if (id) dismissedHubIds[id] = 1;
  });
  const dismissedGlobalAlerts = getDismissedGlobalAlertsMap();

  const modesGlobal: Record<string, string> = {};
  ALL_NOTIFICATION_CATEGORIES.forEach((cat) => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`sanctuary_notify_mode_${cat}`) : null;
    if (raw === 'OS' || raw === 'APP' || raw === 'NONE') {
      modesGlobal[cat] = raw;
    }
  });

  const modesBySpoke: Record<string, Record<string, string>> = {};
  for (const spokeId of collectKnownSpokeIdsForPrefs()) {
    const spokeMap: Record<string, string> = {};
    for (const cat of SPOKE_NOTIFICATION_CATEGORIES) {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem(`sanctuary_notify_mode_${spokeId}_${cat}`)
          : null;
      if (raw === 'OS' || raw === 'APP' || raw === 'NONE') {
        spokeMap[cat] = raw;
      }
    }
    if (Object.keys(spokeMap).length > 0) {
      modesBySpoke[spokeId] = spokeMap;
    }
  }

  const mutedSpokesByCategory: Record<string, string[]> = {};
  SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
    const muted = getMutedSpokesForCategory(cat);
    if (muted.length > 0) {
      mutedSpokesByCategory[cat] = muted;
    }
  });

  let allowedCrossSpokes: string[] | null = null;
  let notifyAuthorOnly = true;
  let masonAlerts: Record<string, Record<string, boolean>> = {};
  let prefsUpdatedAt = 0;

  if (typeof window !== 'undefined') {
    try {
      const rawAllowed = localStorage.getItem(CROSS_WORKSPACE_SPOKES_KEY);
      if (rawAllowed !== null) {
        const parsed = JSON.parse(rawAllowed);
        if (Array.isArray(parsed)) {
          allowedCrossSpokes = parsed.map((s) => String(s || '').trim()).filter(Boolean);
        }
      }
      notifyAuthorOnly = localStorage.getItem('sanctuary_notify_author_only') !== 'false';
      prefsUpdatedAt = Number(localStorage.getItem(PREFS_UPDATED_AT_KEY) || '0') || 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        if (key.startsWith('sanctuary_mason_alerts_')) {
          const scopeKey = key.slice('sanctuary_mason_alerts_'.length);
          const rawVal = localStorage.getItem(key);
          if (scopeKey && rawVal) {
            const parsedVal = JSON.parse(rawVal);
            if (parsedVal && typeof parsedVal === 'object') {
              masonAlerts[scopeKey] = parsedVal;
            }
          }
        }
      }
    } catch {}
  }

  return {
    version: 1,
    updated_at: new Date(now).toISOString(),
    prefs_updated_at: prefsUpdatedAt,
    delivered_ids: deliveredMap,
    read_hub_ids: readHubIds,
    dismissed_hub_ids: dismissedHubIds,
    dismissed_global_alerts: dismissedGlobalAlerts,
    prefs: {
      os_enabled:
        typeof window !== 'undefined'
          ? localStorage.getItem('sanctuary_os_notifications_enabled') === 'true'
          : false,
      cross_workspace_enabled: getCrossWorkspaceNotificationsEnabled(),
      allowed_cross_spokes: allowedCrossSpokes,
      mod_alerts_bp_scope: getModAlertsBlueprintScope(),
      notify_author_only: notifyAuthorOnly,
      modes_global: modesGlobal,
      modes_by_spoke: modesBySpoke,
      muted_spokes_by_category: mutedSpokesByCategory,
      mason_alerts: masonAlerts,
    },
  };
}

export function scheduleNotificationStatePush(delayMs = 400): void {
  if (typeof window === 'undefined' || isApplyingRemotePrefs) return;
  if (localStorage.getItem('sanctuary_local_only') === 'true') return;
  if (pendingPushTimer) clearTimeout(pendingPushTimer);
  pendingPushTimer = setTimeout(async () => {
    pendingPushTimer = null;
    try {
      const storeSession = useStore.getState().session;
      const activeSession =
        storeSession?.user?.id
          ? storeSession
          : (await supabaseAuth.auth.getSession())?.data?.session;
      if (!activeSession?.user?.id) return;
      const payload = buildLocalNotificationSyncPayload();
      const ok = await pushEncryptedNotificationSyncState(payload, activeSession);
      if (ok) {
        try {
          localStorage.setItem(LAST_SYNC_AT_KEY, new Date().toISOString());
        } catch {}
        window.dispatchEvent(new CustomEvent('sanctuary_notification_sync_completed'));
      }
    } catch {
      // ignore transient network errors
    }
  }, delayMs);
}

/**
 * Pulls and union-merges Zero-PII encrypted notification & alert acknowledgments
 * across Desktop, Steam Deck, Web, and Mobile PWA so every alert (including the
 * Command Center Global Alert Tile) fires at most once per alert per account.
 */
export async function syncCrossDeviceNotificationState(
  explicitSession?: any
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('sanctuary_local_only') === 'true') return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (inFlightNotificationSync) return inFlightNotificationSync;

  inFlightNotificationSync = (async () => {
    try {
      const storeSession = useStore.getState().session;
      const session =
        explicitSession?.user?.id
          ? explicitSession
          : storeSession?.user?.id
            ? storeSession
            : (await supabaseAuth.auth.getSession())?.data?.session;
      if (!session?.user?.id) return false;

      const remote = await pullEncryptedNotificationSyncState(session);
      if (!remote) {
        // First device on this account to initialize Zero-PII notification sync
        const initialPayload = buildLocalNotificationSyncPayload();
        const pushed = await pushEncryptedNotificationSyncState(initialPayload, session);
        if (pushed) {
          try {
            localStorage.setItem(LAST_SYNC_AT_KEY, new Date().toISOString());
          } catch {}
          window.dispatchEvent(new CustomEvent('sanctuary_notification_sync_completed'));
        }
        return pushed;
      }

      let localNeedsPush = false;
      let uiChanged = false;

      // 1. Union-merge delivered_ids
      const localDelivered = readTimestampMap(DELIVERED_MAP_STORAGE_KEY, DELIVERED_STORAGE_KEY);
      const remoteDelivered = remote.delivered_ids || {};
      const mergedDelivered: Record<string, number> = { ...localDelivered };
      let remoteHadDelivered = false;
      for (const [k, ts] of Object.entries(remoteDelivered)) {
        if (!k) continue;
        remoteHadDelivered = true;
        const cleanTs = typeof ts === 'number' && Number.isFinite(ts) ? ts : 1;
        if (!(k in mergedDelivered)) {
          mergedDelivered[k] = cleanTs;
        } else if (cleanTs > mergedDelivered[k]) {
          mergedDelivered[k] = cleanTs;
        }
      }
      for (const k of Object.keys(localDelivered)) {
        if (!(k in remoteDelivered)) {
          localNeedsPush = true;
          break;
        }
      }
      const cleanedDelivered = trimAndWriteTimestampMap(
        DELIVERED_MAP_STORAGE_KEY,
        mergedDelivered,
        DELIVERED_STORAGE_KEY
      );
      window.__sanctuary_notified_cache = new Set(Object.keys(cleanedDelivered));
      if (remoteHadDelivered) {
        try {
          localStorage.setItem(DELIVERED_SEEDED_KEY, 'true');
        } catch {}
      }

      // 2. Union-merge read_hub_ids & dismissed_hub_ids
      const localReadHub = readLocalIdSet(HUB_READ_STORAGE_KEY);
      const remoteReadHub = Object.keys(remote.read_hub_ids || {});
      for (const id of remoteReadHub) {
        if (id && !localReadHub.has(id)) {
          localReadHub.add(id);
          uiChanged = true;
        }
      }
      for (const id of localReadHub) {
        if (!remote.read_hub_ids || !(id in remote.read_hub_ids)) {
          localNeedsPush = true;
          break;
        }
      }
      writeLocalIdSet(HUB_READ_STORAGE_KEY, localReadHub);

      const localDismissedHub = readLocalIdSet(HUB_DISMISSED_STORAGE_KEY);
      const remoteDismissedHub = Object.keys(remote.dismissed_hub_ids || {});
      for (const id of remoteDismissedHub) {
        if (id && !localDismissedHub.has(id)) {
          localDismissedHub.add(id);
          uiChanged = true;
        }
      }
      for (const id of localDismissedHub) {
        if (!remote.dismissed_hub_ids || !(id in remote.dismissed_hub_ids)) {
          localNeedsPush = true;
          break;
        }
      }
      writeLocalIdSet(HUB_DISMISSED_STORAGE_KEY, localDismissedHub);

      // 3. Union-merge dismissed_global_alerts (Command Center Global Alert Tile)
      const localGlobalDismissed = getDismissedGlobalAlertsMap();
      const remoteGlobalDismissed = remote.dismissed_global_alerts || {};
      let globalAlertsChanged = false;
      for (const [k, ts] of Object.entries(remoteGlobalDismissed)) {
        if (!k) continue;
        const cleanTs = typeof ts === 'number' && Number.isFinite(ts) ? ts : 1;
        if (!(k in localGlobalDismissed)) {
          localGlobalDismissed[k] = cleanTs;
          globalAlertsChanged = true;
          uiChanged = true;
        } else if (cleanTs > localGlobalDismissed[k]) {
          localGlobalDismissed[k] = cleanTs;
        }
      }
      for (const k of Object.keys(localGlobalDismissed)) {
        if (!(k in remoteGlobalDismissed)) {
          localNeedsPush = true;
          break;
        }
      }
      trimAndWriteTimestampMap(DISMISSED_GLOBAL_ALERTS_KEY, localGlobalDismissed);

      // 4. LWW-merge notification preferences across devices
      const localPrefsAt = Number(localStorage.getItem(PREFS_UPDATED_AT_KEY) || '0') || 0;
      const remotePrefsAt = Number(remote.prefs_updated_at || 0) || 0;
      if (remote.prefs && remotePrefsAt > localPrefsAt) {
        isApplyingRemotePrefs = true;
        try {
          if (typeof remote.prefs.cross_workspace_enabled === 'boolean') {
            localStorage.setItem(
              CROSS_WORKSPACE_STORAGE_KEY,
              String(remote.prefs.cross_workspace_enabled)
            );
          }
          if (Array.isArray(remote.prefs.allowed_cross_spokes)) {
            localStorage.setItem(
              CROSS_WORKSPACE_SPOKES_KEY,
              JSON.stringify(remote.prefs.allowed_cross_spokes)
            );
          }
          if (remote.prefs.mod_alerts_bp_scope) {
            localStorage.setItem('sanctuary_mod_alerts_bp_scope', remote.prefs.mod_alerts_bp_scope);
          }
          if (typeof remote.prefs.notify_author_only === 'boolean') {
            localStorage.setItem(
              'sanctuary_notify_author_only',
              String(remote.prefs.notify_author_only)
            );
          }
          if (remote.prefs.modes_global) {
            for (const [cat, mode] of Object.entries(remote.prefs.modes_global)) {
              if (mode === 'OS' || mode === 'APP' || mode === 'NONE') {
                localStorage.setItem(`sanctuary_notify_mode_${cat}`, mode);
                const legacyKey = LEGACY_KEY_MAP[cat as NotificationCategory];
                if (legacyKey) {
                  localStorage.setItem(legacyKey, String(mode !== 'NONE'));
                }
              }
            }
          }
          if (remote.prefs.modes_by_spoke) {
            for (const [spokeId, spokeMap] of Object.entries(remote.prefs.modes_by_spoke)) {
              for (const [cat, mode] of Object.entries(spokeMap || {})) {
                if (mode === 'OS' || mode === 'APP' || mode === 'NONE') {
                  localStorage.setItem(`sanctuary_notify_mode_${spokeId}_${cat}`, mode);
                }
              }
            }
          }
          if (remote.prefs.muted_spokes_by_category) {
            SPOKE_NOTIFICATION_CATEGORIES.forEach((cat) => {
              const list = remote.prefs?.muted_spokes_by_category?.[cat] || [];
              localStorage.setItem(
                `sanctuary_notify_muted_spokes_${cat}`,
                JSON.stringify(Array.isArray(list) ? list : [])
              );
            });
          }
          if (remote.prefs.mason_alerts) {
            for (const [scopeKey, alertMap] of Object.entries(remote.prefs.mason_alerts)) {
              if (scopeKey && alertMap && typeof alertMap === 'object') {
                localStorage.setItem(
                  `sanctuary_mason_alerts_${scopeKey}`,
                  JSON.stringify(alertMap)
                );
              }
            }
          }
          localStorage.setItem(PREFS_UPDATED_AT_KEY, String(remotePrefsAt));
          uiChanged = true;
          globalAlertsChanged = true;
        } finally {
          isApplyingRemotePrefs = false;
        }
      } else if (localPrefsAt > remotePrefsAt) {
        localNeedsPush = true;
      }

      if (localNeedsPush) {
        await pushEncryptedNotificationSyncState(buildLocalNotificationSyncPayload(), session);
      }

      try {
        localStorage.setItem(LAST_SYNC_AT_KEY, new Date().toISOString());
      } catch {}

      if (globalAlertsChanged) {
        window.dispatchEvent(new CustomEvent('sanctuary_global_alert_sync'));
      }
      if (uiChanged) {
        window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
        window.dispatchEvent(new Event('refresh_notifications'));
      }
      window.dispatchEvent(new CustomEvent('sanctuary_notification_sync_completed'));
      return true;
    } catch (err) {
      console.warn('Cross-device notification sync skipped:', err);
      return false;
    } finally {
      inFlightNotificationSync = null;
    }
  })();

  return inFlightNotificationSync;
}
