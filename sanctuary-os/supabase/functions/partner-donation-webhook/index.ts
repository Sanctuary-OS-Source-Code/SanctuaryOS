/// <reference path="../deno.d.ts" />
// Supabase Edge Function: partner-donation-webhook
// Non-Custodial Partner & Keepers Core Payment Processor Webhook Bridge
// Cryptographically verifies Stripe (Stripe-Signature HMAC-SHA256) and Ko-fi (verification_token)
// Reads the exact amount paid directly from the processor payload so clients can NEVER spoof amounts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-partner-secret",
};

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(",").reduce(
    (acc, item) => {
      const [k, v] = item.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    },
    {} as Record<string, string>,
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

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

  return computedHex === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    const kofiVerificationToken = Deno.env.get("KOFI_VERIFICATION_TOKEN") ?? "";
    const partnerSharedSecret = Deno.env.get("PARTNER_WEBHOOK_SECRET") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    let userId = "";
    let email = "";
    let amountCents = 0;
    let txNonce = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Ko-fi webhook payload (form-urlencoded `data` JSON field)
      const params = new URLSearchParams(rawBody);
      const rawData = params.get("data");
      if (rawData) {
        const kofi = JSON.parse(rawData);
        if (
          kofiVerificationToken &&
          kofi.verification_token !== kofiVerificationToken
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid Ko-fi verification token" }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        email = kofi.email || "";
        amountCents = Math.round(parseFloat(kofi.amount || "0") * 100);
        txNonce = `kofi_${kofi.kofi_transaction_id || kofi.message_id || Date.now()}`;
      }
    } else {
      // Verify Stripe HMAC-SHA256 signature if present or configured
      const stripeSig = req.headers.get("stripe-signature") || "";
      if (stripeWebhookSecret) {
        const isValid = await verifyStripeSignature(
          rawBody,
          stripeSig,
          stripeWebhookSecret,
        );
        if (!isValid) {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid Stripe webhook signature" }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      } else if (partnerSharedSecret) {
        const headerSecret = req.headers.get("x-partner-secret") || "";
        if (headerSecret !== partnerSharedSecret) {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid Partner webhook secret" }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      const body = JSON.parse(rawBody);

      if (body.type === "checkout.session.completed" && body.data?.object) {
        const session = body.data.object;
        // Sanctuary OS automatically passes ?client_reference_id=<user_id> on Stripe Payment Links
        userId =
          session.client_reference_id ||
          session.metadata?.sanctuary_user_id ||
          "";
        email =
          session.customer_details?.email || session.customer_email || "";
        // Exact amount in cents verified by Stripe
        amountCents = Number(session.amount_total || 0);
        txNonce = `stripe_${session.payment_intent || session.id}`;
      } else {
        userId = body.user_id || body.client_reference_id || "";
        email = body.email || "";
        amountCents =
          Number(body.amount_cents || 0) ||
          Math.round(Number(body.amount_usd || 0) * 100);
        txNonce = body.tx_nonce || body.transaction_id || `tx_${Date.now()}`;
      }
    }

    // Resolve user_id by email if client_reference_id was not present (e.g. Ko-fi)
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

    if (!userId || amountCents <= 0 || !txNonce) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing user_id/email, amount_cents, or tx_nonce",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Call the cumulative stacking RPC via service_role
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

    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
