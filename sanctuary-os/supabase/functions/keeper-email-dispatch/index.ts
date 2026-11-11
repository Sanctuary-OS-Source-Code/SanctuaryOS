/// <reference path="../deno.d.ts" />
// Supabase Edge Function: keeper-email-dispatch
// Official In-App Outbound Email Dispatcher for Keepers Core
// Enforces authenticated Keeper/Core-Dev/Admin authorization and server-side secret isolation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_DISPATCH_ROLES = new Set(["keeper", "admin", "core_dev"]);

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHttpsRelayUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^10\./.test(host) ||
      /^127\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildSanctuaryEmailHtml(params: {
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  ticketId?: string | null;
}): string {
  const safeFromName = escapeHtml(params.fromName);
  const safeFromEmail = escapeHtml(params.fromEmail);
  const safeSubject = escapeHtml(params.subject);
  const safeBody = escapeHtml(params.bodyText).replace(/\r?\n/g, "<br/>");
  const safeTicketBadge = params.ticketId
    ? `<span style="display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-family:monospace;font-size:11px;font-weight:700;">TICKET #${escapeHtml(params.ticketId.slice(0, 8).toUpperCase())}</span>`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#070b14;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background-color:#0f172a;border:1px solid rgba(255,255,255,0.12);border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);">
      <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#38bdf8;">
            SANCTUARY OS • KEEPERS CORE
          </div>
          <div style="font-size:16px;font-weight:800;color:#f8fafc;margin-top:4px;">
            ${safeFromName}
          </div>
          <div style="font-size:11px;font-family:monospace;color:#94a3b8;margin-top:2px;">
            ${safeFromEmail}
          </div>
        </div>
        <div>${safeTicketBadge}</div>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:800;color:#f8fafc;">
          ${safeSubject}
        </h2>
        <div style="padding:18px;border-radius:14px;background-color:#090d16;border:1px solid rgba(255,255,255,0.08);font-size:14px;line-height:1.65;color:#e2e8f0;">
          ${safeBody}
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#64748b;display:flex;justify-content:space-between;">
        <span>100% Human-Reviewed • Dispatched directly from Sanctuary OS Keepers Core</span>
      </div>
    </div>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Server configuration incomplete" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Strict authentication: require valid Hub JWT
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user?.id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid or expired session token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("id, role, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    const callerRole = String(callerProfile?.role || "").toLowerCase();
    if (
      !callerProfile ||
      callerProfile.is_banned ||
      !ALLOWED_DISPATCH_ROLES.has(callerRole)
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Forbidden: Keepers Core clearance required",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Optional Keeper-only action to rotate/store outbound email relay secrets server-side
    if (body.action === "save_email_secrets") {
      if (callerRole !== "keeper") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Forbidden: Only Keepers can configure email relay secrets",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (body.support_email_api_key !== undefined) {
        await adminClient.rpc("internal_set_runtime_secret", {
          p_key: "support_email_api_key",
          p_value: String(body.support_email_api_key || "").trim(),
        });
      }
      if (body.support_email_webhook_url !== undefined) {
        const candidateUrl = String(body.support_email_webhook_url || "").trim();
        if (candidateUrl && !isSafeHttpsRelayUrl(candidateUrl)) {
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "Invalid webhook relay URL: must be a public https:// endpoint",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        await adminClient.rpc("internal_set_runtime_secret", {
          p_key: "support_email_webhook_url",
          p_value: candidateUrl,
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toEmail = String(body.to_email || "").trim();
    const subject = String(body.subject || "").trim();
    const bodyText = String(body.body_text || "").trim();
    const ticketId = body.ticket_id ? String(body.ticket_id).trim() : null;

    if (
      !toEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail) ||
      !subject ||
      !bodyText
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing or invalid to_email, subject, or body_text",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load non-sensitive sender display metadata from PipelineConfig
    let pipelineCfg: Record<string, any> = {};
    try {
      const { data: cfgRow } = await adminClient
        .from("keeper_system_broadcasts")
        .select("description, message")
        .eq("category", "PipelineConfig")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cfgRow) {
        const rawJson = cfgRow.description || cfgRow.message;
        if (rawJson) {
          pipelineCfg = JSON.parse(rawJson);
        }
      }
    } catch {
      // ignore config parse fallback
    }

    const fromEmail =
      String(
        body.from_email ||
          pipelineCfg.support_contact_email ||
          Deno.env.get("KEEPER_FROM_EMAIL") ||
          "support@sanctuaryos.gg"
      ).trim() || "support@sanctuaryos.gg";

    const fromName =
      String(
        body.from_name ||
          pipelineCfg.support_sender_name ||
          Deno.env.get("KEEPER_FROM_NAME") ||
          "Sanctuary OS Keepers Core"
      ).trim() || "Sanctuary OS Keepers Core";

    const replyTo =
      String(
        body.reply_to || pipelineCfg.support_reply_to_email || fromEmail
      ).trim() || fromEmail;

    // Resolve relay credentials strictly from Edge environment or private runtime_secrets vault (never untrusted request body)
    let vaultApiKey = "";
    let vaultWebhookUrl = "";
    try {
      const [{ data: secretKey }, { data: secretWebhook }] = await Promise.all([
        adminClient.rpc("internal_get_runtime_secret", {
          p_key: "support_email_api_key",
        }),
        adminClient.rpc("internal_get_runtime_secret", {
          p_key: "support_email_webhook_url",
        }),
      ]);
      if (typeof secretKey === "string") vaultApiKey = secretKey.trim();
      if (typeof secretWebhook === "string") vaultWebhookUrl = secretWebhook.trim();
    } catch {
      // ignore if vault empty
    }

    const resendApiKey = String(
      Deno.env.get("RESEND_API_KEY") ||
        Deno.env.get("KEEPER_EMAIL_API_KEY") ||
        vaultApiKey ||
        ""
    ).trim();

    const webhookUrl = String(
      Deno.env.get("KEEPER_EMAIL_WEBHOOK_URL") || vaultWebhookUrl || ""
    ).trim();

    const htmlBody = buildSanctuaryEmailHtml({
      fromName,
      fromEmail,
      subject,
      bodyText,
      ticketId,
    });

    let dispatchStatus = "DISPATCHED_IN_APP";
    let providerUsed = "KEEPERS_CORE_MAILBOX";
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;

    if (resendApiKey) {
      providerUsed = "RESEND";
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [toEmail],
            reply_to: replyTo,
            subject,
            text: bodyText,
            html: htmlBody,
          }),
        });
        const resendData = await resendRes.json().catch(() => ({}));
        if (resendRes.ok) {
          dispatchStatus = "DELIVERED";
          providerMessageId = resendData?.id || `resend_${Date.now()}`;
        } else {
          dispatchStatus = "LOGGED_RELAY_WARN";
          errorMessage =
            resendData?.message ||
            resendData?.error ||
            `Resend HTTP ${resendRes.status}`;
        }
      } catch (e: any) {
        dispatchStatus = "LOGGED_RELAY_WARN";
        errorMessage = e?.message || "Resend network error";
      }
    } else if (webhookUrl && isSafeHttpsRelayUrl(webhookUrl)) {
      providerUsed = "CUSTOM_WEBHOOK";
      try {
        const whRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          redirect: "error",
          body: JSON.stringify({
            from_name: fromName,
            from_email: fromEmail,
            reply_to: replyTo,
            to_email: toEmail,
            subject,
            text: bodyText,
            html: htmlBody,
            ticket_id: ticketId,
          }),
        });
        if (whRes.ok) {
          dispatchStatus = "DELIVERED";
          providerMessageId = `webhook_${Date.now()}`;
        } else {
          dispatchStatus = "LOGGED_RELAY_WARN";
          errorMessage = `Webhook HTTP ${whRes.status}`;
        }
      } catch (e: any) {
        dispatchStatus = "LOGGED_RELAY_WARN";
        errorMessage = e?.message || "Webhook network error";
      }
    } else {
      providerMessageId = `keeper_mail_${crypto.randomUUID().slice(0, 12)}`;
    }

    const { data: insertedRow } = await adminClient
      .from("keeper_email_dispatches")
      .insert({
        ticket_id: ticketId || null,
        sender_user_id: user.id,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        to_email: toEmail,
        subject,
        body_text: bodyText,
        body_html: htmlBody,
        provider: providerUsed,
        provider_message_id: providerMessageId,
        status: dispatchStatus,
        error_message: errorMessage,
      })
      .select("*")
      .maybeSingle();

    if (ticketId) {
      try {
        const { data: existingTicket } = await adminClient
          .from("keeper_tickets")
          .select("metadata")
          .eq("id", ticketId)
          .maybeSingle();
        if (existingTicket) {
          const prevMeta = existingTicket.metadata || {};
          const prevDispatches = Array.isArray(prevMeta.email_dispatches)
            ? prevMeta.email_dispatches
            : [];
          const nextMeta = {
            ...prevMeta,
            email_dispatches: [
              ...prevDispatches,
              {
                id: insertedRow?.id || providerMessageId,
                from_name: fromName,
                from_email: fromEmail,
                to_email: toEmail,
                subject,
                status: dispatchStatus,
                provider: providerUsed,
                sent_at: new Date().toISOString(),
              },
            ],
          };
          await adminClient
            .from("keeper_tickets")
            .update({ metadata: nextMeta })
            .eq("id", ticketId);
        }
      } catch {
        // non-fatal metadata update
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dispatch: insertedRow || {
          id: providerMessageId,
          from_name: fromName,
          from_email: fromEmail,
          to_email: toEmail,
          subject,
          status: dispatchStatus,
          provider: providerUsed,
        },
        status: dispatchStatus,
        provider: providerUsed,
        warning: errorMessage || undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Failed to dispatch email from Keepers Core",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
