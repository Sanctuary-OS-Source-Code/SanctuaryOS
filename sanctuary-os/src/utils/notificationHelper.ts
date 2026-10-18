import { isPermissionGranted, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './envUtils';

export type NotificationDeliveryMode = 'OS' | 'APP' | 'NONE';

export type NotificationCategory =
  | 'defcon'
  | 'alert_banner'
  | 'system_dispatch'
  | 'new_posts'
  | 'replies'
  | 'support';

export type SystemNotificationPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

declare global {
  interface Window {
    __sanctuary_notified_cache: Set<string>;
  }
}

const DELIVERED_STORAGE_KEY = 'sanctuary_delivered_notifs_v1';
const DELIVERED_SEEDED_KEY = 'sanctuary_delivered_notifs_seeded_v1';
const MAX_DELIVERED_IDS = 500;

const LEGACY_KEY_MAP: Record<NotificationCategory, string> = {
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

export function getNotificationMode(category: NotificationCategory): NotificationDeliveryMode {
  if (typeof window === 'undefined') return 'APP';
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

export function setNotificationMode(category: NotificationCategory, mode: NotificationDeliveryMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`sanctuary_notify_mode_${category}`, mode);
  const legacyKey = LEGACY_KEY_MAP[category];
  if (legacyKey) {
    localStorage.setItem(legacyKey, (mode !== 'NONE').toString());
  }
  if (mode === 'OS') {
    localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
  }
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function setAllNotificationModes(mode: NotificationDeliveryMode): void {
  const categories: NotificationCategory[] = [
    'defcon',
    'alert_banner',
    'system_dispatch',
    'new_posts',
    'replies',
    'support',
  ];
  categories.forEach((cat) => {
    localStorage.setItem(`sanctuary_notify_mode_${cat}`, mode);
    const legacyKey = LEGACY_KEY_MAP[cat];
    if (legacyKey) {
      localStorage.setItem(legacyKey, (mode !== 'NONE').toString());
    }
  });
  if (mode === 'OS') {
    localStorage.setItem('sanctuary_os_notifications_enabled', 'true');
  }
  window.dispatchEvent(new Event('refresh_notifications'));
  window.dispatchEvent(new Event('sanctuary_notification_prefs_changed'));
}

export function mapDbNotificationTypeToCategory(dbType?: string): NotificationCategory {
  switch (dbType) {
    case 'reply':
      return 'replies';
    case 'support_reply':
      return 'support';
    case 'new_post':
      return 'new_posts';
    case 'system_broadcast':
    default:
      return 'system_dispatch';
  }
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
  const dedupeKey = uniqueId || `${actionTypeId || 'GEN'}::${title}::${body}`;
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
        await invoke('send_sanctuary_notification', { title, body: cleanBody });
      } catch (invokeErr) {
        sendNotification({ title, body: cleanBody, actionTypeId });
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
          await reg.showNotification(title, {
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

    const webNotif = new window.Notification(title, {
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
  onInApp?: () => void;
  data?: Record<string, any>;
}

/**
 * Unified router for DEFCON Alerts, Comm-Link Posts, Support Alerts, and Global Alerts.
 * Ensures each notification is only ever dispatched once and respects the per-type mode ('OS' | 'APP' | 'NONE').
 */
export async function dispatchSanctuaryNotification(opts: DispatchNotificationOptions): Promise<void> {
  const { uniqueId, category, title, body, onInApp, data } = opts;
  const mode = getNotificationMode(category);

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
