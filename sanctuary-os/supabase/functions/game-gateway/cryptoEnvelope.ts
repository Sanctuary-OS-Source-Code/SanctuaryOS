// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SERVER_AUTH_OPTS } from './corsAndSanitization.ts'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

export function b64UrlToBytes(input: string): Uint8Array {
  const clean = (input || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, '');
  const pad = (4 - (clean.length % 4)) % 4;
  const bin = atob(clean + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const SPOKE_GATEWAY_TOKEN_REGEX = /^spk_gw_[0-9a-f]{64}$/i;

export function normalizeSpokeUrl(rawUrl: string): string {
  return String(rawUrl || '').trim().replace(/\/+$/, '').toLowerCase();
}

export function detectCredentialKind(secret: string): 'spoke_gateway' | 'legacy_service_role' {
  return SPOKE_GATEWAY_TOKEN_REGEX.test(String(secret || '').trim())
    ? 'spoke_gateway'
    : 'legacy_service_role';
}

export function maskCredentialFingerprint(secret: string): string {
  const clean = String(secret || '').trim();
  if (!clean) return '';
  if (SPOKE_GATEWAY_TOKEN_REGEX.test(clean)) {
    return `spk_gw_...${clean.slice(-4).toLowerCase()}`;
  }
  return clean.length >= 6 ? `legacy_...${clean.slice(-6)}` : 'configured';
}

export function parseMasterKeyMaterial(raw: string): Uint8Array {
  const clean = String(raw || '').trim();
  if (!clean) {
    throw new Error('Missing SPOKE_VAULT_MASTER_KEY in Edge Function secrets');
  }
  if (/^[0-9a-f]{64}$/i.test(clean)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const decoded = b64UrlToBytes(clean);
  if (decoded.byteLength !== 32) {
    throw new Error('Invalid SPOKE_VAULT_MASTER_KEY length: expected 32 bytes (64 hex or 44 base64 chars)');
  }
  return decoded;
}

export function getMasterKeyRing(): Array<{ kid: string; key: Uint8Array }> {
  const ring: Array<{ kid: string; key: Uint8Array }> = [];
  const primaryRaw = String(Deno.env.get('SPOKE_VAULT_MASTER_KEY') || '').trim();
  if (primaryRaw) {
    ring.push({ kid: 'master', key: parseMasterKeyMaterial(primaryRaw) });
  }
  const prevRaw = String(Deno.env.get('SPOKE_VAULT_PREVIOUS_KEYS') || '').trim();
  if (prevRaw) {
    const items = prevRaw.split(',').map((s) => s.trim()).filter(Boolean);
    items.forEach((entry, idx) => {
      const sep = entry.indexOf(':');
      const kid = sep > 0 ? entry.slice(0, sep).trim() : `prev_${idx + 1}`;
      const mat = sep > 0 ? entry.slice(sep + 1).trim() : entry;
      if (mat) {
        ring.push({ kid, key: parseMasterKeyMaterial(mat) });
      }
    });
  }
  if (ring.length === 0) {
    throw new Error('SPOKE_VAULT_MASTER_KEY is not configured in Supabase Edge Function secrets');
  }
  return ring;
}

export function buildSpokeAad(meta: { gameId: string; schemaId: string; supabaseUrl: string }): Uint8Array {
  const aadStr = [
    'sanctuary-spoke-aad:v1',
    String(meta.gameId || '').trim().toLowerCase(),
    String(meta.schemaId || '').trim().toUpperCase(),
    normalizeSpokeUrl(meta.supabaseUrl),
  ].join('|');
  return new TextEncoder().encode(aadStr);
}

export async function deriveRowAesKey(
  masterBytes: Uint8Array,
  salt: Uint8Array,
  gameId: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', masterBytes, 'HKDF', false, ['deriveKey']);
  const info = new TextEncoder().encode(
    `sanctuary-spoke-vault:v1:${String(gameId || '').trim().toLowerCase()}`
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function sealSpokeEnvelope(
  plaintextSecret: string,
  meta: { gameId: string; schemaId: string; supabaseUrl: string }
): Promise<{ envelope: string; keyVersion: string }> {
  const cleanSecret = String(plaintextSecret || '').trim();
  if (!cleanSecret) throw new Error('Cannot seal an empty Spoke credential');
  const ring = getMasterKeyRing();
  const primary = ring[0];
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveRowAesKey(primary.key, salt, meta.gameId, ['encrypt']);
  const aad = buildSpokeAad(meta);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    aesKey,
    new TextEncoder().encode(cleanSecret)
  );
  const envelope = [
    'enc',
    'v1',
    primary.kid,
    bytesToB64Url(salt),
    bytesToB64Url(iv),
    bytesToB64Url(new Uint8Array(ctBuf)),
  ].join(':');
  return { envelope, keyVersion: `v1:${primary.kid}` };
}

export async function openSpokeEnvelope(
  envelope: string,
  meta: { gameId: string; schemaId: string; supabaseUrl: string }
): Promise<string> {
  const clean = String(envelope || '').trim();
  if (!clean.startsWith('enc:v1:')) {
    throw new Error('Unsupported or unsealed Spoke credential format');
  }
  const parts = clean.split(':');
  if (parts.length !== 6) {
    throw new Error('Malformed Spoke credential envelope');
  }
  const [, , kid, saltB64, ivB64, ctB64] = parts;
  const ring = getMasterKeyRing();
  const ordered = [...ring.filter((r) => r.kid === kid), ...ring.filter((r) => r.kid !== kid)];
  const salt = b64UrlToBytes(saltB64);
  const iv = b64UrlToBytes(ivB64);
  const ct = b64UrlToBytes(ctB64);
  const aad = buildSpokeAad(meta);

  for (const entry of ordered) {
    try {
      const aesKey = await deriveRowAesKey(entry.key, salt, meta.gameId, ['decrypt']);
      const ptBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        aesKey,
        ct
      );
      return new TextDecoder().decode(ptBuf);
    } catch {
      // Try next key in rotation ring
    }
  }
  throw new Error('Spoke credential envelope decryption failed (key or bound metadata mismatch)');
}

export function createSpokeClient(supabaseUrl: string, anonKey: string, credential: string) {
  const cleanUrl = String(supabaseUrl || '').trim().replace(/\/+$/, '');
  const cleanAnon = String(anonKey || '').trim();
  const cleanCred = String(credential || '').trim();
  if (SPOKE_GATEWAY_TOKEN_REGEX.test(cleanCred)) {
    if (!cleanAnon) {
      throw new Error('Spoke supabase_anon_key is required when using a scoped Spoke Gateway Token');
    }
    return createClient(cleanUrl, cleanAnon, {
      ...SERVER_AUTH_OPTS,
      global: {
        headers: {
          'x-sanctuary-spoke-token': cleanCred.toLowerCase(),
        },
      },
    });
  }
  return createClient(cleanUrl, cleanCred, SERVER_AUTH_OPTS);
}

export async function verifySpokeCredentialHandshake(
  spokeClient: any,
  credentialKind: 'spoke_gateway' | 'legacy_service_role'
): Promise<{ ok: boolean; authMode: string }> {
  const { data, error } = await spokeClient.rpc('verify_spoke_gateway_handshake');
  if (!error) {
    return { ok: true, authMode: String(data?.auth_mode || credentialKind) };
  }
  const errMsg = String(error?.message || '').toLowerCase();
  const errCode = String(error?.code || '');
  const isMissingFn =
    errCode === '42883' ||
    errCode === 'PGRST202' ||
    errMsg.includes('could not find the function') ||
    (errMsg.includes('verify_spoke_gateway_handshake') && errMsg.includes('does not exist'));

  if (credentialKind === 'spoke_gateway') {
    throw new Error(
      `Spoke Gateway Token rejected by target Spoke: ${error.message || 'apply latest schema.sql and verify active token'}`
    );
  }
  if (!isMissingFn) {
    throw new Error(`Spoke handshake rejected: ${error.message}`);
  }
  const { error: fallbackErr } = await spokeClient
    .from('profiles')
    .select('id', { head: true, count: 'exact' })
    .limit(1);
  if (fallbackErr) {
    throw new Error(`Spoke handshake failed: ${fallbackErr.message}`);
  }
  return { ok: true, authMode: 'legacy_service_role' };
}

