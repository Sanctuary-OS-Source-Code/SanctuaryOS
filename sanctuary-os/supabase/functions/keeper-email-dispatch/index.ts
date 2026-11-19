/// <reference path="../deno.d.ts" />
// Supabase Edge Function: keeper-email-dispatch
// Official In-App Outbound Email Dispatcher & Glass Asset Host for Keepers Core
// Enforces authenticated Keeper/Core-Dev/Admin authorization and server-side secret isolation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LIVE_ASSET_BYTE_CACHE = new Map<string, ArrayBuffer>();

function decodeBase64Bytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return buf;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    bin += String.fromCharCode(...chunk);
  }
  return btoa(bin);
}

const STATIC_ALLOWED_ORIGINS = new Set([
  "https://sanctuaryos.net",
  "https://www.sanctuaryos.net",
  "https://app.sanctuaryos.net",
  "https://sanctuaryos.gg",
  "https://www.sanctuaryos.gg",
  "https://app.sanctuaryos.gg",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

function isAllowedCorsOrigin(origin: string): boolean {
  const clean = String(origin || "").trim().replace(/\/+$/, "");
  if (!clean) return false;
  if (STATIC_ALLOWED_ORIGINS.has(clean)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) return true;
  const extraRaw = String(Deno.env.get("ALLOWED_ORIGINS") || "");
  if (extraRaw) {
    for (const entry of extraRaw.split(",")) {
      const normalized = entry.trim().replace(/\/+$/, "");
      if (normalized && normalized === clean) return true;
    }
  }
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const reqOrigin = req.headers.get("origin") || "";
  const allowOrigin = isAllowedCorsOrigin(reqOrigin)
    ? reqOrigin
    : "https://sanctuaryos.net";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function sanitizeHeaderLine(raw: unknown, maxLen = 200): string {
  return String(raw || "")
    .replace(/[\r\n\0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

const ALLOWED_DISPATCH_ROLES = new Set(["keeper", "admin", "core_dev"]);

function parseVaultMasterKeyBytes(raw: string) {
  const clean = String(raw || "").trim();
  if (!clean) return null;
  if (/^[0-9a-f]{64}$/i.test(clean)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const b64 = clean.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const pad = (4 - (b64.length % 4)) % 4;
  try {
    const bin = atob(b64 + "=".repeat(pad));
    if (bin.length !== 32) return null;
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToB64UrlEmail(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytesEmail(input: string) {
  const clean = (input || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const pad = (4 - (clean.length % 4)) % 4;
  const bin = atob(clean + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sealRuntimeSecretWithMaster(keyName: string, plaintext: string): Promise<string> {
  const clean = String(plaintext || "").trim();
  if (!clean) return "";
  const masterBytes = parseVaultMasterKeyBytes(Deno.env.get("SPOKE_VAULT_MASTER_KEY") || "");
  if (!masterBytes) return clean;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ikm = await crypto.subtle.importKey("raw", masterBytes, "HKDF", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(`sanctuary-runtime-vault:v1:${keyName}`),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const aad = new TextEncoder().encode(`sanctuary-runtime-aad:v1|${keyName}`);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    aesKey,
    new TextEncoder().encode(clean)
  );
  return `enc:v1:master:${bytesToB64UrlEmail(salt)}:${bytesToB64UrlEmail(iv)}:${bytesToB64UrlEmail(new Uint8Array(ctBuf))}`;
}

async function openRuntimeSecretWithMaster(keyName: string, stored: string): Promise<string> {
  const clean = String(stored || "").trim();
  if (!clean) return "";
  if (!clean.startsWith("enc:v1:")) return clean;
  const parts = clean.split(":");
  if (parts.length !== 6) throw new Error("Malformed encrypted runtime secret envelope");
  const [, , kid, saltB64, ivB64, ctB64] = parts;
  const candidates: Array<{ kid: string; key: NonNullable<ReturnType<typeof parseVaultMasterKeyBytes>> }> = [];
  const primary = parseVaultMasterKeyBytes(Deno.env.get("SPOKE_VAULT_MASTER_KEY") || "");
  if (primary) candidates.push({ kid: "master", key: primary });
  const prevRaw = String(Deno.env.get("SPOKE_VAULT_PREVIOUS_KEYS") || "").trim();
  if (prevRaw) {
    for (const [idx, item] of prevRaw.split(",").map((s) => s.trim()).filter(Boolean).entries()) {
      const colonIdx = item.indexOf(":");
      const itemKid = colonIdx > 0 ? item.slice(0, colonIdx).trim() : `prev_${idx + 1}`;
      const itemSecret = colonIdx > 0 ? item.slice(colonIdx + 1).trim() : item;
      const parsed = parseVaultMasterKeyBytes(itemSecret);
      if (parsed) candidates.push({ kid: itemKid, key: parsed });
    }
  }
  const ordered = [
    ...candidates.filter((c) => c.kid === kid),
    ...candidates.filter((c) => c.kid !== kid),
  ];
  const salt = b64UrlToBytesEmail(saltB64);
  const iv = b64UrlToBytesEmail(ivB64);
  const ct = b64UrlToBytesEmail(ctB64);
  const aad = new TextEncoder().encode(`sanctuary-runtime-aad:v1|${keyName}`);
  for (const c of ordered) {
    try {
      const ikm = await crypto.subtle.importKey("raw", c.key, "HKDF", false, ["deriveKey"]);
      const aesKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt,
          info: new TextEncoder().encode(`sanctuary-runtime-vault:v1:${keyName}`),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      const ptBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        aesKey,
        ct
      );
      return new TextDecoder().decode(ptBuf);
    } catch {
      // try next key
    }
  }
  throw new Error("Unable to decrypt runtime secret with configured master keys");
}

async function deriveThreadAesKey(salt: Uint8Array): Promise<CryptoKey> {
  const master = parseVaultMasterKeyBytes(Deno.env.get("SPOKE_VAULT_MASTER_KEY") || "");
  const fallbackRaw = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "sanctuary-foundry-fallback";
  const ikmBytes = master || new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fallbackRaw)));
  const ikm = await crypto.subtle.importKey("raw", ikmBytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: new TextEncoder().encode("sanctuary-email-thread:v1"),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface ThreadAttachmentMeta {
  id?: string;
  filename: string;
  content_type: string;
  size?: number;
  content_id?: string | null;
  is_inline?: boolean;
  download_url?: string | null;
  expires_at?: string | null;
  data_url?: string | null;
}

async function sealThreadEnvelope(
  payload: { external_email: string; body_text: string; attachments?: ThreadAttachmentMeta[] },
  threadId: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveThreadAesKey(salt);
  const aad = new TextEncoder().encode(`thread:${threadId}`);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return `enc:t1:${bytesToB64UrlEmail(salt)}:${bytesToB64UrlEmail(iv)}:${bytesToB64UrlEmail(new Uint8Array(ctBuf))}`;
}

async function openThreadEnvelope(
  sealed: string | null | undefined,
  threadId: string
): Promise<{ external_email: string; body_text: string; attachments?: ThreadAttachmentMeta[] } | null> {
  const clean = String(sealed || "").trim();
  if (!clean.startsWith("enc:t1:")) return null;
  const parts = clean.split(":");
  if (parts.length !== 5) return null;
  try {
    const [, , saltB64, ivB64, ctB64] = parts;
    const salt = b64UrlToBytesEmail(saltB64);
    const iv = b64UrlToBytesEmail(ivB64);
    const ct = b64UrlToBytesEmail(ctB64);
    const key = await deriveThreadAesKey(salt);
    const aad = new TextEncoder().encode(`thread:${threadId}`);
    const ptBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      ct
    );
    const parsed = JSON.parse(new TextDecoder().decode(ptBuf));
    return {
      external_email: String(parsed?.external_email || ""),
      body_text: String(parsed?.body_text || ""),
      attachments: Array.isArray(parsed?.attachments) ? parsed.attachments : [],
    };
  } catch {
    return null;
  }
}

async function computeRecipientHash(email: string): Promise<string> {
  const normalized = String(email || "").trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractEmailAddress(raw: unknown): { email: string; name: string } {
  const text = String(raw || "").trim();
  const bracketMatch = text.match(/^(.*?)<\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*>$/i);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].replace(/["']/g, "").trim(),
      email: bracketMatch[2].trim().toLowerCase(),
    };
  }
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    name: "",
    email: emailMatch ? emailMatch[0].trim().toLowerCase() : "",
  };
}

function normalizeEmailThreadSubject(rawSubject: string): string {
  let clean = String(rawSubject || "").trim().toLowerCase();
  let prev = "";
  while (clean !== prev) {
    prev = clean;
    clean = clean
      .replace(/^(?:re|fwd|fw)\s*:\s*/i, "")
      .replace(/^\[[^\]]+\]\s*/i, "")
      .trim();
  }
  return clean.replace(/\s+/g, " ").trim();
}

function stripQuotedEmailReply(rawText: string): string {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n");
  const kept: string[] = [];
  let hitQuoteBoundary = false;
  for (const line of lines) {
    const tLine = line.trim();
    if (
      /^On .+wrote:\s*$/i.test(tLine) ||
      /^-{3,}\s*Original Message\s*-{3,}/i.test(tLine) ||
      /^_{12,}$/.test(tLine) ||
      /^From:\s.+@/i.test(tLine) ||
      /^>/.test(tLine)
    ) {
      hitQuoteBoundary = true;
      break;
    }
    kept.push(line);
  }
  const cleaned = kept.join("\n").trim();
  return hitQuoteBoundary ? cleaned : cleaned || normalized;
}

function extractInlineDataImagesFromHtml(html: string): ThreadAttachmentMeta[] {
  const rawHtml = String(html || "");
  if (!rawHtml.includes("data:image/")) return [];
  const results: ThreadAttachmentMeta[] = [];
  const imgRegex = /<img\b[^>]*src=["'](data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+))["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let idx = 1;
  while ((m = imgRegex.exec(rawHtml)) !== null && results.length < 4) {
    const contentType = String(m[2] || "image/png").toLowerCase();
    const b64Clean = String(m[3] || "").replace(/\s+/g, "");
    if (!b64Clean || b64Clean.length > 240_000) continue;
    const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "png";
    results.push({
      id: `inline_img_${idx}`,
      filename: `screenshot-${idx}.${ext}`,
      content_type: contentType,
      size: Math.floor((b64Clean.length * 3) / 4),
      is_inline: true,
      data_url: `data:${contentType};base64,${b64Clean}`,
    });
    idx += 1;
  }
  return results;
}

async function fetchResendReceivedAttachments(
  apiKey: string,
  emailId: string
): Promise<ThreadAttachmentMeta[]> {
  const cleanKey = String(apiKey || "").trim();
  const cleanId = String(emailId || "").trim();
  if (!cleanKey || !cleanId) return [];
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(cleanId)}/attachments`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanKey}` },
      }
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list
      .filter((att: any) => att && (att.filename || att.download_url || att.content_type))
      .slice(0, 10)
      .map((att: any) => ({
        id: att.id ? String(att.id) : undefined,
        filename: String(att.filename || "attachment"),
        content_type: String(att.content_type || "application/octet-stream"),
        size: typeof att.size === "number" ? att.size : undefined,
        content_id: att.content_id ? String(att.content_id) : null,
        is_inline: Boolean(att.content_id),
        download_url: att.download_url ? String(att.download_url) : null,
        expires_at: att.expires_at ? String(att.expires_at) : null,
      }));
  } catch {
    return [];
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyInboundWebhookSignature(
  req: Request,
  rawBody: string,
  configuredSecret: string
): Promise<boolean> {
  const cleanSecret = String(configuredSecret || "").trim();
  if (!cleanSecret) return false;

  const directHeader = sanitizeHeaderLine(req.headers.get("x-sanctuary-inbound-secret"), 256);
  if (directHeader && timingSafeEqualStr(directHeader, cleanSecret)) {
    return true;
  }

  const svixId = sanitizeHeaderLine(req.headers.get("svix-id") || req.headers.get("webhook-id"), 128);
  const svixTs = sanitizeHeaderLine(req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp"), 64);
  const svixSig = String(req.headers.get("svix-signature") || req.headers.get("webhook-signature") || "").trim();
  if (!svixId || !svixTs || !svixSig) return false;

  const tsNum = Number(svixTs);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 600) {
    return false;
  }

  try {
    const keyB64 = cleanSecret.startsWith("whsec_") ? cleanSecret.slice(6) : cleanSecret;
    const keyBin = atob(keyB64);
    const keyBytes = new Uint8Array(keyBin.length);
    for (let i = 0; i < keyBin.length; i++) keyBytes[i] = keyBin.charCodeAt(i);
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signedPayload = `${svixId}.${svixTs}.${rawBody}`;
    const sigBuf = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(signedPayload));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    for (const part of svixSig.split(/\s+/)) {
      const [ver, sigVal] = part.split(",");
      if (ver === "v1" && sigVal && timingSafeEqualStr(sigVal, expectedB64)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

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
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== "443") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return false;
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^0\./.test(host) ||
      /^10\./.test(host) ||
      /^127\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      /^198\.1[89]\./.test(host) ||
      /^f[cd][0-9a-f]{0,2}:/i.test(host) ||
      /^fe[89ab][0-9a-f]:/i.test(host) ||
      /^::ffff:/i.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const LIVE_EMAIL_ASSET_BASE = (
  Deno.env.get("PUBLIC_EMAIL_ASSET_BASE_URL") ||
  `${(Deno.env.get("SUPABASE_URL") || "https://tpsbtaqxlczrysqqmanp.supabase.co").replace(/\/+$/, "")}/functions/v1/keeper-email-dispatch/assets`
).replace(/\/+$/, "");
const SANCTUARY_LOGO_URL = `${LIVE_EMAIL_ASSET_BASE}/sanctuary-logo.png?v=2`;

function maskEmailAddress(raw: string): string {
  const clean = String(raw || "").trim();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return clean;
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  if (!domain) return clean;
  const maskedLocal = `${local.slice(0, 1)}•••`;
  const dotIdx = domain.indexOf(".");
  const maskedDomain =
    dotIdx > 0
      ? `${domain.slice(0, 1)}•••.${domain.slice(dotIdx + 1)}`
      : `${domain.slice(0, 1)}•••`;
  return `${maskedLocal}@${maskedDomain}`;
}

interface EmailMetaTile {
  label: string;
  value: string;
}

function sanitizeCtaHref(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return escapeHtml(trimmed);
    }
  } catch {
    // ignore invalid URL
  }
  return "";
}

function renderBodyParagraphsHtml(bodyText: string): string {
  const blocks = String(bodyText || "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return `<p class="sanctuary-body" style="margin:0;color:#dce7f7;font-size:14px;line-height:1.68;">&nbsp;</p>`;
  }

  return blocks
    .map((block, idx) => {
      const margin = idx === blocks.length - 1 ? "0" : "0 0 12px 0";
      const safeLines = escapeHtml(block).replace(/\r?\n/g, "<br/>");
      return `<p class="sanctuary-body" style="margin:${margin};color:#dce7f7;font-size:14px;line-height:1.68;">${safeLines}</p>`;
    })
    .join("");
}

function renderMetadataChipsHtml(
  tiles: EmailMetaTile[],
  glassChipFillUrl: string
): string {
  const validTiles = tiles.filter(
    (tile) => tile && String(tile.label || "").trim() && String(tile.value || "").trim()
  );
  if (validTiles.length === 0) return "";

  const chips = validTiles
    .map(
      (tile) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:8px;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border:1px solid rgba(248,250,252,0.13);font-size:11px;line-height:1.3;color:#f8fafc;"><span class="sanctuary-label" style="color:#94adc9;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-right:5px;">${escapeHtml(tile.label)}:</span><span class="sanctuary-title" style="color:#ffffff;font-weight:800;">${escapeHtml(tile.value)}</span></span>`
    )
    .join("");

  return `<div style="margin-top:16px;font-size:0;line-height:0;">${chips}</div>`;
}

function normalizeDefaultSenderName(raw: unknown, fallback = "Sanctuary OS"): string {
  const clean = sanitizeHeaderLine(raw, 120);
  if (!clean || /^(sanctuary\s+os\s+keepers\s+core|keepers\s+core)$/i.test(clean)) {
    return fallback;
  }
  return clean;
}

function buildSanctuaryEmailHtml(params: {
  fromName: string;
  subject: string;
  bodyText: string;
  ticketId?: string | null;
  badgeLabel?: string;
  headerSubtitle?: string;
  metaTiles?: EmailMetaTile[];
  ctaLabel?: string;
  ctaUrl?: string;
  showPrimaryCtaButton?: boolean;
  footerNote?: string;
}): string {
  const cardSurfaceUrl = `${LIVE_EMAIL_ASSET_BASE}/email-card-surface.png?v=2`;
  const glassIconTileUrl = `${LIVE_EMAIL_ASSET_BASE}/glass-icon-tile.png?v=2`;
  const badgeIconUrl = `${LIVE_EMAIL_ASSET_BASE}/icon-badge-shield.png?v=2`;
  const glassChipFillUrl = `${LIVE_EMAIL_ASSET_BASE}/glass-chip-fill.png?v=2`;
  const glassBtnFillUrl = `${LIVE_EMAIL_ASSET_BASE}/glass-btn-fill.png?v=2`;

  const safeFromName = escapeHtml(normalizeDefaultSenderName(params.fromName, "Sanctuary OS"));
  const safeHeaderSubtitle = escapeHtml(
    normalizeDefaultSenderName(params.headerSubtitle, "Sanctuary Foundry")
  );
  const safeSubject = escapeHtml(params.subject);
  const safeFooterBrand = escapeHtml(params.footerNote || "Sanctuary Foundry");
  const badgeText = params.ticketId
    ? `Ticket #${escapeHtml(params.ticketId.slice(0, 8).toUpperCase())}`
    : escapeHtml(params.badgeLabel || "Official");

  const explicitTiles: EmailMetaTile[] = Array.isArray(params.metaTiles)
    ? params.metaTiles
    : [];
  const metaChipsHtml = renderMetadataChipsHtml(explicitTiles, glassChipFillUrl);
  const bodyHtml = renderBodyParagraphsHtml(params.bodyText);
  const safeHref = params.ctaUrl ? sanitizeCtaHref(params.ctaUrl) : "";

  const showPrimaryCta = Boolean(params.showPrimaryCtaButton);
  const ctaSectionHtml =
    showPrimaryCta && params.ctaLabel && safeHref
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;width:auto;border-collapse:separate;">
        <tr>
          <td background="${glassBtnFillUrl}" style="background-color:transparent;background-image:url('${glassBtnFillUrl}');background-repeat:repeat;border-top:1px solid rgba(224,242,254,0.30);border-left:1px solid rgba(224,242,254,0.20);border-right:1px solid rgba(255,255,255,0.10);border-bottom:1px solid rgba(255,255,255,0.12);border-radius:12px;">
            <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 20px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;color:#f8fafc;line-height:1.25;">
              <span class="sanctuary-title" style="color:#f8fafc;">${escapeHtml(params.ctaLabel)}</span><span class="sanctuary-accent" style="color:#38bdf8;margin-left:6px;">&rarr;</span>
            </a>
          </td>
        </tr>
      </table>`
      : "";

  const footerActionHref = showPrimaryCta ? "https://sanctuaryos.net" : (safeHref || "https://sanctuaryos.net");
  const footerActionLabel = showPrimaryCta
    ? "sanctuaryos.net"
    : escapeHtml(params.ctaLabel || "sanctuaryos.net");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${safeSubject}</title>
    <style type="text/css">
      :root { color-scheme: dark; supported-color-schemes: dark; }
      body, table, td, p, a, span, div, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      [data-ogsc] .sanctuary-title { color: #ffffff !important; }
      [data-ogsc] .sanctuary-body { color: #dce7f7 !important; }
      [data-ogsc] .sanctuary-subtext { color: #8fa8c8 !important; }
      [data-ogsc] .sanctuary-label { color: #94adc9 !important; }
      [data-ogsc] .sanctuary-accent { color: #38bdf8 !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:transparent;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:transparent;">
      <tr>
        <td align="center" style="padding:16px 8px;background-color:transparent;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;margin:0 auto;border-collapse:separate;border-top:1px solid rgba(214,241,255,0.28);border-left:1px solid rgba(186,230,253,0.18);border-right:1px solid rgba(255,255,255,0.09);border-bottom:1px solid rgba(255,255,255,0.11);border-radius:20px;overflow:hidden;">
            <tr>
              <td bgcolor="#09152b" background="${cardSurfaceUrl}" style="padding:0;background-color:#09152b;background-image:url('${cardSurfaceUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:20px;">
                <div style="padding:18px 22px;border-bottom:1px solid rgba(226,236,249,0.09);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="left" valign="middle" style="vertical-align:middle;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td valign="middle" style="vertical-align:middle;">
                              <table role="presentation" width="40" height="40" cellspacing="0" cellpadding="0" border="0" style="width:40px;height:40px;border-collapse:separate;background-color:transparent;background-image:url('${glassIconTileUrl}');background-size:100% 100%;background-repeat:no-repeat;border-top:1px solid rgba(224,242,254,0.30);border-left:1px solid rgba(224,242,254,0.18);border-right:1px solid rgba(255,255,255,0.10);border-bottom:1px solid rgba(255,255,255,0.12);border-radius:11px;">
                                <tr>
                                  <td align="center" valign="middle" background="${glassIconTileUrl}" style="padding:0;background-color:transparent;background-image:url('${glassIconTileUrl}');background-size:100% 100%;background-repeat:no-repeat;border-radius:11px;">
                                    <img src="${SANCTUARY_LOGO_URL}" width="26" height="26" alt="Sanctuary OS" style="display:block;width:26px;height:26px;margin:0 auto;border:0;" />
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td valign="middle" style="padding-left:12px;vertical-align:middle;">
                              <div class="sanctuary-title" style="font-size:14px;font-weight:800;color:#ffffff;line-height:1.25;">${safeFromName}</div>
                              <div class="sanctuary-subtext" style="font-size:11px;font-weight:600;color:#8fa8c8;line-height:1.3;margin-top:2px;">${safeHeaderSubtitle}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td align="right" valign="middle" style="vertical-align:middle;white-space:nowrap;">
                        <span style="display:inline-block;padding:5px 10px;border-radius:8px;background-color:transparent;background-image:url('${glassChipFillUrl}');background-repeat:repeat;border:1px solid rgba(248,250,252,0.13);font-size:11px;font-weight:700;letter-spacing:0.02em;text-transform:none;color:#e2ecf9;line-height:1.2;">
                          <img src="${badgeIconUrl}" width="13" height="13" alt="" style="display:inline-block;width:13px;height:13px;vertical-align:-2px;border:0;margin-right:6px;" /><span class="sanctuary-title" style="color:#e2ecf9;">${badgeText}</span>
                        </span>
                      </td>
                    </tr>
                  </table>
                </div>

                <div style="padding:20px 22px 22px 22px;">
                  <h1 class="sanctuary-title" style="margin:0 0 12px 0;font-size:18px;font-weight:800;letter-spacing:-0.015em;line-height:1.35;color:#ffffff;">${safeSubject}</h1>
                  ${bodyHtml}
                  ${metaChipsHtml}
                  ${ctaSectionHtml}
                </div>

                <div style="padding:13px 22px;border-top:1px solid rgba(226,236,249,0.08);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td align="left" valign="middle" class="sanctuary-subtext" style="font-size:11px;font-weight:600;color:#8fa8c8;">
                        ${safeFooterBrand}
                      </td>
                      <td align="right" valign="middle" style="white-space:nowrap;">
                        <a href="${footerActionHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;font-size:11px;font-weight:700;letter-spacing:0;text-transform:none;color:#dce7f7;">
                          <span class="sanctuary-title" style="color:#dce7f7;text-transform:none;">${footerActionLabel}</span><span class="sanctuary-accent" style="color:#38bdf8;margin-left:5px;">&rarr;</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const EMAIL_FORMAT_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const BLIND_ALIAS_REGEX = /@blind\.sanctuaryos\.(net|local)$/i;

function normalizeDefaultSenderEmail(raw: unknown): string {
  const clean = sanitizeHeaderLine(raw, 254);
  if (!clean || clean.toLowerCase() === "support@sanctuaryos.gg") {
    return "support@sanctuaryos.net";
  }
  return EMAIL_FORMAT_REGEX.test(clean) ? clean : "support@sanctuaryos.net";
}

async function resolveMailerContext(adminClient: any, overrides?: {
  from_email?: unknown;
  from_name?: unknown;
  reply_to?: unknown;
}) {
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
      if (rawJson) pipelineCfg = JSON.parse(rawJson);
    }
  } catch {
    // ignore config parse fallback
  }

  const fromEmail = normalizeDefaultSenderEmail(
    overrides?.from_email ||
    pipelineCfg.support_contact_email ||
    Deno.env.get("KEEPER_FROM_EMAIL") ||
    "support@sanctuaryos.net"
  );
  const fromName = normalizeDefaultSenderName(
    overrides?.from_name ||
    pipelineCfg.support_sender_name ||
    Deno.env.get("KEEPER_FROM_NAME"),
    "Sanctuary OS"
  );
  const replyToCandidate = sanitizeHeaderLine(
    overrides?.reply_to || pipelineCfg.support_reply_to_email || fromEmail,
    254
  );
  const replyTo = EMAIL_FORMAT_REGEX.test(replyToCandidate)
    ? normalizeDefaultSenderEmail(replyToCandidate)
    : fromEmail;

  let vaultApiKey = "";
  let vaultWebhookUrl = "";
  let vaultInboundSecret = "";
  try {
    const [{ data: secretKey }, { data: secretWebhook }, { data: secretInbound }] = await Promise.all([
      adminClient.rpc("internal_get_runtime_secret", {
        p_key: "support_email_api_key",
      }),
      adminClient.rpc("internal_get_runtime_secret", {
        p_key: "support_email_webhook_url",
      }),
      adminClient.rpc("internal_get_runtime_secret", {
        p_key: "inbound_webhook_secret",
      }),
    ]);
    if (typeof secretKey === "string") {
      vaultApiKey = (await openRuntimeSecretWithMaster("support_email_api_key", secretKey)).trim();
    }
    if (typeof secretWebhook === "string") vaultWebhookUrl = secretWebhook.trim();
    if (typeof secretInbound === "string") {
      vaultInboundSecret = (await openRuntimeSecretWithMaster("inbound_webhook_secret", secretInbound)).trim();
    }
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
  const inboundWebhookSecret = String(
    Deno.env.get("RESEND_WEBHOOK_SECRET") || vaultInboundSecret || ""
  ).trim();

  return { fromEmail, fromName, replyTo, resendApiKey, webhookUrl, inboundWebhookSecret };
}

async function deliverEmailViaProvider(params: {
  resendApiKey: string;
  webhookUrl: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  toEmail: string;
  bccEmails?: string[];
  subject: string;
  bodyText: string;
  htmlBody: string;
  ticketId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  let dispatchStatus = "DISPATCHED_IN_APP";
  let providerUsed = "SANCTUARY_FOUNDRY_RELAY";
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;

  const extraHeaders: Record<string, string> = {};
  if (params.threadId) extraHeaders["X-Sanctuary-Thread-ID"] = params.threadId;
  if (params.inReplyTo) {
    extraHeaders["In-Reply-To"] = params.inReplyTo;
    extraHeaders["References"] = params.references || params.inReplyTo;
  }

  if (params.resendApiKey) {
    providerUsed = "RESEND";
    try {
      const resendPayload: Record<string, unknown> = {
        from: `${params.fromName} <${params.fromEmail}>`,
        to: [params.toEmail],
        reply_to: params.replyTo,
        subject: params.subject,
        text: params.bodyText,
        html: params.htmlBody,
      };
      if (params.bccEmails && params.bccEmails.length > 0) {
        resendPayload.bcc = params.bccEmails;
      }
      if (Object.keys(extraHeaders).length > 0) {
        resendPayload.headers = extraHeaders;
      }
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
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
  } else if (params.webhookUrl && isSafeHttpsRelayUrl(params.webhookUrl)) {
    providerUsed = "CUSTOM_WEBHOOK";
    try {
      const whRes = await fetch(params.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        body: JSON.stringify({
          from_name: params.fromName,
          from_email: params.fromEmail,
          reply_to: params.replyTo,
          to_email: params.toEmail,
          bcc: params.bccEmails || [],
          subject: params.subject,
          text: params.bodyText,
          html: params.htmlBody,
          ticket_id: params.ticketId || null,
          thread_id: params.threadId || null,
          in_reply_to: params.inReplyTo || null,
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

  return { dispatchStatus, providerUsed, providerMessageId, errorMessage };
}

interface InboundSyncSummary {
  status: "ok" | "empty_inbox" | "send_only_api_key" | "no_api_key" | "error";
  synced_count: number;
  total_remote: number;
  detail?: string;
}

let lastInboundSyncAtMs = 0;

async function ingestInboundEmailRecord(
  adminClient: any,
  ctx: Awaited<ReturnType<typeof resolveMailerContext>>,
  evtData: Record<string, any>,
  options?: { isResend?: boolean; attachments?: ThreadAttachmentMeta[] }
): Promise<{
  ok: boolean;
  ignored?: boolean;
  already_ingested?: boolean;
  reason?: string;
  thread_id?: string;
  ticket_id?: string | null;
  dispatch_id?: string | null;
}> {
  const headersMap = evtData.headers && typeof evtData.headers === "object" ? evtData.headers : {};
  const incomingMsgId = sanitizeHeaderLine(
    evtData.id || evtData.email_id || evtData.message_id || headersMap["message-id"] || "",
    256
  );

  if (incomingMsgId) {
    const { data: existingRow } = await adminClient
      .from("keeper_email_dispatches")
      .select("id, thread_id, ticket_id")
      .eq("provider_message_id", incomingMsgId)
      .limit(1)
      .maybeSingle();
    if (existingRow?.id) {
      return {
        ok: true,
        already_ingested: true,
        dispatch_id: existingRow.id,
        thread_id: existingRow.thread_id || existingRow.ticket_id || existingRow.id,
        ticket_id: existingRow.ticket_id || null,
      };
    }
  }

  const senderParsed = extractEmailAddress(evtData.from);
  const toRaw = Array.isArray(evtData.to) ? evtData.to[0] : evtData.to;
  const toParsed = extractEmailAddress(toRaw);
  const senderEmail = senderParsed.email;

  if (!senderEmail) {
    return { ok: true, ignored: true, reason: "Missing sender email" };
  }
  const ownSenders = new Set(
    [ctx.fromEmail, ctx.replyTo, "noreply@sanctuaryos.net", "support@sanctuaryos.net"]
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (ownSenders.has(senderEmail.toLowerCase())) {
    return { ok: true, ignored: true, reason: "Ignored self-sent outbound copy" };
  }

  const rawSubject = sanitizeHeaderLine(evtData.subject || "Reply", 240);
  const rawHtml = String(evtData.html || "");
  const htmlAsText = rawHtml
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const rawTextBody = String(evtData.text || evtData.plain || htmlAsText || "").trim();
  const cleanReplyText = stripQuotedEmailReply(rawTextBody);

  const providedAttachments = Array.isArray(options?.attachments) ? options!.attachments! : [];
  const inlineHtmlAttachments = providedAttachments.length === 0 ? extractInlineDataImagesFromHtml(rawHtml) : [];
  const attachments = providedAttachments.length > 0 ? providedAttachments : inlineHtmlAttachments;

  if (!cleanReplyText && attachments.length === 0) {
    return { ok: true, ignored: true, reason: "Missing sender reply body or attachments" };
  }

  const headerThreadId = sanitizeHeaderLine(
    headersMap["x-sanctuary-thread-id"] || headersMap["X-Sanctuary-Thread-ID"] || "",
    64
  );
  const inReplyTo = sanitizeHeaderLine(
    evtData.in_reply_to || headersMap["in-reply-to"] || headersMap["In-Reply-To"] || "",
    256
  );
  const referencesHeader = sanitizeHeaderLine(
    headersMap["references"] || headersMap["References"] || "",
    512
  );

  let matchedThreadId: string | null =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerThreadId)
      ? headerThreadId
      : null;
  let matchedTicketId: string | null = null;

  if (!matchedThreadId && toParsed.email.includes("+")) {
    const plusTag = toParsed.email.split("+")[1]?.split("@")[0] || "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plusTag)) {
      matchedThreadId = plusTag;
    }
  }

  const refCandidates = [inReplyTo, ...referencesHeader.split(/\s+/)]
    .map((tok) => tok.trim())
    .filter(Boolean);
  if (!matchedThreadId && refCandidates.length > 0) {
    for (const refTok of refCandidates) {
      const bareId = refTok.replace(/^<|>$/g, "").split("@")[0];
      if (!bareId) continue;
      const { data: refRow } = await adminClient
        .from("keeper_email_dispatches")
        .select("id, thread_id, ticket_id")
        .or(`provider_message_id.eq.${refTok},provider_message_id.eq.${bareId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (refRow) {
        matchedThreadId = refRow.thread_id || refRow.ticket_id || refRow.id;
        matchedTicketId = refRow.ticket_id || null;
        break;
      }
    }
  }

  if (!matchedThreadId) {
    const shortMatch = rawSubject.match(/#([0-9A-F]{8})\b/i);
    if (shortMatch) {
      const prefixLower = shortMatch[1].toLowerCase();
      const { data: ticketRows } = await adminClient
        .from("keeper_tickets")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(80);
      const hitTicket = (ticketRows || []).find((row: any) =>
        String(row?.id || "").toLowerCase().startsWith(prefixLower)
      );
      if (hitTicket?.id) {
        matchedTicketId = hitTicket.id;
        matchedThreadId = hitTicket.id;
      }
    }
  }

  const recipientHash = await computeRecipientHash(senderEmail);
  const normalizedIncomingSubj = normalizeEmailThreadSubject(rawSubject);
  if (!matchedThreadId) {
    const { data: hashRows } = await adminClient
      .from("keeper_email_dispatches")
      .select("id, thread_id, ticket_id, subject, created_at")
      .eq("recipient_hash", recipientHash)
      .order("created_at", { ascending: false })
      .limit(20);
    if (Array.isArray(hashRows) && hashRows.length > 0) {
      const exactSubjMatch = normalizedIncomingSubj
        ? hashRows.find(
            (r: any) => normalizeEmailThreadSubject(String(r?.subject || "")) === normalizedIncomingSubj
          )
        : null;
      const chosen = exactSubjMatch || hashRows[0];
      matchedThreadId = chosen.thread_id || chosen.ticket_id || chosen.id;
      matchedTicketId = chosen.ticket_id || null;
    }
  }

  const finalThreadId = matchedThreadId || crypto.randomUUID();
  const maskedSender = maskEmailAddress(senderEmail);
  const maskedRecipient = maskEmailAddress(toParsed.email || ctx.fromEmail);
  const effectiveBodyText =
    cleanReplyText ||
    (attachments.length > 0 ? `[Attached ${attachments.length} file(s)]` : "");

  const sealedEnvelope = await sealThreadEnvelope(
    {
      external_email: senderEmail,
      body_text: cleanReplyText,
      attachments: attachments.length > 0 ? attachments : undefined,
    },
    finalThreadId
  );

  const remoteCreatedIso =
    typeof evtData.created_at === "string" && Number.isFinite(Date.parse(evtData.created_at))
      ? new Date(evtData.created_at).toISOString()
      : new Date().toISOString();

  const insertPayload: Record<string, any> = {
    ticket_id: matchedTicketId,
    thread_id: finalThreadId,
    direction: "inbound",
    in_reply_to: inReplyTo || null,
    recipient_hash: recipientHash,
    sealed_envelope: sealedEnvelope,
    sender_user_id: null,
    from_name: senderParsed.name || maskedSender,
    from_email: maskedSender,
    reply_to: maskedSender,
    to_email: maskedRecipient,
    subject: rawSubject,
    body_text: "[Inbound Reply Sealed]",
    body_html: null,
    provider: options?.isResend ? "RESEND" : "INBOUND_WEBHOOK",
    provider_message_id: incomingMsgId || `inbound_${crypto.randomUUID().slice(0, 12)}`,
    status: "RECEIVED",
    error_message: null,
    created_at: remoteCreatedIso,
  };

  const { data: inboundRow } = await adminClient
    .from("keeper_email_dispatches")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (matchedTicketId) {
    try {
      const { data: existingTicket } = await adminClient
        .from("keeper_tickets")
        .select("metadata")
        .eq("id", matchedTicketId)
        .maybeSingle();
      if (existingTicket) {
        const prevMeta = existingTicket.metadata || {};
        const prevReplies = Array.isArray(prevMeta.replies) ? prevMeta.replies : [];
        const prevDispatches = Array.isArray(prevMeta.email_dispatches)
          ? prevMeta.email_dispatches
          : [];
        await adminClient
          .from("keeper_tickets")
          .update({
            metadata: {
              ...prevMeta,
              replies: [
                ...prevReplies,
                {
                  id: inboundRow?.id || crypto.randomUUID(),
                  author: `${senderParsed.name || maskedSender} (Email Reply)`,
                  text: effectiveBodyText,
                  time: remoteCreatedIso,
                  via: "email_inbound",
                  thread_id: finalThreadId,
                },
              ],
              email_dispatches: [
                ...prevDispatches,
                {
                  id: inboundRow?.id || crypto.randomUUID(),
                  thread_id: finalThreadId,
                  direction: "inbound",
                  from_name: senderParsed.name || maskedSender,
                  to_email: maskedRecipient,
                  subject: rawSubject,
                  status: "RECEIVED",
                  provider: options?.isResend ? "RESEND" : "INBOUND_WEBHOOK",
                  sent_at: remoteCreatedIso,
                },
              ],
            },
          })
          .eq("id", matchedTicketId);
      }
    } catch {
      // non-fatal ticket thread sync
    }
  }

  return {
    ok: true,
    thread_id: finalThreadId,
    ticket_id: matchedTicketId,
    dispatch_id: inboundRow?.id || null,
  };
}

async function syncRecentResendInboundEmails(
  adminClient: any,
  ctx: Awaited<ReturnType<typeof resolveMailerContext>>,
  options?: { force?: boolean }
): Promise<InboundSyncSummary> {
  if (!ctx.resendApiKey) {
    return { status: "no_api_key", synced_count: 0, total_remote: 0 };
  }
  const nowMs = Date.now();
  if (!options?.force && nowMs - lastInboundSyncAtMs < 8000) {
    return { status: "ok", synced_count: 0, total_remote: 0 };
  }
  lastInboundSyncAtMs = nowMs;

  try {
    const listRes = await fetch("https://api.resend.com/emails/receiving?limit=25", {
      method: "GET",
      headers: { Authorization: `Bearer ${ctx.resendApiKey}` },
    });
    const listJson = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      const errName = String(listJson?.name || "").toLowerCase();
      const errMsg = String(listJson?.message || listJson?.error || `HTTP ${listRes.status}`);
      if (
        listRes.status === 401 ||
        listRes.status === 403 ||
        errName === "restricted_api_key" ||
        /only has permission to send|restricted/i.test(errMsg)
      ) {
        return {
          status: "send_only_api_key",
          synced_count: 0,
          total_remote: 0,
          detail:
            "Saved Resend API key only has Sending Access. Generate a Full Access API key in Resend and enable Domain Receiving (MX) on sanctuaryos.net to sync replies.",
        };
      }
      return { status: "error", synced_count: 0, total_remote: 0, detail: errMsg };
    }

    const items = Array.isArray(listJson?.data) ? listJson.data : [];
    if (items.length === 0) {
      return { status: "empty_inbox", synced_count: 0, total_remote: 0 };
    }

    const remoteIds = items.map((it: any) => String(it?.id || "").trim()).filter(Boolean);
    const { data: existingRows } = await adminClient
      .from("keeper_email_dispatches")
      .select("provider_message_id")
      .in("provider_message_id", remoteIds);
    const existingSet = new Set(
      (existingRows || []).map((r: any) => String(r?.provider_message_id || "").trim()).filter(Boolean)
    );

    const pendingItems = [...items]
      .filter((it: any) => it?.id && !existingSet.has(String(it.id).trim()))
      .reverse();

    let syncedCount = 0;
    for (const item of pendingItems) {
      const emailId = String(item.id).trim();
      let detailData: Record<string, any> = { ...item };
      try {
        const detailRes = await fetch(
          `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${ctx.resendApiKey}` },
          }
        );
        if (detailRes.ok) {
          const detailJson = await detailRes.json().catch(() => ({}));
          detailData = { ...detailData, ...detailJson };
        }
      } catch {
        // Fall back to list metadata
      }
      const attachments = await fetchResendReceivedAttachments(ctx.resendApiKey, emailId);
      const ing = await ingestInboundEmailRecord(adminClient, ctx, detailData, {
        isResend: true,
        attachments,
      });
      if (ing.ok && !ing.ignored && !ing.already_ingested) {
        syncedCount += 1;
      }
    }

    return {
      status: "ok",
      synced_count: syncedCount,
      total_remote: items.length,
    };
  } catch (err: any) {
    return {
      status: "error",
      synced_count: 0,
      total_remote: 0,
      detail: err?.message || "Failed to query Resend Receiving API",
    };
  }
}

async function handleInboundEmailWebhook(
  req: Request,
  adminClient: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const ctx = await resolveMailerContext(adminClient);
  const rawBody = await req.text();
  const payload = JSON.parse(rawBody || "{}");
  const isResendEvent = payload?.type === "email.received";
  let evtData: Record<string, any> = isResendEvent ? payload?.data || {} : payload || {};

  if (ctx.inboundWebhookSecret) {
    const isVerified = await verifyInboundWebhookSignature(req, rawBody, ctx.inboundWebhookSecret);
    if (!isVerified) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid inbound webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } else if (isResendEvent && evtData?.email_id && ctx.resendApiKey) {
    // Authenticate without webhook secret by querying Resend's authenticated Receiving API directly
    const rxRes = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(String(evtData.email_id))}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${ctx.resendApiKey}` },
      }
    );
    if (!rxRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unable to verify inbound Resend email via API" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const rxJson = await rxRes.json().catch(() => ({}));
    evtData = { ...rxJson, email_id: String(evtData.email_id) };
  } else {
    return new Response(
      JSON.stringify({ ok: false, error: "Inbound webhook secret not configured" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let attachments: ThreadAttachmentMeta[] = [];
  if (isResendEvent && evtData?.email_id && ctx.resendApiKey) {
    try {
      const rxRes = await fetch(
        `https://api.resend.com/emails/receiving/${encodeURIComponent(String(evtData.email_id))}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${ctx.resendApiKey}` },
        }
      );
      if (rxRes.ok) {
        const rxJson = await rxRes.json().catch(() => ({}));
        evtData = { ...evtData, ...rxJson };
      }
    } catch {
      // Fall back to webhook event fields
    }
    attachments = await fetchResendReceivedAttachments(ctx.resendApiKey, String(evtData.email_id));
  }

  const res = await ingestInboundEmailRecord(adminClient, ctx, evtData, {
    isResend: isResendEvent,
    attachments,
  });

  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const reqUrl = new URL(req.url);
    const assetMatch = reqUrl.pathname.match(/\/assets\/([a-z0-9._-]+\.png)$/i);
    const rawKey = assetMatch?.[1] || reqUrl.searchParams.get("asset") || "";
    const assetKey = /^[a-z0-9._-]+\.png$/i.test(rawKey) ? rawKey : "";
    if (assetKey) {
      let bytes = LIVE_ASSET_BYTE_CACHE.get(assetKey) || null;
      if (!bytes) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && supabaseServiceKey) {
          const admin = createClient(supabaseUrl, supabaseServiceKey);
          const { data: assetRow } = await admin
            .from("keeper_email_assets")
            .select("base64_data")
            .eq("name", assetKey)
            .maybeSingle();
          const b64 = String(assetRow?.base64_data || "");
          if (b64) {
            bytes = decodeBase64Bytes(b64);
            LIVE_ASSET_BYTE_CACHE.set(assetKey, bytes);
          }
        }
      }
      if (bytes) {
        return new Response(req.method === "HEAD" ? null : bytes, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const reqUrl = new URL(req.url);
    if (
      req.method === "POST" &&
      (reqUrl.searchParams.get("inbound") === "1" || /\/inbound$/i.test(reqUrl.pathname))
    ) {
      return await handleInboundEmailWebhook(req, adminClient, corsHeaders);
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

    const body = await req.json().catch(() => ({}));

    // Authenticated citizen receipt acknowledgment for newly created contact/application tickets (idempotent, 5-min window)
    if (body.mode === "ticket_ack") {
      const ackTicketId = sanitizeHeaderLine(body.ticket_id, 64);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          ackTicketId
        )
      ) {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid ticket_id" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: ticket } = await adminClient
        .from("keeper_tickets")
        .select("id, author_id, status, ticket_type, title, created_at, metadata")
        .eq("id", ackTicketId)
        .maybeSingle();

      const createdAtMs = ticket?.created_at ? Date.parse(ticket.created_at) : 0;
      const withinWindow = createdAtMs > 0 && Date.now() - createdAtMs <= 5 * 60 * 1000;
      const ownerMatches =
        ticket && (ticket.author_id === user.id || ticket.author_id === null);

      if (
        !ticket ||
        String(ticket.status || "").toUpperCase() !== "NEW" ||
        !withinWindow ||
        !ownerMatches
      ) {
        return new Response(
          JSON.stringify({ ok: false, error: "Ticket receipt ineligible" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: existingAck } = await adminClient
        .from("keeper_email_dispatches")
        .select("id")
        .eq("ticket_id", ackTicketId)
        .limit(1)
        .maybeSingle();
      if (existingAck) {
        return new Response(
          JSON.stringify({ ok: true, status: "ALREADY_ACKED", dispatch_id: existingAck.id }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const rawContact =
        ticket.metadata?.contact_meta?.reply_contact ||
        ticket.metadata?.partner_application?.lead_contact ||
        ticket.metadata?.keeper_application?.applicant_contact ||
        "";
      const contactMatch = String(rawContact).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const recipientEmail = contactMatch ? contactMatch[0].trim() : "";

      if (!recipientEmail || BLIND_ALIAS_REGEX.test(recipientEmail)) {
        return new Response(
          JSON.stringify({ ok: true, status: "NO_EXTERNAL_CONTACT_EMAIL" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const ctx = await resolveMailerContext(adminClient);
      const shortCode = ackTicketId.slice(0, 8).toUpperCase();
      const ticketCategory = String(ticket.ticket_type || "Support Inquiry");
      const ackSubject = `We received your Sanctuary OS inquiry (#${shortCode})`;
      const ackDossierProse = [
        `Thank you for contacting Sanctuary OS (${ticketCategory}). Your submission has been logged under "${ticket.title || "Support Inquiry"}" and placed in the active Keepers queue.`,
        `A human Keeper at Sanctuary Foundry will review your dossier shortly. You can also view replies and live status updates directly inside the Support & Tickets drawer in Sanctuary OS.`,
      ].join("\n\n");
      const ackBodyText = [
        `Thank you for contacting Sanctuary OS (${ticketCategory}).`,
        ``,
        `Ticket Reference: #${shortCode}`,
        `Subject: ${ticket.title || "Support Inquiry"}`,
        `Queue Status: Queued for Human Review`,
        ``,
        `A human Keeper at Sanctuary Foundry will review your submission shortly. You can also view replies directly inside the Support & Tickets drawer in Sanctuary OS.`,
        ``,
        `— Sanctuary Foundry (${ctx.fromEmail})`,
      ].join("\n");
      const ackHtml = buildSanctuaryEmailHtml({
        fromName: ctx.fromName,
        headerSubtitle: "Sanctuary Foundry • Submission Receipt",
        subject: ackSubject,
        bodyText: ackDossierProse,
        ticketId: ackTicketId,
        badgeLabel: "Receipt Logged",
        metaTiles: [
          { label: "Ticket Reference", value: `#${shortCode}` },
          { label: "Category", value: ticketCategory },
        ],
        ctaLabel: "Open Sanctuary OS",
        ctaUrl: "https://sanctuaryos.net",
        footerNote: "Sanctuary Foundry",
      });
      const keeperNotifyBcc =
        ctx.replyTo && ctx.replyTo.toLowerCase() !== recipientEmail.toLowerCase()
          ? [ctx.replyTo]
          : [];

      const ackThreadId = ackTicketId;
      const delivery =
        ctx.resendApiKey || (ctx.webhookUrl && isSafeHttpsRelayUrl(ctx.webhookUrl))
          ? await deliverEmailViaProvider({
            resendApiKey: ctx.resendApiKey,
            webhookUrl: ctx.webhookUrl,
            fromName: ctx.fromName,
            fromEmail: ctx.fromEmail,
            replyTo: ctx.replyTo,
            toEmail: recipientEmail,
            bccEmails: keeperNotifyBcc,
            subject: ackSubject,
            bodyText: ackBodyText,
            htmlBody: ackHtml,
            ticketId: ackTicketId,
            threadId: ackThreadId,
          })
          : {
            dispatchStatus: "QUEUED_AWAITING_PROVIDER",
            providerUsed: "SANCTUARY_FOUNDRY_RELAY",
            providerMessageId: `keeper_ack_${crypto.randomUUID().slice(0, 12)}`,
            errorMessage: null,
          };

      const maskedRecipientEmail = maskEmailAddress(recipientEmail);
      const [recipientHash, sealedEnvelope] = await Promise.all([
        computeRecipientHash(recipientEmail),
        sealThreadEnvelope({ external_email: recipientEmail, body_text: ackDossierProse }, ackThreadId),
      ]);
      const { data: ackRow } = await adminClient
        .from("keeper_email_dispatches")
        .insert({
          ticket_id: ackTicketId,
          thread_id: ackThreadId,
          direction: "outbound",
          recipient_hash: recipientHash,
          sealed_envelope: sealedEnvelope,
          sender_user_id: user.id,
          from_name: ctx.fromName,
          from_email: ctx.fromEmail,
          reply_to: ctx.replyTo,
          to_email: maskedRecipientEmail,
          subject: ackSubject,
          body_text: "[Delivered via Sanctuary Foundry Relay]",
          body_html: null,
          provider: delivery.providerUsed,
          provider_message_id: delivery.providerMessageId,
          status: delivery.dispatchStatus,
          error_message: delivery.errorMessage,
        })
        .select("id")
        .maybeSingle();

      return new Response(
        JSON.stringify({
          ok: true,
          status: delivery.dispatchStatus,
          provider: delivery.providerUsed,
          dispatch_id: ackRow?.id || delivery.providerMessageId,
          thread_id: ackThreadId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    if (body.action === "check_email_status") {
      const ctx = await resolveMailerContext(adminClient);
      let receivingApiStatus: "ready" | "empty" | "send_only_api_key" | "error" | "not_configured" =
        ctx.resendApiKey ? "error" : "not_configured";
      let receivingDetail = "";
      let receivingSampleCount = 0;

      if (ctx.resendApiKey) {
        try {
          const probeRes = await fetch("https://api.resend.com/emails/receiving?limit=5", {
            method: "GET",
            headers: { Authorization: `Bearer ${ctx.resendApiKey}` },
            signal: AbortSignal.timeout(3500),
          });
          const probeJson = await probeRes.json().catch(() => ({}));
          if (probeRes.ok) {
            const list = Array.isArray(probeJson?.data) ? probeJson.data : [];
            receivingSampleCount = list.length;
            receivingApiStatus = list.length > 0 ? "ready" : "empty";
          } else {
            const errName = String(probeJson?.name || "").toLowerCase();
            const errMsg = String(probeJson?.message || probeJson?.error || `HTTP ${probeRes.status}`);
            receivingDetail = errMsg;
            receivingApiStatus =
              probeRes.status === 401 ||
              probeRes.status === 403 ||
              errName === "restricted_api_key" ||
              /only has permission to send|restricted/i.test(errMsg)
                ? "send_only_api_key"
                : "error";
          }
        } catch (probeErr: any) {
          receivingDetail = probeErr?.message || "Probe failed";
          receivingApiStatus = "error";
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          resend_configured: Boolean(ctx.resendApiKey),
          webhook_configured: Boolean(ctx.webhookUrl && isSafeHttpsRelayUrl(ctx.webhookUrl)),
          inbound_configured: Boolean(ctx.inboundWebhookSecret),
          receiving_api_status: receivingApiStatus,
          receiving_sample_count: receivingSampleCount,
          receiving_detail: receivingDetail || undefined,
          from_email: ctx.fromEmail,
          from_name: ctx.fromName,
          reply_to: ctx.replyTo,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "sync_inbound_emails") {
      const ctx = await resolveMailerContext(adminClient);
      const inboundSync = await syncRecentResendInboundEmails(adminClient, ctx, { force: true });
      return new Response(
        JSON.stringify({
          ok: true,
          inbound_sync: inboundSync,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "fetch_email_attachment") {
      const providerMsgId = sanitizeHeaderLine(body.provider_message_id, 256);
      const attachmentId = sanitizeHeaderLine(body.attachment_id, 256);
      const attachmentFilename = sanitizeHeaderLine(body.filename, 240);
      if (!providerMsgId) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing provider_message_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const ctx = await resolveMailerContext(adminClient);
      if (!ctx.resendApiKey) {
        return new Response(
          JSON.stringify({ ok: false, error: "Resend API key is not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const receivedList = await fetchResendReceivedAttachments(ctx.resendApiKey, providerMsgId);
      const targetAtt =
        receivedList.find((att) => attachmentId && att.id === attachmentId) ||
        receivedList.find((att) => attachmentFilename && att.filename === attachmentFilename) ||
        receivedList[0];
      if (!targetAtt?.download_url) {
        return new Response(
          JSON.stringify({ ok: false, error: "Attachment download URL unavailable" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetAtt.download_url);
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid attachment download URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const host = parsedUrl.hostname.toLowerCase();
      const isTrustedResendCdn =
        parsedUrl.protocol === "https:" &&
        (host === "resend.app" ||
          host.endsWith(".resend.app") ||
          host === "resend.com" ||
          host.endsWith(".resend.com"));
      if (!isTrustedResendCdn) {
        return new Response(
          JSON.stringify({ ok: false, error: "Untrusted attachment CDN host" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const attRes = await fetch(parsedUrl.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
      if (!attRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `Attachment fetch failed (HTTP ${attRes.status})` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const buf = await attRes.arrayBuffer();
      if (buf.byteLength > 8_000_000) {
        return new Response(
          JSON.stringify({ ok: false, error: "Attachment exceeds 8 MB transfer limit" }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const mime =
        String(
          targetAtt.content_type ||
            attRes.headers.get("content-type") ||
            "application/octet-stream"
        )
          .split(";")[0]
          .trim() || "application/octet-stream";
      return new Response(
        JSON.stringify({
          ok: true,
          filename: targetAtt.filename || "attachment",
          content_type: mime,
          size: buf.byteLength,
          data_url: `data:${mime};base64,${arrayBufferToBase64(buf)}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "clear_email_dispatches") {
      await adminClient
        .from("keeper_email_dispatches")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional Keeper-only action to rotate/store outbound & inbound email relay secrets server-side
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
        const rawKey = String(body.support_email_api_key || "").trim();
        const sealedKey = rawKey
          ? await sealRuntimeSecretWithMaster("support_email_api_key", rawKey)
          : "";
        await adminClient.rpc("internal_set_runtime_secret", {
          p_key: "support_email_api_key",
          p_value: sealedKey,
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
      if (body.inbound_webhook_secret !== undefined) {
        const rawInbound = String(body.inbound_webhook_secret || "").trim();
        const sealedInbound = rawInbound
          ? await sealRuntimeSecretWithMaster("inbound_webhook_secret", rawInbound)
          : "";
        await adminClient.rpc("internal_set_runtime_secret", {
          p_key: "inbound_webhook_secret",
          p_value: sealedInbound,
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "get_email_thread") {
      const reqThreadId = sanitizeHeaderLine(body.thread_id, 64);
      const reqDispatchId = sanitizeHeaderLine(body.dispatch_id, 64);
      const reqTicketId = sanitizeHeaderLine(body.ticket_id, 64);
      const ctx = await resolveMailerContext(adminClient);
      const inboundSync = await syncRecentResendInboundEmails(adminClient, ctx, {
        force: Boolean(body.force_sync),
      });

      let resolvedThreadId = reqThreadId || "";
      let resolvedTicketId = reqTicketId || "";

      if (!resolvedThreadId && reqDispatchId) {
        const { data: seedRow } = await adminClient
          .from("keeper_email_dispatches")
          .select("id, thread_id, ticket_id")
          .eq("id", reqDispatchId)
          .maybeSingle();
        if (seedRow) {
          resolvedThreadId = seedRow.thread_id || seedRow.ticket_id || seedRow.id;
          resolvedTicketId = resolvedTicketId || seedRow.ticket_id || "";
        }
      }

      if (!resolvedThreadId && !resolvedTicketId && !reqDispatchId) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing thread_id, dispatch_id, or ticket_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const effectiveThread = resolvedThreadId || resolvedTicketId || reqDispatchId;
      const filters = [`thread_id.eq.${effectiveThread}`];
      if (resolvedTicketId) filters.push(`ticket_id.eq.${resolvedTicketId}`);
      if (reqDispatchId) filters.push(`id.eq.${reqDispatchId}`);

      const { data: rawRows, error: threadErr } = await adminClient
        .from("keeper_email_dispatches")
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: true });

      if (threadErr) throw threadErr;

      let resolvedExternalEmail = "";
      const messages = await Promise.all(
        (rawRows || []).map(async (row: any) => {
          const rowThread = row.thread_id || row.ticket_id || row.id;
          const opened = await openThreadEnvelope(row.sealed_envelope, rowThread);
          if (opened?.external_email && !resolvedExternalEmail) {
            resolvedExternalEmail = opened.external_email;
          }
          let attachments: ThreadAttachmentMeta[] = Array.isArray(opened?.attachments)
            ? opened!.attachments!
            : [];
          const shouldRefreshResend =
            String(row.provider || "").toUpperCase() === "RESEND" &&
            String(row.direction || "").toLowerCase() === "inbound" &&
            Boolean(row.provider_message_id) &&
            Boolean(ctx.resendApiKey) &&
            (attachments.length === 0 || attachments.some((a) => !a.data_url));
          if (shouldRefreshResend) {
            const refreshed = await fetchResendReceivedAttachments(
              ctx.resendApiKey,
              String(row.provider_message_id)
            );
            if (refreshed.length > 0) {
              const prevByKey = new Map<string, ThreadAttachmentMeta>();
              attachments.forEach((prevAtt) => {
                if (prevAtt.id) prevByKey.set(`id:${prevAtt.id}`, prevAtt);
                if (prevAtt.filename) prevByKey.set(`fn:${prevAtt.filename}`, prevAtt);
              });
              attachments = refreshed.map((fresh) => {
                const match =
                  (fresh.id ? prevByKey.get(`id:${fresh.id}`) : undefined) ||
                  (fresh.filename ? prevByKey.get(`fn:${fresh.filename}`) : undefined);
                return match?.data_url ? { ...fresh, data_url: match.data_url } : fresh;
              });
            }
          }
          attachments = await Promise.all(
            attachments.map(async (att) => {
              const mime = String(att.content_type || "").toLowerCase().split(";")[0].trim();
              if (
                mime.startsWith("image/") &&
                !att.data_url &&
                att.download_url &&
                (!att.size || att.size <= 2_500_000)
              ) {
                try {
                  const parsed = new URL(att.download_url);
                  const h = parsed.hostname.toLowerCase();
                  if (
                    parsed.protocol === "https:" &&
                    (h === "resend.app" ||
                      h.endsWith(".resend.app") ||
                      h === "resend.com" ||
                      h.endsWith(".resend.com"))
                  ) {
                    const imgRes = await fetch(parsed.toString(), {
                      method: "GET",
                      signal: AbortSignal.timeout(4500),
                    });
                    if (imgRes.ok) {
                      const imgBuf = await imgRes.arrayBuffer();
                      if (imgBuf.byteLength > 0 && imgBuf.byteLength <= 2_500_000) {
                        const resolvedMime =
                          String(att.content_type || imgRes.headers.get("content-type") || "image/png")
                            .split(";")[0]
                            .trim() || "image/png";
                        return {
                          ...att,
                          content_type: resolvedMime,
                          size: imgBuf.byteLength,
                          data_url: `data:${resolvedMime};base64,${arrayBufferToBase64(imgBuf)}`,
                        };
                      }
                    }
                  }
                } catch {
                  // Fall back to fresh download_url
                }
              }
              return att;
            })
          );
          const resolvedBodyText =
            opened?.body_text !== undefined ? opened.body_text : String(row.body_text || "");
          return {
            id: row.id,
            thread_id: rowThread,
            ticket_id: row.ticket_id || resolvedTicketId || null,
            direction: row.direction || "outbound",
            from_name: row.from_name,
            from_email: row.from_email,
            to_email: row.to_email,
            subject: row.subject,
            body_text: resolvedBodyText,
            attachments,
            status: row.status,
            provider: row.provider,
            provider_message_id: row.provider_message_id,
            in_reply_to: row.in_reply_to,
            created_at: row.created_at,
          };
        })
      );

      return new Response(
        JSON.stringify({
          ok: true,
          thread_id: effectiveThread,
          ticket_id: resolvedTicketId || messages.find((m) => m.ticket_id)?.ticket_id || null,
          external_email: resolvedExternalEmail || null,
          external_email_masked: resolvedExternalEmail
            ? maskEmailAddress(resolvedExternalEmail)
            : messages[0]?.to_email || "",
          subject: messages[0]?.subject || "",
          messages,
          inbound_sync: inboundSync,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "reply_email_thread") {
      const reqThreadId = sanitizeHeaderLine(body.thread_id, 64);
      const reqDispatchId = sanitizeHeaderLine(body.dispatch_id, 64);
      const replyBodyText = String(body.body_text || "").trim();

      if ((!reqThreadId && !reqDispatchId) || !replyBodyText) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing thread_id or reply body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const lookupFilters = [];
      if (reqThreadId) lookupFilters.push(`thread_id.eq.${reqThreadId}`, `ticket_id.eq.${reqThreadId}`, `id.eq.${reqThreadId}`);
      if (reqDispatchId) lookupFilters.push(`id.eq.${reqDispatchId}`);

      const { data: threadRows } = await adminClient
        .from("keeper_email_dispatches")
        .select("*")
        .or(lookupFilters.join(","))
        .order("created_at", { ascending: true });

      const baseRows = threadRows || [];
      const effectiveThreadId = reqThreadId || baseRows[0]?.thread_id || baseRows[0]?.ticket_id || baseRows[0]?.id || crypto.randomUUID();
      const linkedTicketId = sanitizeHeaderLine(body.ticket_id || baseRows.find((r: any) => r.ticket_id)?.ticket_id || "", 64) || null;

      let targetEmail = sanitizeHeaderLine(body.to_email, 254);
      for (const row of baseRows) {
        if (targetEmail && EMAIL_FORMAT_REGEX.test(targetEmail)) break;
        const rowThread = row.thread_id || row.ticket_id || row.id;
        const opened = await openThreadEnvelope(row.sealed_envelope, rowThread);
        if (opened?.external_email && EMAIL_FORMAT_REGEX.test(opened.external_email)) {
          targetEmail = opened.external_email;
          break;
        }
      }

      if (!targetEmail || !EMAIL_FORMAT_REGEX.test(targetEmail)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Recipient email is not available on this legacy log row. Enter recipient email manually in Compose to start a thread.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawBaseSubject = sanitizeHeaderLine(body.subject || baseRows[0]?.subject || "Sanctuary OS Correspondence", 240);
      const replySubject = /^Re:\s/i.test(rawBaseSubject) ? rawBaseSubject : `Re: ${rawBaseSubject}`;
      const lastProviderMsgId = baseRows[baseRows.length - 1]?.provider_message_id || null;
      const inReplyToHeader =
        lastProviderMsgId && String(lastProviderMsgId).includes("@")
          ? `<${String(lastProviderMsgId).replace(/^<|>$/g, "")}>`
          : lastProviderMsgId
            ? `<${lastProviderMsgId}@resend.dev>`
            : undefined;

      const { fromEmail, fromName, replyTo, resendApiKey, webhookUrl } =
        await resolveMailerContext(adminClient, {
          from_email: body.from_email,
          from_name: body.from_name,
          reply_to: body.reply_to,
        });

      const htmlBody = buildSanctuaryEmailHtml({
        fromName,
        headerSubtitle: linkedTicketId
          ? "Sanctuary Foundry • Support Reply"
          : "Sanctuary Foundry • Direct Reply",
        subject: replySubject,
        bodyText: replyBodyText,
        ticketId: linkedTicketId,
        badgeLabel: linkedTicketId ? undefined : "Reply",
        metaTiles: linkedTicketId
          ? [
            { label: "Ticket Reference", value: `#${linkedTicketId.slice(0, 8).toUpperCase()}` },
            { label: "Channel", value: "Email Thread" },
          ]
          : [],
        ctaLabel: linkedTicketId ? "Open Sanctuary OS" : "sanctuaryos.net",
        ctaUrl: "https://sanctuaryos.net",
        footerNote: "Sanctuary Foundry",
      });

      const { dispatchStatus, providerUsed, providerMessageId, errorMessage } =
        await deliverEmailViaProvider({
          resendApiKey,
          webhookUrl,
          fromName,
          fromEmail,
          replyTo,
          toEmail: targetEmail,
          subject: replySubject,
          bodyText: replyBodyText,
          htmlBody,
          ticketId: linkedTicketId,
          threadId: effectiveThreadId,
          inReplyTo: inReplyToHeader,
          references: inReplyToHeader,
        });

      const maskedTarget = maskEmailAddress(targetEmail);
      const [recipientHash, sealedEnvelope] = await Promise.all([
        computeRecipientHash(targetEmail),
        sealThreadEnvelope({ external_email: targetEmail, body_text: replyBodyText }, effectiveThreadId),
      ]);

      const { data: insertedRow } = await adminClient
        .from("keeper_email_dispatches")
        .insert({
          ticket_id: linkedTicketId,
          thread_id: effectiveThreadId,
          direction: "outbound",
          in_reply_to: inReplyToHeader || null,
          recipient_hash: recipientHash,
          sealed_envelope: sealedEnvelope,
          sender_user_id: user.id,
          from_name: fromName,
          from_email: fromEmail,
          reply_to: replyTo,
          to_email: maskedTarget,
          subject: replySubject,
          body_text: "[Delivered via Sanctuary Foundry Relay]",
          body_html: null,
          provider: providerUsed,
          provider_message_id: providerMessageId,
          status: dispatchStatus,
          error_message: errorMessage,
        })
        .select("*")
        .maybeSingle();

      if (linkedTicketId) {
        try {
          const { data: existingTicket } = await adminClient
            .from("keeper_tickets")
            .select("metadata")
            .eq("id", linkedTicketId)
            .maybeSingle();
          if (existingTicket) {
            const prevMeta = existingTicket.metadata || {};
            const prevDispatches = Array.isArray(prevMeta.email_dispatches)
              ? prevMeta.email_dispatches
              : [];
            await adminClient
              .from("keeper_tickets")
              .update({
                metadata: {
                  ...prevMeta,
                  email_dispatches: [
                    ...prevDispatches,
                    {
                      id: insertedRow?.id || providerMessageId,
                      thread_id: effectiveThreadId,
                      direction: "outbound",
                      from_name: fromName,
                      to_email: maskedTarget,
                      subject: replySubject,
                      status: dispatchStatus,
                      provider: providerUsed,
                      sent_at: new Date().toISOString(),
                    },
                  ],
                },
              })
              .eq("id", linkedTicketId);
          }
        } catch {
          // non-fatal ticket metadata update
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          thread_id: effectiveThreadId,
          message: {
            ...(insertedRow || {}),
            id: insertedRow?.id || providerMessageId,
            thread_id: effectiveThreadId,
            direction: "outbound",
            body_text: replyBodyText,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toEmail = sanitizeHeaderLine(body.to_email, 254);
    const subject = sanitizeHeaderLine(body.subject, 240);
    const bodyText = String(body.body_text || "").trim();
    const ticketId = body.ticket_id ? sanitizeHeaderLine(body.ticket_id, 64) : null;
    const requestedThreadId = body.thread_id ? sanitizeHeaderLine(body.thread_id, 64) : null;
    const threadId = requestedThreadId || ticketId || crypto.randomUUID();

    if (
      !toEmail ||
      !EMAIL_FORMAT_REGEX.test(toEmail) ||
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

    const { fromEmail, fromName, replyTo, resendApiKey, webhookUrl } =
      await resolveMailerContext(adminClient, {
        from_email: body.from_email,
        from_name: body.from_name,
        reply_to: body.reply_to,
      });

    const isTicketReply = Boolean(ticketId);
    const htmlBody = buildSanctuaryEmailHtml({
      fromName,
      headerSubtitle: isTicketReply
        ? "Sanctuary Foundry • Support Reply"
        : "Sanctuary Foundry",
      subject,
      bodyText,
      ticketId,
      badgeLabel: isTicketReply ? undefined : "Official",
      metaTiles: isTicketReply && ticketId
        ? [
          {
            label: "Ticket Reference",
            value: `#${ticketId.slice(0, 8).toUpperCase()}`,
          },
          { label: "Channel", value: "Support Center" },
        ]
        : [],
      ctaLabel: isTicketReply ? "Open Sanctuary OS" : "sanctuaryos.net",
      ctaUrl: "https://sanctuaryos.net",
      footerNote: "Sanctuary Foundry",
    });

    const { dispatchStatus, providerUsed, providerMessageId, errorMessage } =
      await deliverEmailViaProvider({
        resendApiKey,
        webhookUrl,
        fromName,
        fromEmail,
        replyTo,
        toEmail,
        subject,
        bodyText,
        htmlBody,
        ticketId,
        threadId,
      });

    const maskedToEmail = maskEmailAddress(toEmail);
    const [recipientHash, sealedEnvelope] = await Promise.all([
      computeRecipientHash(toEmail),
      sealThreadEnvelope({ external_email: toEmail, body_text: bodyText }, threadId),
    ]);

    const { data: insertedRow } = await adminClient
      .from("keeper_email_dispatches")
      .insert({
        ticket_id: ticketId || null,
        thread_id: threadId,
        direction: "outbound",
        recipient_hash: recipientHash,
        sealed_envelope: sealedEnvelope,
        sender_user_id: user.id,
        from_name: fromName,
        from_email: fromEmail,
        reply_to: replyTo,
        to_email: maskedToEmail,
        subject,
        body_text: "[Delivered via Sanctuary Foundry Relay]",
        body_html: null,
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
                thread_id: threadId,
                direction: "outbound",
                from_name: fromName,
                to_email: maskedToEmail,
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
          thread_id: threadId,
          direction: "outbound",
          from_name: fromName,
          from_email: fromEmail,
          to_email: maskedToEmail,
          subject,
          status: dispatchStatus,
          provider: providerUsed,
        },
        thread_id: threadId,
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
        error: err?.message || "Failed to dispatch email from Sanctuary Foundry",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
