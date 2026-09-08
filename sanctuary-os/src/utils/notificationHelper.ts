import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isDesktop } from './envUtils';

declare global {
    interface Window {
        __sanctuary_notified_cache: Set<string>;
    }
}

export async function notifyOS(title: string, body: string, actionTypeId?: string, overrideSetting: boolean = false) {
    if (!isDesktop()) return;

    window.__sanctuary_notified_cache = window.__sanctuary_notified_cache || new Set();
    const cacheKey = `${title}::${body}`;
    if (window.__sanctuary_notified_cache.has(cacheKey)) return;
    window.__sanctuary_notified_cache.add(cacheKey);

    try {
        const notificationsEnabled = localStorage.getItem("sanctuary_os_notifications_enabled") === "true";
        
        if (!notificationsEnabled && !overrideSetting) {
            return;
        }

        let permissionGranted = await isPermissionGranted();
        
        if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
            const cleanBody = body.replace(/\[.*?\](\(.*?\))?/g, '').replace(/<.*?>/g, '').replace(/[\r\n]+/g, ' ').substring(0, 150).trim() + (body.length > 150 ? "..." : "");
            sendNotification({ title, body: cleanBody, actionTypeId });
        }
    } catch (err) {
        console.error("Failed to send OS notification:", err);
    }
}
