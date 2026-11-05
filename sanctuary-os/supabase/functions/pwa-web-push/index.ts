/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VAPID_PUBLIC_KEY =
  "BMkZU-8U5MJ2gM8dsJKsMTrerW0_PMXDOJV3kFCJRwrfc5BexoPOww4tAP_8gu_jMUFgxHmDb9_pjLMfUizdJvs";
const DEFAULT_VAPID_PRIVATE_KEY =
  "dDHK3nx9dylGSsyMpw4v2M-LOh19zrHos8Miiyyf-QU";

const vapidPublicKey =
  Deno.env.get("VAPID_PUBLIC_KEY") || DEFAULT_VAPID_PUBLIC_KEY;
const vapidPrivateKey =
  Deno.env.get("VAPID_PRIVATE_KEY") || DEFAULT_VAPID_PRIVATE_KEY;
const vapidSubject =
  Deno.env.get("VAPID_SUBJECT") || "mailto:support@sanctuaryos.net";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function sanitizeText(raw: string, maxLen = 160): string {
  const clean = String(raw || "")
    .replace(/\[(.*?)\](\(.*?\))?/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[#*_`~>]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > maxLen
    ? `${clean.substring(0, maxLen - 3).trim()}...`
    : clean;
}

function mapNotifTypeToCategory(rawType?: string): string {
  const t = String(rawType || "").toLowerCase();
  if (t.includes("keeper")) return "keepers_news";
  if (t.includes("patch") || t.includes("update_log")) return "patch_update_logs";
  if (t.includes("defcon")) return "defcon";
  if (t.includes("alert") || t.includes("malware")) return "alert_banner";
  if (t.includes("mod_alert")) return "mod_alerts";
  if (t.includes("post") && !t.includes("reply") && !t.includes("comment")) {
    return "new_posts";
  }
  if (t.includes("reply") || t.includes("comment") || t.includes("like")) {
    return "replies";
  }
  if (t.includes("ticket") || t.includes("support")) return "support";
  return "system_dispatch";
}

function shouldSendForCategory(
  prefs: Record<string, any> | null | undefined,
  category: string,
  spokeId?: string
): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  if (prefs.os_enabled === false) return false;
  if (spokeId && spokeId !== "global") {
    const spokeMode = prefs[`${spokeId}:${category}`];
    if (spokeMode === "NONE" || spokeMode === "APP") return false;
    if (spokeMode === "OS") return true;
  }
  const globalMode = prefs[category];
  if (globalMode === "NONE" || globalMode === "APP") return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const pushType = String(body.type || "direct");
    const excludeEndpoint = String(body.exclude_endpoint || "").trim();

    let subscriptions: any[] = [];
    let notifPayload: Record<string, any> = {
      title: sanitizeText(body.title || "Sanctuary OS", 80),
      body: sanitizeText(body.body || "New Sanctuary OS notification.", 160),
      actionTypeId: String(body.actionTypeId || "GEN"),
      tag: String(body.tag || body.unique_id || `sanctuary_${Date.now()}`),
      url: String(body.url || "/?open_notifications=1"),
      data: body.data || {},
    };
    let urgency: "very-low" | "low" | "normal" | "high" = "normal";
    let ttl = 86400;

    if (pushType === "passkey_handshake") {
      const handshakeToken = String(body.handshake_token || "").trim();
      if (!handshakeToken) {
        return new Response(
          JSON.stringify({ sent: 0, reason: "missing_handshake_token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data } = await supabase
        .from("pwa_push_subscriptions")
        .select("*")
        .eq("handshake_token", handshakeToken);

      subscriptions = data || [];
      urgency = "high";
      ttl = 180;
      notifPayload = {
        title: sanitizeText(
          body.title || "Approve Rig Passkey Handshake",
          80
        ),
        body: sanitizeText(
          body.body ||
            "A companion rig is requesting live FIDO2 Passkey approval. Tap to verify.",
          160
        ),
        actionTypeId: "PASSKEY_HANDSHAKE",
        tag: `passkey_handshake_${handshakeToken.slice(0, 16)}`,
        url: "/?open_passkey_handshake=1",
        data: {
          actionTypeId: "PASSKEY_HANDSHAKE",
          ...(body.data || {}),
        },
      };
    } else if (pushType === "blueprint_staging") {
      const stagingToken = String(body.staging_token || "").trim();
      if (!stagingToken) {
        return new Response(
          JSON.stringify({ sent: 0, reason: "missing_staging_token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data } = await supabase
        .from("pwa_push_subscriptions")
        .select("*")
        .eq("staging_token", stagingToken);

      subscriptions = data || [];
      urgency = "high";
      ttl = 3600;
      notifPayload = {
        title: sanitizeText(
          body.title || "Blueprint Staged to Signature Queue",
          80
        ),
        body: sanitizeText(
          body.body ||
            "A new encrypted Blueprint payload is ready in your Signature Queue.",
          160
        ),
        actionTypeId: "SIGNATURE_QUEUE",
        tag: `sig_queue_${stagingToken.slice(0, 16)}`,
        url: "/?open_notifications=1",
        data: {
          actionTypeId: "SIGNATURE_QUEUE",
          ...(body.data || {}),
        },
      };
    } else if (pushType === "companion_radar") {
      const companionToken = String(body.companion_token || "").trim();
      if (!companionToken) {
        return new Response(
          JSON.stringify({ sent: 0, reason: "missing_companion_token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data } = await supabase
        .from("pwa_push_subscriptions")
        .select("*")
        .eq("companion_token", companionToken);

      subscriptions = (data || []).filter((sub: any) =>
        shouldSendForCategory(sub.prefs, "mod_alerts", body.spoke_id)
      );
      urgency = "high";
      notifPayload = {
        title: sanitizeText(body.title || "Vault Companion Radar Alert", 80),
        body: sanitizeText(
          body.body || "New updates or alerts detected in your Vault.",
          160
        ),
        actionTypeId: "MOD_ALERTS",
        tag: String(body.unique_id || `companion_radar_${companionToken.slice(0, 12)}`),
        url: "/?open_notifications=1",
        data: {
          actionTypeId: "MOD_ALERTS",
          ...(body.data || {}),
        },
      };
    } else if (pushType === "user_notification") {
      const userId = String(body.user_id || "").trim();
      if (!userId) {
        return new Response(
          JSON.stringify({ sent: 0, reason: "missing_user_id" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const category = mapNotifTypeToCategory(body.notif_type);
      const { data } = await supabase
        .from("pwa_push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      subscriptions = (data || []).filter((sub: any) =>
        shouldSendForCategory(sub.prefs, category, body.spoke_id)
      );
      urgency = "high";
      notifPayload = {
        title: sanitizeText(body.title || "Sanctuary OS", 80),
        body: sanitizeText(body.body || "You have a new notification.", 160),
        actionTypeId: category.toUpperCase(),
        tag: String(body.unique_id || `notif_${Date.now()}`),
        url: "/?open_notifications=1",
        data: {
          actionTypeId: category.toUpperCase(),
          spokeId: body.spoke_id || "global",
        },
      };
    } else if (pushType === "broadcast") {
      const spokeId = String(body.spoke_id || "global").trim();
      const category = mapNotifTypeToCategory(body.broadcast_type);
      const { data } = await supabase
        .from("pwa_push_subscriptions")
        .select("*")
        .contains("subscribed_spokes", [spokeId]);

      subscriptions = (data || []).filter((sub: any) =>
        shouldSendForCategory(sub.prefs, category, spokeId)
      );
      urgency =
        category === "defcon" || category === "alert_banner" ? "high" : "normal";
      notifPayload = {
        title: sanitizeText(body.title || "Sanctuary OS Dispatch", 80),
        body: sanitizeText(body.body || "New broadcast dispatch.", 160),
        actionTypeId: category.toUpperCase(),
        tag: String(body.unique_id || `bc_${Date.now()}`),
        url: "/?open_notifications=1",
        data: {
          actionTypeId: category.toUpperCase(),
          spokeId,
        },
      };
    }

    if (excludeEndpoint) {
      subscriptions = subscriptions.filter(
        (sub: any) => sub.endpoint !== excludeEndpoint
      );
    }

    let sentCount = 0;
    const staleEndpoints: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub: any) => {
        if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) return;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(notifPayload),
            {
              TTL: ttl,
              urgency,
            }
          );
          sentCount++;
        } catch (err: any) {
          const status = Number(err?.statusCode || 0);
          if (status === 404 || status === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.warn("Web push delivery error:", status, err?.message || err);
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      await supabase
        .from("pwa_push_subscriptions")
        .delete()
        .in("endpoint", staleEndpoints);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        pruned: staleEndpoints.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

