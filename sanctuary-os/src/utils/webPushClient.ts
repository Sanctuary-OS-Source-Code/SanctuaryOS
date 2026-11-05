import { supabaseAuth, getActiveGameClient } from "../supabase";
import { useStore } from "../store";
import { isDesktop } from "./envUtils";
import {
  ALL_NOTIFICATION_CATEGORIES,
  SPOKE_NOTIFICATION_CATEGORIES,
  getNotificationMode,
  getAllowedCrossWorkspaceSpokes,
} from "./notificationHelper";

export const SANCTUARY_VAPID_PUBLIC_KEY =
  "BMkZU-8U5MJ2gM8dsJKsMTrerW0_PMXDOJV3kFCJRwrfc5BexoPOww4tAP_8gu_jMUFgxHmDb9_pjLMfUizdJvs";

const LOCAL_PUSH_ENDPOINT_KEY = "sanctuary_pwa_push_endpoint";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getLocalPushEndpoint(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(LOCAL_PUSH_ENDPOINT_KEY) || "";
  } catch {
    return "";
  }
}

function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "PWA Client";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS Mobile PWA";
  if (/Android/i.test(ua)) return "Android Mobile PWA";
  if (/Mac/i.test(ua)) return "macOS Web Client";
  if (/Win/i.test(ua)) return "Windows Web Client";
  return "Web / PWA Client";
}

function buildNotificationPrefsSnapshot(spokeIds: string[]): Record<string, any> {
  const prefs: Record<string, any> = {
    os_enabled:
      typeof localStorage !== "undefined"
        ? localStorage.getItem("sanctuary_os_notifications_enabled") !== "false"
        : true,
  };
  for (const cat of ALL_NOTIFICATION_CATEGORIES) {
    prefs[cat] = getNotificationMode(cat);
  }
  for (const spokeId of spokeIds) {
    if (!spokeId || spokeId === "global") continue;
    for (const cat of SPOKE_NOTIFICATION_CATEGORIES) {
      prefs[`${spokeId}:${cat}`] = getNotificationMode(cat, spokeId);
    }
  }
  return prefs;
}

let syncInFlight: Promise<boolean> | null = null;

export async function syncPwaWebPushSubscription(): Promise<boolean> {
  if (
    isDesktop() ||
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }

  if (window.Notification.permission !== "granted") {
    return false;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
      }
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            SANCTUARY_VAPID_PUBLIC_KEY
          ) as unknown as BufferSource,
        });
      }

      const subJson = sub.toJSON();
      const endpoint = subJson?.endpoint || "";
      const p256dh = subJson?.keys?.p256dh || "";
      const auth = subJson?.keys?.auth || "";
      if (!endpoint || !p256dh || !auth) {
        return false;
      }

      try {
        localStorage.setItem(LOCAL_PUSH_ENDPOINT_KEY, endpoint);
      } catch {}

      const state = useStore.getState();
      const { data: sessionData } = await supabaseAuth.auth.getSession();
      const user = sessionData?.session?.user || state.session?.user;
      const userId = user?.id || null;
      const email = (user?.email || "").trim().toLowerCase();

      let userHash: string | null = null;
      let handshakeToken: string | null = null;
      let stagingToken: string | null = null;
      let companionToken: string | null = null;

      if (userId) {
        userHash = await sha256Hex(`sanctuary_push_user_v1:${userId}`);
        handshakeToken = await sha256Hex(
          `sanctuary_citizen_passkey_handshake_v1:${userId}:${email}`
        );
        stagingToken = await sha256Hex(
          `sanctuary_citizen_stage_v1:${userId}:${email}`
        );
        companionToken = await sha256Hex(
          `sanctuary_citizen_companion_v1:${userId}:${email}`
        );
      }

      const workspaces = state.workspaces || [];
      const allSpokeIds = Array.from(
        new Set(
          workspaces
            .map((w: any) => String(w.schema_id || w.game_id || w.id || "").trim())
            .filter((id: string) => id && id !== "default_workspace")
        )
      );
      if (allSpokeIds.length === 0) {
        allSpokeIds.push("sims4");
      }
      const allowedSpokes = getAllowedCrossWorkspaceSpokes(allSpokeIds);
      const activeWsId = String(state.activeWorkspaceId || "").trim();
      const subscribedSpokes = Array.from(
        new Set([
          "global",
          ...allowedSpokes,
          ...(activeWsId && activeWsId !== "default_workspace" ? [activeWsId] : []),
        ])
      );

      const prefs = buildNotificationPrefsSnapshot(subscribedSpokes);
      const lastActiveWs =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("sanctuary_last_active_workspace") || ""
          : "";
      prefs.default_spoke =
        activeWsId && activeWsId !== "default_workspace" && activeWsId !== "global"
          ? activeWsId
          : lastActiveWs && lastActiveWs !== "default_workspace" && lastActiveWs !== "global"
            ? lastActiveWs
            : "sims4";

      const rowPayload = {
        endpoint,
        p256dh,
        auth,
        user_id: userId,
        user_hash: userHash,
        handshake_token: handshakeToken,
        staging_token: stagingToken,
        companion_token: companionToken,
        device_label: getDeviceLabel(),
        subscribed_spokes: subscribedSpokes,
        prefs,
        updated_at: new Date().toISOString(),
      };

      await supabaseAuth
        .from("pwa_push_subscriptions")
        .upsert(rowPayload, { onConflict: "endpoint" });

      const spokeClient = getActiveGameClient();
      if (spokeClient && spokeClient !== (supabaseAuth as any)) {
        spokeClient
          .from("pwa_push_subscriptions")
          .upsert(rowPayload, { onConflict: "endpoint" })
          .then(() => {});
      }

      return true;
    } catch (err) {
      console.warn("PWA Web Push subscription sync skipped:", err);
      return false;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export async function triggerPwaWebPush(
  payload: Record<string, any>
): Promise<void> {
  try {
    const excludeEndpoint = getLocalPushEndpoint();
    await supabaseAuth.functions.invoke("pwa-web-push", {
      body: {
        ...payload,
        ...(excludeEndpoint ? { exclude_endpoint: excludeEndpoint } : {}),
      },
    });
  } catch {
    // Non-blocking background push trigger
  }
}

