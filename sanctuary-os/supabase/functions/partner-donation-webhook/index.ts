/// <reference path="../deno.d.ts" />
// Supabase Edge Function: partner-donation-webhook
// Non-Custodial Partner & Keepers Core Payment Processor Webhook Bridge
// Cryptographically verifies Stripe (Stripe-Signature HMAC-SHA256 + 300s replay window) and Ko-fi (verification_token).
// Credits only verified paid amounts (`session.amount_total`) and records monthly ledgers atomically via Postgres row locks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-partner-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_STRIPE_TIMESTAMP_DRIFT_SECONDS = 300;

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

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const item of parts) {
    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) continue;
    const k = item.slice(0, eqIdx).trim();
    const v = item.slice(eqIdx + 1).trim();
    if (k === "t" && v) timestamp = v;
    else if (k === "v1" && v) signatures.push(v.toLowerCase());
  }

  if (!timestamp || signatures.length === 0) return false;

  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > MAX_STRIPE_TIMESTAMP_DRIFT_SECONDS) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const macBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload),
  );
  const computedHex = Array.from(new Uint8Array(macBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  let matched = false;
  for (const sig of signatures) {
    if (timingSafeEqualString(computedHex, sig)) {
      matched = true;
    }
  }
  return matched;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeWebhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
    const kofiVerificationToken = (Deno.env.get("KOFI_VERIFICATION_TOKEN") ?? "").trim();
    const partnerSharedSecret = (Deno.env.get("PARTNER_WEBHOOK_SECRET") ?? "").trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const reqUrl = new URL(req.url);
    let targetId = (
      reqUrl.searchParams.get("target") ||
      reqUrl.searchParams.get("spoke") ||
      "keepers_core"
    )
      .trim()
      .toLowerCase();

    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    let userId = "";
    let email = "";
    let amountCents = 0;
    let txNonce = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      if (!kofiVerificationToken) {
        return new Response(
          JSON.stringify({ ok: false, error: "Ko-fi webhook verification is not configured" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const params = new URLSearchParams(rawBody);
      const rawData = params.get("data");
      if (!rawData) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing Ko-fi payload data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const kofi = JSON.parse(rawData);
      if (
        !kofi?.verification_token ||
        !timingSafeEqualString(String(kofi.verification_token), kofiVerificationToken)
      ) {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid Ko-fi verification token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const kofiId = String(kofi.kofi_transaction_id || kofi.message_id || "").trim();
      if (!kofiId) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing Ko-fi transaction identifier" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      email = String(kofi.email || "").trim();
      amountCents = Math.max(0, Math.round(parseFloat(kofi.amount || "0") * 100));
      txNonce = `kofi_${kofiId}`;
    } else {
      const stripeSig = req.headers.get("stripe-signature") || "";
      const headerSecret = req.headers.get("x-partner-secret") || "";

      let isAuthenticatedWebhook = false;
      if (stripeSig && stripeWebhookSecret) {
        isAuthenticatedWebhook = await verifyStripeSignature(
          rawBody,
          stripeSig,
          stripeWebhookSecret,
        );
      } else if (headerSecret && partnerSharedSecret) {
        isAuthenticatedWebhook = timingSafeEqualString(headerSecret, partnerSharedSecret);
      }

      if (!isAuthenticatedWebhook) {
        return new Response(
          JSON.stringify({ ok: false, error: "Unauthorized webhook request: missing or invalid signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const body = JSON.parse(rawBody);

      if (body.type === "checkout.session.completed" && body.data?.object) {
        const session = body.data.object;
        if (session.payment_status !== "paid") {
          return new Response(
            JSON.stringify({
              ok: true,
              skipped: true,
              reason: `payment_status_${session.payment_status || "unpaid"}`,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const rawRef = String(
          session.client_reference_id ||
            session.metadata?.sanctuary_user_id ||
            "",
        );
        if (rawRef.includes("__")) {
          const [parsedTarget, parsedUid] = rawRef.split("__");
          if (parsedTarget) targetId = parsedTarget.trim().toLowerCase();
          userId = (parsedUid || "").trim();
        } else {
          userId = rawRef.trim();
        }
        if (session.metadata?.sanctuary_target_id) {
          targetId = String(session.metadata.sanctuary_target_id)
            .trim()
            .toLowerCase();
        }
        email =
          session.customer_details?.email || session.customer_email || "";

        // Strictly credit only the actual paid amount (`session.amount_total`), never pre-discount subtotals or $0 coupons
        amountCents = Math.max(0, Math.floor(Number(session.amount_total || 0)));
        const sessionId = String(session.id || session.payment_intent || "").trim();
        txNonce = sessionId ? `stripe_${sessionId}` : "";
      } else if (
        (body.type === "payment_intent.succeeded" ||
          body.type === "charge.succeeded") &&
        body.data?.object
      ) {
        const obj = body.data.object;
        userId =
          obj.metadata?.sanctuary_user_id ||
          obj.metadata?.client_reference_id ||
          "";
        email =
          obj.receipt_email ||
          obj.billing_details?.email ||
          obj.metadata?.email ||
          "";
        amountCents = Math.max(
          0,
          Math.floor(Number(obj.amount_received ?? obj.amount ?? 0)),
        );
        const objId = String(obj.id || "").trim();
        txNonce = objId ? `stripe_${objId}` : "";
      } else {
        userId = String(body.user_id || body.client_reference_id || "").trim();
        email = String(body.email || "").trim();
        amountCents = Math.max(
          0,
          Math.floor(
            Number(body.amount_cents || 0) ||
              Math.round(Number(body.amount_usd || 0) * 100),
          ),
        );
        txNonce = String(body.tx_nonce || body.transaction_id || "").trim();
      }
    }

    if (amountCents <= 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "zero_amount_paid",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!txNonce) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing verified transaction identifier",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!userId && email) {
      const { data: userLookup } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (userLookup?.id) {
        userId = userLookup.id;
      }
    }

    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const normTarget =
      (targetId || "keepers_core")
        .replace(/[^a-z0-9_-]/gi, "")
        .toLowerCase() || "keepers_core";

    const estTxFeeCents = txNonce.startsWith("stripe_")
      ? Math.round(amountCents * 0.029) + 30
      : 0;

    let ledgerResult: any = null;
    try {
      const { data: ledgerData } = await supabase.rpc(
        "record_monthly_donation_ledger",
        {
          p_month_key: monthKey,
          p_target_id: normTarget,
          p_amount_cents: amountCents,
          p_fee_cents: estTxFeeCents,
          p_tx_nonce: txNonce,
        },
      );
      ledgerResult = ledgerData;
    } catch {
      // Non-fatal if ledger RPC is unavailable
    }

    let rpcResult: any = null;
    if (userId) {
      const { data, error } = await supabase.rpc(
        "register_partner_donation_event",
        {
          p_user_id: userId,
          p_amount_cents: amountCents,
          p_tx_nonce: txNonce,
        },
      );
      if (error) {
        throw error;
      }
      rpcResult = data;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        target_id: normTarget,
        month_key: monthKey,
        amount_cents: amountCents,
        ledger: ledgerResult,
        result: rpcResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
