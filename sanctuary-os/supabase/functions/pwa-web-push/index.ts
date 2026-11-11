/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SERVER_AUTH_OPTS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HUB_BROADCAST_ROLES = new Set(["keeper", "admin", "core_dev"]);
const SPOKE_BROADCAST_ROLES = new Set([
  "wayfinder",
  "oversight",
  "architect",
  "senior_architect",
  "admin",
  "mason",
]);

function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

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

function sanitizeSpokeSlug(raw?: unknown): string {
  const clean = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return clean && clean.toLowerCase() !== "global" ? clean : "";
}

function sanitizeRelativePushUrl(rawUrl: unknown, fallbackPath: string): string {
  const candidate = String(rawUrl || "").trim();
  if (!candidate) return fallbackPath;
  // Strictly permit single-slash relative paths only; reject schemes (`javascript:`, `https:`) and protocol-relative (`//evil.com`)
  if (/^\/(?!\/)[a-zA-Z0-9/_?=&.%#-]*$/.test(candidate)) {
    return candidate;
  }
  return fallbackPath;
}

function buildDefaultSpokePath(spokeSlug: string, query: string): string {
  return spokeSlug ? `/${spokeSlug}?${query}` : `/?${query}`;
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey, SERVER_AUTH_OPTS);

    let vapidPublicKey = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
    let vapidPrivateKey = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
    const vapidSubject =
      (Deno.env.get("VAPID_SUBJECT") || "").trim() ||
      "mailto:support@sanctuaryos.net";

    if (!vapidPublicKey || !vapidPrivateKey) {
      try {
        const [{ data: pubFromVault }, { data: privFromVault }] =
          await Promise.all([
            supabase.rpc("internal_get_runtime_secret", {
              p_key: "vapid_public_key",
            }),
            supabase.rpc("internal_get_runtime_secret", {
              p_key: "vapid_private_key",
            }),
          ]);
        if (!vapidPublicKey && typeof pubFromVault === "string") {
          vapidPublicKey = pubFromVault.trim();
        }
        if (!vapidPrivateKey && typeof privFromVault === "string") {
          vapidPrivateKey = privFromVault.trim();
        }
      } catch {
        // ignore vault lookup fallback
      }
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Web Push VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not configured.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Check whether caller is a trusted internal DB trigger / service_role or authenticated user
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const providedInternalSecret = (
      req.headers.get("x-internal-push-secret") || ""
    ).trim();

    let expectedInternalSecret = (
      Deno.env.get("INTERNAL_PUSH_SECRET") || ""
    ).trim();
    if (!expectedInternalSecret) {
      try {
        const { data: vaultPushSecret } = await supabase.rpc(
          "internal_get_runtime_secret",
          { p_key: "pwa_push_secret" }
        );
        if (typeof vaultPushSecret === "string") {
          expectedInternalSecret = vaultPushSecret.trim();
        }
      } catch {
        // ignore
      }
    }

    const isTrustedInternalCaller =
      (supabaseServiceKey &&
        bearerToken &&
        timingSafeEqualString(bearerToken, supabaseServiceKey)) ||
      (expectedInternalSecret &&
        providedInternalSecret &&
        timingSafeEqualString(providedInternalSecret, expectedInternalSecret));

    let callerUserId: string | null = null;
    if (!isTrustedInternalCaller && bearerToken && bearerToken.includes(".") && supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (user?.id) {
        callerUserId = user.id;
      }
    }

    const body = await req.json().catch(() => ({}));
    const pushType = String(body.type || "direct");
    const excludeEndpoint = String(body.exclude_endpoint || "").trim();
    const targetSpoke = sanitizeSpokeSlug(body.spoke_id);

    // Enforce strict authorization on broadcast & user_notification push types when called externally
    if (!isTrustedInternalCaller) {
      if (pushType === "broadcast") {
        if (!callerUserId) {
          return new Response(
            JSON.stringify({ success: false, error: "Authentication required for broadcast push" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: hubProf } = await supabase
          .from("profiles")
          .select("role, is_banned")
          .eq("id", callerUserId)
          .maybeSingle();
        const hubRole = String(hubProf?.role || "").toLowerCase();
        let authorizedBroadcast =
          !hubProf?.is_banned && HUB_BROADCAST_ROLES.has(hubRole);

        if (!authorizedBroadcast && !hubProf?.is_banned && targetSpoke) {
          // Verify Spoke staff clearance if dispatching for a specific Spoke
          const { data: gameRow } = await supabase
            .from("sanctuary_games")
            .select("id, supabase_url")
            .ilike("schema_id", targetSpoke)
            .maybeSingle();
          if (gameRow?.id && gameRow?.supabase_url) {
            const { data: gameSecret } = await supabase
              .from("sanctuary_game_secrets")
              .select("supabase_service_key")
              .eq("game_id", gameRow.id)
              .maybeSingle();
            if (gameSecret?.supabase_service_key) {
              const spokeDb = createClient(
                gameRow.supabase_url,
                gameSecret.supabase_service_key,
                SERVER_AUTH_OPTS
              );
              const { data: spokeProf } = await spokeDb
                .from("profiles")
                .select("role, is_banned")
                .eq("id", callerUserId)
                .maybeSingle();
              const spokeRole = String(spokeProf?.role || "").toLowerCase();
              if (!spokeProf?.is_banned && SPOKE_BROADCAST_ROLES.has(spokeRole)) {
                authorizedBroadcast = true;
              }
            }
          }
        }

        if (!authorizedBroadcast) {
          return new Response(
            JSON.stringify({ success: false, error: "Forbidden: Staff clearance required for broadcast push" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (pushType === "user_notification") {
        if (!callerUserId) {
          return new Response(
            JSON.stringify({ success: false, error: "Authentication required for user notification push" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (
        pushType !== "passkey_handshake" &&
        pushType !== "blueprint_staging" &&
        pushType !== "companion_radar"
      ) {
        return new Response(
          JSON.stringify({ success: false, error: "Unsupported push type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const defaultNotifUrl = buildDefaultSpokePath(
      targetSpoke,
      "open_notifications=1"
    );

    let subscriptions: any[] = [];
    let notifPayload: Record<string, any> = {
      title: sanitizeText(body.title || "Sanctuary OS", 80),
      body: sanitizeText(body.body || "New Sanctuary OS notification.", 160),
      actionTypeId: String(body.actionTypeId || "GEN"),
      tag: String(body.tag || body.unique_id || `sanctuary_${Date.now()}`),
      url: sanitizeRelativePushUrl(body.url, defaultNotifUrl),
      data: body.data || {},
    };
    let urgency: "very-low" | "low" | "normal" | "high" = "normal";
    let ttl = 86400;

    if (pushType === "passkey_handshake") {
      const handshakeToken = String(body.handshake_token || "").trim();
      if (handshakeToken.length < 16) {
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
        url: buildDefaultSpokePath(targetSpoke, "open_passkey_handshake=1"),
        data: {
          actionTypeId: "PASSKEY_HANDSHAKE",
          ...(body.data || {}),
        },
      };
    } else if (pushType === "blueprint_staging") {
      const stagingToken = String(body.staging_token || "").trim();
      if (stagingToken.length < 16) {
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
        url: defaultNotifUrl,
        data: {
          actionTypeId: "SIGNATURE_QUEUE",
          ...(body.data || {}),
        },
      };
    } else if (pushType === "companion_radar") {
      const companionToken = String(body.companion_token || "").trim();
      if (companionToken.length < 16) {
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
        shouldSendForCategory(sub.prefs, "mod_alerts", targetSpoke || "global")
      );
      urgency = "high";
      notifPayload = {
        title: sanitizeText(body.title || "Vault Companion Radar Alert", 80),
        body: sanitizeText(
          body.body || "New updates or alerts detected in your Vault.",
          160
        ),
        actionTypeId: "MOD_ALERTS",
        tag: String(
          body.unique_id || `companion_radar_${companionToken.slice(0, 12)}`
        ),
        url: defaultNotifUrl,
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
        shouldSendForCategory(sub.prefs, category, targetSpoke || "global")
      );
      urgency = "high";
      notifPayload = {
        title: sanitizeText(body.title || "Sanctuary OS", 80),
        body: sanitizeText(body.body || "You have a new notification.", 160),
        actionTypeId: category.toUpperCase(),
        tag: String(body.unique_id || `notif_${Date.now()}`),
        url: defaultNotifUrl,
        data: {
          actionTypeId: category.toUpperCase(),
          spokeId: targetSpoke || "global",
        },
      };
    } else if (pushType === "broadcast") {
      const spokeId = targetSpoke || "global";
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
        url: defaultNotifUrl,
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
        const subSpoke =
          targetSpoke ||
          sanitizeSpokeSlug(sub?.prefs?.default_spoke) ||
          (Array.isArray(sub?.subscribed_spokes)
            ? sanitizeSpokeSlug(
                sub.subscribed_spokes.find((s: string) => s && s !== "global")
              )
            : "");
        const fallbackSubUrl =
          pushType === "passkey_handshake"
            ? buildDefaultSpokePath(subSpoke, "open_passkey_handshake=1")
            : buildDefaultSpokePath(subSpoke, "open_notifications=1");
        const subUrl =
          pushType === "passkey_handshake"
            ? fallbackSubUrl
            : sanitizeRelativePushUrl(body.url, fallbackSubUrl);
        const perSubPayload = {
          ...notifPayload,
          url: subUrl,
        };
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(perSubPayload),
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
            console.warn(
              "Web push delivery error:",
              status,
              err?.message || err
            );
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
