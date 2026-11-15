// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SERVER_AUTH_OPTS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

const ALLOWED_FILTER_METHODS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'overlaps',
  'not',
  'or',
  'match',
  'filter',
  'textSearch',
]);

function applySpokeQueryFilters(query: any, filters: any[]) {
  let q = query;
  if (!Array.isArray(filters)) return q;
  for (const f of filters) {
    if (!f || typeof f.method !== 'string' || !ALLOWED_FILTER_METHODS.has(f.method)) continue;
    const args = Array.isArray(f.args) ? f.args : [];
    if (typeof q[f.method] === 'function') {
      q = q[f.method](...args);
    }
  }
  return q;
}

function applySpokeQueryModifiers(query: any, spec: any) {
  let q = applySpokeQueryFilters(query, spec?.filters || []);
  if (Array.isArray(spec?.orders)) {
    for (const ord of spec.orders) {
      if (ord && typeof ord.column === 'string' && typeof q.order === 'function') {
        q = q.order(ord.column, ord.options || {});
      }
    }
  }
  if (Array.isArray(spec?.range) && spec.range.length === 2 && typeof q.range === 'function') {
    q = q.range(Number(spec.range[0]) || 0, Number(spec.range[1]) || 0);
  }
  if (typeof spec?.limit === 'number' && Number.isFinite(spec.limit) && typeof q.limit === 'function') {
    q = q.limit(spec.limit);
  }
  if (spec?.singleMode === 'single' && typeof q.single === 'function') {
    q = q.single();
  } else if (spec?.singleMode === 'maybeSingle' && typeof q.maybeSingle === 'function') {
    q = q.maybeSingle();
  }
  return q;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;

function b64UrlToBytes(input: string): Uint8Array {
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

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const SPOKE_GATEWAY_TOKEN_REGEX = /^spk_gw_[0-9a-f]{64}$/i;

function normalizeSpokeUrl(rawUrl: string): string {
  return String(rawUrl || '').trim().replace(/\/+$/, '').toLowerCase();
}

function detectCredentialKind(secret: string): 'spoke_gateway' | 'legacy_service_role' {
  return SPOKE_GATEWAY_TOKEN_REGEX.test(String(secret || '').trim())
    ? 'spoke_gateway'
    : 'legacy_service_role';
}

function maskCredentialFingerprint(secret: string): string {
  const clean = String(secret || '').trim();
  if (!clean) return '';
  if (SPOKE_GATEWAY_TOKEN_REGEX.test(clean)) {
    return `spk_gw_...${clean.slice(-4).toLowerCase()}`;
  }
  return clean.length >= 6 ? `legacy_...${clean.slice(-6)}` : 'configured';
}

function parseMasterKeyMaterial(raw: string): Uint8Array {
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

function getMasterKeyRing(): Array<{ kid: string; key: Uint8Array }> {
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

function buildSpokeAad(meta: { gameId: string; schemaId: string; supabaseUrl: string }): Uint8Array {
  const aadStr = [
    'sanctuary-spoke-aad:v1',
    String(meta.gameId || '').trim().toLowerCase(),
    String(meta.schemaId || '').trim().toUpperCase(),
    normalizeSpokeUrl(meta.supabaseUrl),
  ].join('|');
  return new TextEncoder().encode(aadStr);
}

async function deriveRowAesKey(
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

async function sealSpokeEnvelope(
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

async function openSpokeEnvelope(
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

function createSpokeClient(supabaseUrl: string, anonKey: string, credential: string) {
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

async function verifySpokeCredentialHandshake(
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

function decodeCborItem(bytes: Uint8Array, offset = 0): { value: any; offset: number } {
  if (offset >= bytes.length) throw new Error('CBOR unexpected EOF');
  const initial = bytes[offset++];
  const major = initial >> 5;
  const info = initial & 0x1f;

  function readLength(): number {
    if (info < 24) return info;
    if (info === 24) return bytes[offset++];
    if (info === 25) {
      const v = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      return v;
    }
    if (info === 26) {
      const v =
        ((bytes[offset] << 24) >>> 0) +
        ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
      offset += 4;
      return v;
    }
    throw new Error('Unsupported CBOR length info: ' + info);
  }

  if (major === 0) return { value: readLength(), offset };
  if (major === 1) return { value: -1 - readLength(), offset };
  if (major === 2) {
    const len = readLength();
    const slice = bytes.subarray(offset, offset + len);
    offset += len;
    return { value: slice, offset };
  }
  if (major === 3) {
    const len = readLength();
    const str = new TextDecoder().decode(bytes.subarray(offset, offset + len));
    offset += len;
    return { value: str, offset };
  }
  if (major === 4) {
    const len = readLength();
    const arr: any[] = [];
    for (let i = 0; i < len; i++) {
      const res = decodeCborItem(bytes, offset);
      arr.push(res.value);
      offset = res.offset;
    }
    return { value: arr, offset };
  }
  if (major === 5) {
    const len = readLength();
    const map = new Map<any, any>();
    for (let i = 0; i < len; i++) {
      const k = decodeCborItem(bytes, offset);
      offset = k.offset;
      const v = decodeCborItem(bytes, offset);
      offset = v.offset;
      map.set(k.value, v.value);
    }
    return { value: map, offset };
  }
  if (major === 7) {
    if (info === 20) return { value: false, offset };
    if (info === 21) return { value: true, offset };
    if (info === 22) return { value: null, offset };
  }
  throw new Error('Unsupported CBOR major type: ' + major);
}

function derSignatureToP1363(der: Uint8Array): Uint8Array {
  if (der.length === 64 && der[0] !== 0x30) return der;
  let pos = 0;
  if (der[pos++] !== 0x30) throw new Error('Invalid DER ECDSA signature');
  const seqLen = der[pos++];
  if (seqLen & 0x80) {
    const nBytes = seqLen & 0x7f;
    pos += nBytes;
  }
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA r-integer tag');
  const rLen = der[pos++];
  let r = der.subarray(pos, pos + rLen);
  pos += rLen;
  if (der[pos++] !== 0x02) throw new Error('Invalid DER ECDSA s-integer tag');
  const sLen = der[pos++];
  let s = der.subarray(pos, pos + sLen);

  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1);
  if (r.length > 32 || s.length > 32) throw new Error('Invalid ECDSA coordinate length');

  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

async function verifyCoseSignature(
  publicKeyCborBytes: Uint8Array,
  signedData: Uint8Array,
  signatureBytes: Uint8Array
): Promise<boolean> {
  const { value: coseMap } = decodeCborItem(publicKeyCborBytes, 0);
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  if (kty === 3 || alg === -257) {
    const n = coseMap.get(-1) as Uint8Array;
    const e = coseMap.get(-2) as Uint8Array;
    if (!n || !e) throw new Error('Missing RSA modulus or exponent in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: bytesToB64Url(n), e: bytesToB64Url(e), alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signatureBytes, signedData);
  }

  if (kty === 2 || alg === -7) {
    const x = coseMap.get(-2) as Uint8Array;
    const y = coseMap.get(-3) as Uint8Array;
    if (!x || !y) throw new Error('Missing EC P-256 coordinates in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: bytesToB64Url(x), y: bytesToB64Url(y), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const p1363Sig = derSignatureToP1363(signatureBytes);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      p1363Sig,
      signedData
    );
  }

  if (kty === 1 || alg === -8) {
    const x = coseMap.get(-2) as Uint8Array;
    if (!x) throw new Error('Missing Ed25519 public key bytes in COSE key');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: bytesToB64Url(x), ext: true },
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes, signedData);
  }

  throw new Error(`Unsupported COSE key type (${kty}) or algorithm (${alg})`);
}

function isAllowedWebAuthnOrigin(originStr: string, rpId: string): boolean {
  try {
    const u = new URL(originStr);
    const host = u.hostname.toLowerCase();
    const target = (rpId || 'sanctuaryos.net').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return u.protocol === 'http:' || u.protocol === 'https:';
    }
    return u.protocol === 'https:' && (host === target || host.endsWith('.' + target));
  } catch {
    return false;
  }
}

async function matchesAllowedRpIdHash(
  authDataBytes: Uint8Array,
  rpId: string,
  originStr: string
): Promise<boolean> {
  const candidates = new Set<string>([rpId || 'sanctuaryos.net']);
  try {
    const u = new URL(originStr);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      candidates.add(host);
      candidates.add('localhost');
      candidates.add('127.0.0.1');
    }
  } catch {}

  for (const candidate of candidates) {
    const expectedRpIdHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate))
    );
    let matches = true;
    for (let i = 0; i < 32; i++) {
      if (authDataBytes[i] !== expectedRpIdHash[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function formatUuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const STAFF_ROLES = ['wayfinder', 'oversight', 'architect', 'senior_architect', 'admin'];
const CREATOR_OR_STAFF_ROLES = [...STAFF_ROLES, 'mason'];

const STAFF_ONLY_TABLES = new Set([
  'global_network_status',
  'global_security',
  'heuristic_signatures',
  'known_exception_rules',
  'sanctuary_schemas',
  'sanctuary_lexicons',
  'sanctuary_themes',
  'sanctuary_support_categories',
  'sanctuary_telemetry_sources',
  'dlc_registry',
  'flavor_groups',
  'flavor_group_members',
  'game_versions',
  'taxonomy',
  'tracked_template_files',
  'system_broadcasts',
]);

const CREATOR_OR_STAFF_TABLES = new Set([
  'mods',
  'mod_versions',
  'mod_bundles',
  'mod_dependencies',
  'mod_relationships',
  'version_dependencies',
  'community_groups',
  'community_group_members',
  'collections',
  'collection_members',
  'logical_conflicts',
  'mason_posts',
  'masons',
  'homestead_workbench_templates',
]);

const CITIZEN_TABLES = new Set([
  'audit_logs',
  'mason_post_comments',
  'mason_post_likes',
  'mason_post_views',
  'dispatch_poll_votes',
  'blueprints',
  'blueprint_reports',
  'nexus_assets',
  'nexus_reports',
  'content_flags',
  'sanctuary_tickets',
  'scout_suggestions',
  'notifications',
  'homestead_lab_logs',
  'malware_reports',
  'citizen_staging_queue',
]);

type CachedSpokeEntry = {
  game: any;
  serviceKey: string | null;
  credentialKind: 'spoke_gateway' | 'legacy_service_role' | null;
  keyVersion: string | null;
  keyFingerprint: string;
  rotatedAt: string | null;
  expiresAt: number;
};

const spokeGameConfigCache = new Map<string, CachedSpokeEntry>();
const SPOKE_GAME_CACHE_TTL_MS = 45_000;

function invalidateSpokeGameConfigCache() {
  spokeGameConfigCache.clear();
}

async function resolveGameWithServiceKey(supabaseAdmin: any, gameIdOrSchema: string) {
  const cacheKey = String(gameIdOrSchema || '').trim().toLowerCase();
  const cached = spokeGameConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      game: cached.game,
      serviceKey: cached.serviceKey,
      credentialKind: cached.credentialKind,
      keyVersion: cached.keyVersion,
      keyFingerprint: cached.keyFingerprint,
      rotatedAt: cached.rotatedAt,
      error: null,
    };
  }

  let gameQuery = supabaseAdmin
    .from('sanctuary_games')
    .select('id, name, schema_id, supabase_url, supabase_anon_key, is_active, is_keepers_only, donation_url, payment_processor');

  if (UUID_REGEX.test(gameIdOrSchema)) {
    gameQuery = gameQuery.eq('id', gameIdOrSchema);
  } else {
    gameQuery = gameQuery.ilike('schema_id', gameIdOrSchema);
  }

  const { data: game, error: gameError } = await gameQuery.maybeSingle();
  if (gameError || !game) {
    return {
      game: null,
      serviceKey: null,
      credentialKind: null,
      keyVersion: null,
      keyFingerprint: '',
      rotatedAt: null,
      error: gameError,
    };
  }

  const { data: credRows, error: credErr } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
    p_game_id: game.id,
  });
  if (credErr) {
    throw new Error(`Failed to resolve Spoke credential from Vault: ${credErr.message}`);
  }
  const secretRow = Array.isArray(credRows) ? credRows[0] : credRows;

  let serviceKey: string | null = null;
  let credentialKind: 'spoke_gateway' | 'legacy_service_role' | null = null;
  let keyVersion: string | null = null;
  let keyFingerprint = '';
  let rotatedAt: string | null = null;

  if (secretRow?.envelope_ciphertext) {
    serviceKey = await openSpokeEnvelope(secretRow.envelope_ciphertext, {
      gameId: String(game.id),
      schemaId: String(game.schema_id || ''),
      supabaseUrl: String(game.supabase_url || ''),
    });
    credentialKind =
      secretRow.credential_kind === 'spoke_gateway' || secretRow.credential_kind === 'legacy_service_role'
        ? secretRow.credential_kind
        : detectCredentialKind(serviceKey);
    keyVersion = String(secretRow.key_version || 'v1:master');
    keyFingerprint = String(secretRow.key_fingerprint || maskCredentialFingerprint(serviceKey));
    rotatedAt = secretRow.rotated_at || null;
  }

  const entry: CachedSpokeEntry = {
    game,
    serviceKey,
    credentialKind,
    keyVersion,
    keyFingerprint,
    rotatedAt,
    expiresAt: Date.now() + SPOKE_GAME_CACHE_TTL_MS,
  };
  spokeGameConfigCache.set(cacheKey, entry);
  if (game.id) spokeGameConfigCache.set(String(game.id).toLowerCase(), entry);
  if (game.schema_id) spokeGameConfigCache.set(String(game.schema_id).toLowerCase(), entry);
  return {
    game,
    serviceKey,
    credentialKind,
    keyVersion,
    keyFingerprint,
    rotatedAt,
    error: null,
  };
}

const MAX_INLINE_THEME_DATA_URI_CHARS = 32_768;

function assertNoOversizedInlineImageBlobs(table: string, row: any) {
  if (!row || typeof row !== 'object') return;
  const cleanTable = String(table || '').trim().toLowerCase();
  if (cleanTable !== 'nexus_assets' && cleanTable !== 'sanctuary_themes') return;

  const inspectValue = (val: unknown) => {
    if (!val) return;
    if (typeof val === 'string') {
      if (val.startsWith('data:image/') && val.length > MAX_INLINE_THEME_DATA_URI_CHARS) {
        throw new Error(
          'Oversized inline base64 wallpaper rejected. Upload theme images via Cloud Storage or use an external HTTPS URL.'
        );
      }
      if (val.length > MAX_INLINE_THEME_DATA_URI_CHARS && val.includes('data:image/')) {
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === 'object') inspectValue(parsed);
        } catch {
          // ignore non-JSON strings
        }
      }
      return;
    }
    if (typeof val === 'object') {
      for (const entryVal of Object.values(val as Record<string, unknown>)) {
        inspectValue(entryVal);
      }
    }
  };

  inspectValue(row.json_data);
  inspectValue(row.theme_data);
  inspectValue(row.banner_url);
}

function normalizeSpokeTableRow(table: string, row: any) {
  if (!row || typeof row !== 'object') return row;
  assertNoOversizedInlineImageBlobs(table, row);
  return { ...row };
}

function isValidPassingLabCertProof(proof: any, expectedHash: string): boolean {
  if (!proof || typeof proof !== 'object') return false;
  const proofHash = String(proof.dna_hash || '').trim();
  const activeSecs = Number(proof.active_seconds || 0);
  const saveVerified = String(proof.save_file_verified || '').trim();
  return (
    Boolean(expectedHash) &&
    proofHash === expectedHash &&
    Number.isFinite(activeSecs) &&
    activeSecs >= 15 &&
    saveVerified.length > 0
  );
}

async function hasExistingCloudPassingLabReceipt(
  gameDb: any,
  dnaHash: string,
  versionId?: string | null
): Promise<boolean> {
  if (versionId) {
    const { data: vLogs } = await gameDb
      .from('homestead_lab_logs')
      .select('log_snippet, tester_note')
      .eq('version_id', versionId)
      .limit(5);
    if (
      Array.isArray(vLogs) &&
      vLogs.some(
        (l: any) =>
          l?.log_snippet === 'Clean' || String(l?.tester_note || '').includes('PASS_VERIFIED')
      )
    ) {
      return true;
    }
  }
  if (dnaHash) {
    const { data: hLogs } = await gameDb
      .from('homestead_lab_logs')
      .select('log_snippet, tester_note')
      .ilike('tester_note', `%${dnaHash}%`)
      .limit(5);
    if (
      Array.isArray(hLogs) &&
      hLogs.some(
        (l: any) =>
          l?.log_snippet === 'Clean' || String(l?.tester_note || '').includes('PASS_VERIFIED')
      )
    ) {
      return true;
    }
  }
  return false;
}

async function enforceArchitectSubmissionCompliance(
  gameDb: any,
  cleanTable: string,
  row: any,
  isCallerStaff: boolean
) {
  if (!row || typeof row !== 'object') return;
  const certProof = row._lab_cert_proof;
  if (Object.prototype.hasOwnProperty.call(row, '_lab_cert_proof')) {
    delete row._lab_cert_proof;
  }
  if (isCallerStaff) return;

  if (cleanTable === 'homestead_lab_logs') {
    const snippet = String(row.log_snippet || '').trim();
    const noteRaw = String(row.tester_note || '').trim();
    const isVerifiedReceipt =
      snippet === 'Clean' && noteRaw.includes('PASS_VERIFIED_4STAGE');

    if (isVerifiedReceipt) {
      let parsedNote: any = null;
      try {
        parsedNote = JSON.parse(noteRaw);
      } catch {
        parsedNote = null;
      }
      const receiptHash = String(parsedNote?.dna_hash || '').trim();
      if (!receiptHash || !isValidPassingLabCertProof(certProof, receiptHash)) {
        throw new Error(
          'Forbidden: Verified Lab certificate proof is required to record a 4-stage pass receipt.'
        );
      }

      const { data: verRow } = await gameDb
        .from('mod_versions')
        .select('id, mod_id, mods(compliance_tier, status)')
        .eq('dna_hash', receiptHash)
        .maybeSingle();

      if (verRow) {
        const parentMod = Array.isArray(verRow.mods) ? verRow.mods[0] : verRow.mods;
        const tier = Number(parentMod?.compliance_tier ?? 0);
        const statusLower = String(parentMod?.status || '').trim().toLowerCase();
        if (tier !== 0 || statusLower === 'rejected') {
          throw new Error('Forbidden: Only Tier 0 artifacts may record Architect Lab receipts.');
        }
        return;
      }

      const { data: scoutRow } = await gameDb
        .from('scout_suggestions')
        .select('id, status, compliance_tier, suggested_metadata')
        .eq('dna_hash', receiptHash)
        .neq('status', 'rejected')
        .limit(1)
        .maybeSingle();

      const scoutTier = Number(
        scoutRow?.compliance_tier ?? scoutRow?.suggested_metadata?.compliance_tier ?? 0
      );
      if (!scoutRow || scoutTier !== 0) {
        throw new Error(
          'Forbidden: Unknown hashes cannot write to Architect Lab logs unless queued in Tier 0 Scout or Creator Queue.'
        );
      }
      return;
    }

    // Diagnostic / exception submission to Architects: STRICTLY known Tier 0 hashes only
    if (!row.mod_id || !row.version_id) {
      throw new Error(
        'Forbidden: Submit to Architects only accepts known Tier 0 catalog hashes.'
      );
    }
    const { data: verRow } = await gameDb
      .from('mod_versions')
      .select('id, mod_id, dna_hash, mods(id, compliance_tier, status)')
      .eq('id', row.version_id)
      .maybeSingle();
    const parentMod = Array.isArray(verRow?.mods) ? verRow.mods[0] : verRow?.mods;
    const tier = Number(parentMod?.compliance_tier ?? -1);
    const statusLower = String(parentMod?.status || '').trim().toLowerCase();
    if (
      !verRow ||
      String(verRow.mod_id) !== String(row.mod_id) ||
      !verRow.dna_hash ||
      !parentMod ||
      tier !== 0 ||
      statusLower === 'unverified' ||
      statusLower === 'rejected'
    ) {
      throw new Error(
        'Forbidden: Submit to Architects only accepts known Tier 0 hashes. Unknown Tier 0 hashes must be uploaded via Scout or Creator Queue with a passing Lab test.'
      );
    }
  } else if (cleanTable === 'sanctuary_tickets') {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (Array.isArray(meta.restricted_violations) && meta.restricted_violations.length > 0) {
      throw new Error(
        'Forbidden: Support tickets containing non-Tier-0 or unknown artifacts cannot be submitted to Architects.'
      );
    }
    if (meta.target_mod_id) {
      const { data: tMod } = await gameDb
        .from('mods')
        .select('id, compliance_tier, status, mod_versions(id)')
        .eq('id', meta.target_mod_id)
        .maybeSingle();
      const tier = Number(tMod?.compliance_tier ?? -1);
      const statusLower = String(tMod?.status || '').trim().toLowerCase();
      const hasKnownVersion =
        Array.isArray(tMod?.mod_versions) && tMod.mod_versions.length > 0;
      if (
        !tMod ||
        tier !== 0 ||
        statusLower === 'unverified' ||
        statusLower === 'rejected' ||
        !hasKnownVersion
      ) {
        throw new Error(
          'Forbidden: Support tickets only accept known Tier 0 catalog artifacts.'
        );
      }
    }
  } else if (cleanTable === 'scout_suggestions') {
    const tier = Number(
      row.compliance_tier ?? row.suggested_metadata?.compliance_tier ?? 0
    );
    if (tier !== 0) {
      throw new Error('Forbidden: Scout Queue only accepts Tier 0 artifacts.');
    }
    row.compliance_tier = 0;

    const dnaHash = String(row.dna_hash || '').trim();
    if (!dnaHash || dnaHash === 'calculating') {
      throw new Error('Forbidden: Valid SHA-256 hash required for Scout Queue upload.');
    }

    const { data: existingVer } = await gameDb
      .from('mod_versions')
      .select('id, mod_id, mods(compliance_tier, status)')
      .eq('dna_hash', dnaHash)
      .maybeSingle();

    const parentMod = Array.isArray(existingVer?.mods)
      ? existingVer.mods[0]
      : existingVer?.mods;
    if (existingVer && parentMod && Number(parentMod.compliance_tier || 0) !== 0) {
      throw new Error('Forbidden: Non-Tier-0 hashes cannot be submitted to Scout Queue.');
    }

    const isKnownApprovedTier0 =
      Boolean(existingVer && parentMod) &&
      Number(parentMod.compliance_tier || 0) === 0 &&
      !['unverified', 'rejected'].includes(
        String(parentMod.status || '').trim().toLowerCase()
      );

    if (!isKnownApprovedTier0) {
      const hasPass =
        isValidPassingLabCertProof(certProof, dnaHash) ||
        (await hasExistingCloudPassingLabReceipt(gameDb, dnaHash, existingVer?.id));
      if (!hasPass) {
        throw new Error(
          'Forbidden: Unknown Tier 0 Scout Queue uploads require a passing 4-stage Lab test.'
        );
      }
    }
  } else if (cleanTable === 'mods') {
    const tier = Number(row.compliance_tier || 0);
    if (!Number.isFinite(tier) || tier < 0 || tier >= 5) {
      throw new Error('Forbidden: Invalid compliance tier.');
    }
    if (tier >= 1 && tier <= 4) {
      row.compliance_tier = Math.min(4, Math.max(1, Math.round(tier)));
      row.status = 'pending';
    }
  } else if (cleanTable === 'mod_versions') {
    const dnaHash = String(row.dna_hash || '').trim();
    if (!row.mod_id || !dnaHash || dnaHash === 'calculating') {
      throw new Error('Forbidden: mod_id and valid dna_hash are required.');
    }
    const [{ data: parentMod }, { data: existingVer }] = await Promise.all([
      gameDb
        .from('mods')
        .select('id, compliance_tier, status')
        .eq('id', row.mod_id)
        .maybeSingle(),
      gameDb
        .from('mod_versions')
        .select('id, mod_id')
        .eq('dna_hash', dnaHash)
        .maybeSingle(),
    ]);

    if (!parentMod) {
      throw new Error('Forbidden: Parent artifact record does not exist.');
    }
    const tier = Number(parentMod.compliance_tier || 0);
    const statusLower = String(parentMod.status || '').trim().toLowerCase();
    const isKnownApprovedTier0 =
      Boolean(existingVer) &&
      tier === 0 &&
      statusLower !== 'unverified' &&
      statusLower !== 'rejected';

    if (tier === 0 && !isKnownApprovedTier0) {
      const hasPass =
        isValidPassingLabCertProof(certProof, dnaHash) ||
        (await hasExistingCloudPassingLabReceipt(gameDb, dnaHash, existingVer?.id));
      if (!hasPass) {
        throw new Error(
          'Forbidden: Unknown Tier 0 Creator Queue uploads require a passing 4-stage Lab test.'
        );
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, SERVER_AUTH_OPTS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, SERVER_AUTH_OPTS)

    const body = await req.json()
    const { game_id, action, payload } = body

    if (!action) {
      throw new Error('Missing action')
    }

    const authHeader = req.headers.get('Authorization')
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : ''

    let user: any = null
    let authError: any = null
    if (token && token.includes('.')) {
      const authRes = await supabaseClient.auth.getUser(token)
      user = authRes?.data?.user ?? null
      authError = authRes?.error ?? null
    }

    // Special Hub-wide action: WebAuthn Assertion Verification
    if (action === 'verify_webauthn_assertion') {
      const { challenge_id, credential } = payload || {}
      if (!challenge_id || !credential?.response) {
        throw new Error('Missing WebAuthn challenge_id or credential response')
      }

      const { data: challengeSnap } = await supabaseAdmin.rpc('internal_get_webauthn_challenge', {
        p_challenge_id: challenge_id,
      })

      const gotrueHeaders: Record<string, string> = {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      }
      const nativeRes = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/verify`, {
        method: 'POST',
        headers: gotrueHeaders,
        body: JSON.stringify({ challenge_id, credential }),
      })
      const nativeJson = await nativeRes.json().catch(() => ({}))
      if (nativeRes.ok) {
        const verifiedUid = user?.id || nativeJson?.user?.id
        if (verifiedUid) {
          try {
            let baseAppMeta = user?.app_metadata
            if (!baseAppMeta) {
              const { data: existingUsr } = await supabaseAdmin.auth.admin.getUserById(verifiedUid)
              baseAppMeta = existingUsr?.user?.app_metadata || {}
            }
            await supabaseAdmin.auth.admin.updateUserById(verifiedUid, {
              app_metadata: {
                ...(baseAppMeta || {}),
                last_passkey_verified_at: new Date().toISOString(),
              },
            })
          } catch {}
        }
        return new Response(JSON.stringify(nativeJson), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      if (!challengeSnap || challengeSnap.challenge_type !== 'authentication') {
        throw new Error(
          nativeJson?.msg ||
            nativeJson?.error_description ||
            nativeJson?.message ||
            'Passkey challenge expired or not found.'
        )
      }
      if (new Date(challengeSnap.expires_at).getTime() <= Date.now()) {
        throw new Error('Passkey authentication challenge has expired.')
      }

      const expectedChallenge = challengeSnap.session_data?.challenge
      const rpId = challengeSnap.session_data?.rpId || 'sanctuaryos.net'

      const clientDataBytes = b64UrlToBytes(credential.response.clientDataJSON)
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))
      if (clientData.type !== 'webauthn.get') {
        throw new Error('Invalid WebAuthn ceremony type.')
      }
      if (!expectedChallenge || clientData.challenge !== expectedChallenge) {
        throw new Error('WebAuthn challenge mismatch.')
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new Error(`Origin ${clientData.origin} is not authorized for RP ID ${rpId}.`)
      }

      const authDataBytes = b64UrlToBytes(credential.response.authenticatorData)
      if (authDataBytes.length < 37) {
        throw new Error('Invalid authenticatorData length.')
      }

      const rpHashValid = await matchesAllowedRpIdHash(authDataBytes, rpId, clientData.origin)
      if (!rpHashValid) {
        throw new Error('WebAuthn RP ID hash mismatch.')
      }

      const flags = authDataBytes[32]
      if ((flags & 0x01) === 0) {
        throw new Error('WebAuthn User Present flag not set.')
      }

      const signCount =
        ((authDataBytes[33] << 24) >>> 0) +
        ((authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36])

      const credIdB64 = bytesToB64(b64UrlToBytes(credential.rawId || credential.id))
      const { data: credRow } = await supabaseAdmin.rpc('internal_get_webauthn_credential', {
        p_credential_id_b64: credIdB64,
      })

      if (!credRow || !credRow.public_key_b64) {
        throw new Error('Passkey credential is not registered to any account.')
      }

      if (user?.id && credRow.user_id !== user.id) {
        throw new Error('This Passkey belongs to a different account.')
      }
      if (challengeSnap.user_id && credRow.user_id !== challengeSnap.user_id) {
        throw new Error('Passkey user mismatch for active challenge.')
      }

      // Enforce WebAuthn signature counter monotonicity (clone detection)
      const prevSignCount = Number(credRow.sign_count || 0)
      if (prevSignCount > 0 && signCount > 0 && signCount <= prevSignCount) {
        throw new Error('Passkey signature counter anomaly detected (possible cloned authenticator).')
      }

      const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes))
      const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length)
      signedData.set(authDataBytes, 0)
      signedData.set(clientDataHash, authDataBytes.length)

      const sigBytes = b64UrlToBytes(credential.response.signature)
      const pubKeyBytes = b64UrlToBytes(credRow.public_key_b64)
      const isValidSig = await verifyCoseSignature(pubKeyBytes, signedData, sigBytes)
      if (!isValidSig) {
        throw new Error('Credential verification failed: invalid cryptographic signature.')
      }

      await supabaseAdmin.rpc('internal_complete_webauthn_authentication', {
        p_challenge_id: challenge_id,
        p_cred_row_id: credRow.id,
        p_sign_count: signCount,
      })

      const { data: targetUserRes } = await supabaseAdmin.auth.admin.getUserById(credRow.user_id)
      const existingAppMeta = user?.app_metadata || targetUserRes?.user?.app_metadata || {}

      try {
        await supabaseAdmin.auth.admin.updateUserById(credRow.user_id, {
          app_metadata: {
            ...existingAppMeta,
            last_passkey_verified_at: new Date().toISOString(),
          },
        })
      } catch {}

      if (!user) {
        const targetEmail = targetUserRes?.user?.email
        if (targetEmail) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: targetEmail,
          })
          const hashedToken = linkData?.properties?.hashed_token
          if (hashedToken) {
            const { data: otpData } = await supabaseClient.auth.verifyOtp({
              token_hash: hashedToken,
              type: 'magiclink',
            })
            if (otpData?.session) {
              return new Response(
                JSON.stringify({
                  ...otpData.session,
                  user: otpData.user || targetUserRes.user,
                  passkey_verified: true,
                  passkey_id: credRow.id,
                }),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200,
                }
              )
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          verified: true,
          passkey_verified: true,
          passkey_id: credRow.id,
          user: user || { id: credRow.user_id },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // All remaining actions require an authenticated OS user
    if (authError || !user) {
      throw new Error('Unauthorized on OS DB: ' + (authError?.message || 'No user'))
    }

    const v_user_id = user.id;

    // Special Hub-wide action: WebAuthn Registration Verification
    if (action === 'verify_webauthn_registration') {
      const { challenge_id, credential, friendly_name } = payload || {}
      if (!challenge_id || !credential?.response) {
        throw new Error('Missing WebAuthn challenge_id or credential response')
      }

      const { data: challengeSnap } = await supabaseAdmin.rpc('internal_get_webauthn_challenge', {
        p_challenge_id: challenge_id,
      })

      const gotrueHeaders: Record<string, string> = {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }

      try {
        const existingRes = await fetch(`${supabaseUrl}/auth/v1/passkeys`, {
          method: 'GET',
          headers: gotrueHeaders,
        })
        if (existingRes.ok) {
          const existingJson = await existingRes.json().catch(() => [])
          const existingList = Array.isArray(existingJson)
            ? existingJson
            : Array.isArray(existingJson?.passkeys)
              ? existingJson.passkeys
              : []
          if (existingList.length > 0) {
            const lastVerifiedIso = user?.app_metadata?.last_passkey_verified_at
            const lastVerifiedMs = lastVerifiedIso ? new Date(lastVerifiedIso).getTime() : 0
            const TwelveHoursMs = 12 * 60 * 60 * 1000
            if (!lastVerifiedMs || Date.now() - lastVerifiedMs > TwelveHoursMs) {
              throw new Error(
                'Security Lock: An active FIDO2 Passkey is already registered on this account. Authenticate with your existing Passkey before registering an additional Passkey.'
              )
            }
          }
        }
      } catch (stepUpCheckErr: any) {
        if (String(stepUpCheckErr?.message || '').includes('Security Lock:')) {
          throw stepUpCheckErr
        }
      }

      const nativeRes = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/verify`, {
        method: 'POST',
        headers: gotrueHeaders,
        body: JSON.stringify({ challenge_id, credential }),
      })
      const nativeJson = await nativeRes.json().catch(() => ({}))
      if (nativeRes.ok) {
        if (nativeJson?.id && friendly_name) {
          try {
            await fetch(`${supabaseUrl}/auth/v1/passkeys/${nativeJson.id}`, {
              method: 'PATCH',
              headers: gotrueHeaders,
              body: JSON.stringify({ friendly_name }),
            })
            nativeJson.friendly_name = friendly_name
          } catch {}
        }
        return new Response(JSON.stringify(nativeJson), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      if (
        !challengeSnap ||
        challengeSnap.challenge_type !== 'registration' ||
        challengeSnap.user_id !== v_user_id
      ) {
        throw new Error(
          nativeJson?.msg ||
            nativeJson?.error_description ||
            nativeJson?.message ||
            'Passkey registration challenge expired or invalid.'
        )
      }
      if (new Date(challengeSnap.expires_at).getTime() <= Date.now()) {
        throw new Error('Passkey registration challenge has expired.')
      }

      const expectedChallenge = challengeSnap.session_data?.challenge
      const rpId = challengeSnap.session_data?.rpId || 'sanctuaryos.net'

      const clientDataBytes = b64UrlToBytes(credential.response.clientDataJSON)
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))
      if (clientData.type !== 'webauthn.create') {
        throw new Error('Invalid WebAuthn registration ceremony type.')
      }
      if (!expectedChallenge || clientData.challenge !== expectedChallenge) {
        throw new Error('WebAuthn registration challenge mismatch.')
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new Error(`Origin ${clientData.origin} is not authorized for RP ID ${rpId}.`)
      }

      const attObjBytes = b64UrlToBytes(credential.response.attestationObject)
      const { value: attMap } = decodeCborItem(attObjBytes, 0)
      const fmt = String(attMap.get('fmt') || 'none')
      const authDataBytes = attMap.get('authData') as Uint8Array
      if (!authDataBytes || authDataBytes.length < 55) {
        throw new Error('Invalid attestation authData.')
      }

      const regRpHashValid = await matchesAllowedRpIdHash(authDataBytes, rpId, clientData.origin)
      if (!regRpHashValid) {
        throw new Error('WebAuthn registration RP ID hash mismatch.')
      }

      const flags = authDataBytes[32]
      if ((flags & 0x01) === 0 || (flags & 0x40) === 0) {
        throw new Error('WebAuthn registration missing required authenticator flags.')
      }

      const backupEligible = (flags & 0x08) !== 0
      const backedUp = (flags & 0x10) !== 0
      const signCount =
        ((authDataBytes[33] << 24) >>> 0) +
        ((authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36])
      const aaguid = formatUuidFromBytes(authDataBytes.subarray(37, 53))
      const credIdLen = (authDataBytes[53] << 8) | authDataBytes[54]
      const credIdBytes = authDataBytes.subarray(55, 55 + credIdLen)
      const pubKeyCborBytes = authDataBytes.subarray(55 + credIdLen)

      const { value: coseMap } = decodeCborItem(pubKeyCborBytes, 0)
      if (!coseMap || typeof coseMap.get !== 'function' || !coseMap.get(1)) {
        throw new Error('Invalid COSE public key in attestation.')
      }

      const transports = Array.isArray(credential?.response?.transports)
        ? credential.response.transports
        : ['internal', 'hybrid']

      const { data: createdPasskey, error: regErr } = await supabaseAdmin.rpc(
        'internal_complete_webauthn_registration',
        {
          p_challenge_id: challenge_id,
          p_user_id: v_user_id,
          p_credential_id_b64: bytesToB64(credIdBytes),
          p_public_key_b64: bytesToB64(pubKeyCborBytes),
          p_attestation_type: fmt,
          p_aaguid: aaguid,
          p_sign_count: signCount,
          p_transports: transports,
          p_backup_eligible: backupEligible,
          p_backed_up: backedUp,
          p_friendly_name: friendly_name || 'FIDO2 Passkey',
        }
      )
      if (regErr) throw regErr

      return new Response(JSON.stringify(createdPasskey), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Fetch authoritative Hub Profile for caller
    const { data: hubProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role, is_banned, blacklist_reason')
      .eq('id', v_user_id)
      .maybeSingle()

    const hubUsername = hubProfile?.username || user.user_metadata?.username || ('Citizen_' + v_user_id.substring(0, 6))
    const hubRole = (hubProfile?.role || 'citizen').toLowerCase()
    const hubIsBanned = hubProfile?.is_banned ?? false
    const hubBlacklistReason = hubProfile?.blacklist_reason ?? null

    // Keeper-only action: create or update a Spoke Game entry while envelope-encrypting and Vault-sealing credentials in sanctuary_internal.spoke_credentials
    if (action === 'keeper_upsert_game') {
      if (hubRole !== 'keeper' || hubIsBanned) {
        throw new Error('Forbidden: Only Keepers can register or update Spoke Game configurations')
      }
      const {
        id: targetGameUuid,
        name,
        schema_id,
        supabase_url,
        supabase_anon_key,
        spoke_gateway_token,
        supabase_service_key,
        icon,
        is_active,
        is_keepers_only,
        clear_service_key,
      } = payload || {}

      const cleanName = String(name || '').trim()
      const cleanSchemaId = String(schema_id || '').trim().toUpperCase()
      const cleanUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      const cleanAnon = String(supabase_anon_key || '').trim()
      const cleanCredential = String(spoke_gateway_token || supabase_service_key || '').trim()

      if (!cleanName || !cleanSchemaId || !cleanUrl || !cleanAnon) {
        throw new Error('Missing required Spoke Game fields (name, schema_id, supabase_url, supabase_anon_key)')
      }
      if (!SUPABASE_URL_REGEX.test(cleanUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      let existingGameRow: any = null
      let existingCredRow: any = null
      if (targetGameUuid && UUID_REGEX.test(String(targetGameUuid))) {
        const { data: exGame, error: exErr } = await supabaseAdmin
          .from('sanctuary_games')
          .select('id, schema_id, supabase_url')
          .eq('id', targetGameUuid)
          .maybeSingle()
        if (exErr) throw exErr
        existingGameRow = exGame

        const { data: exCredRows } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
          p_game_id: targetGameUuid,
        })
        existingCredRow = Array.isArray(exCredRows) ? exCredRows[0] : exCredRows

        if (
          existingGameRow &&
          existingCredRow?.envelope_ciphertext &&
          clear_service_key !== true &&
          !cleanCredential &&
          normalizeSpokeUrl(existingGameRow.supabase_url) !== normalizeSpokeUrl(cleanUrl)
        ) {
          throw new Error('Changing Spoke URL requires re-entering or rotating the Spoke credential')
        }
      }

      const publicRow: Record<string, any> = {
        name: cleanName,
        schema_id: cleanSchemaId,
        supabase_url: cleanUrl,
        supabase_anon_key: cleanAnon,
        icon: icon ?? '',
        is_active: is_active !== undefined ? Boolean(is_active) : true,
      }
      if (is_keepers_only !== undefined) publicRow.is_keepers_only = Boolean(is_keepers_only)

      let savedGame: any = null
      if (targetGameUuid && UUID_REGEX.test(String(targetGameUuid))) {
        const { data, error } = await supabaseAdmin
          .from('sanctuary_games')
          .update(publicRow)
          .eq('id', targetGameUuid)
          .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only, created_at')
          .single()
        if (error) throw error
        savedGame = data
      } else {
        const { data, error } = await supabaseAdmin
          .from('sanctuary_games')
          .insert([publicRow])
          .select('id, name, schema_id, supabase_url, supabase_anon_key, icon, is_active, is_keepers_only, created_at')
          .single()
        if (error) throw error
        savedGame = data
      }

      if (savedGame?.id) {
        if (clear_service_key === true) {
          const { error: delErr } = await supabaseAdmin.rpc('internal_delete_spoke_credential', {
            p_game_id: savedGame.id,
          })
          if (delErr) throw delErr
        } else if (cleanCredential) {
          const credKind = detectCredentialKind(cleanCredential)
          const { envelope, keyVersion } = await sealSpokeEnvelope(cleanCredential, {
            gameId: savedGame.id,
            schemaId: savedGame.schema_id,
            supabaseUrl: savedGame.supabase_url,
          })
          const { error: upsErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
            p_game_id: savedGame.id,
            p_envelope_ciphertext: envelope,
            p_key_version: keyVersion,
            p_credential_kind: credKind,
            p_key_fingerprint: maskCredentialFingerprint(cleanCredential),
          })
          if (upsErr) throw upsErr
        } else if (
          existingGameRow &&
          existingCredRow?.envelope_ciphertext &&
          String(existingGameRow.schema_id || '').trim().toUpperCase() !== savedGame.schema_id
        ) {
          const plainCred = await openSpokeEnvelope(existingCredRow.envelope_ciphertext, {
            gameId: savedGame.id,
            schemaId: String(existingGameRow.schema_id || ''),
            supabaseUrl: String(existingGameRow.supabase_url || ''),
          })
          const { envelope, keyVersion } = await sealSpokeEnvelope(plainCred, {
            gameId: savedGame.id,
            schemaId: savedGame.schema_id,
            supabaseUrl: savedGame.supabase_url,
          })
          const { error: rewrapErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
            p_game_id: savedGame.id,
            p_envelope_ciphertext: envelope,
            p_key_version: keyVersion,
            p_credential_kind: detectCredentialKind(plainCred),
            p_key_fingerprint: maskCredentialFingerprint(plainCred),
          })
          if (rewrapErr) throw rewrapErr
        }
      }

      const { data: metaRows } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
        p_game_id: savedGame.id,
      })
      const metaRow = Array.isArray(metaRows) ? metaRows[0] : metaRows

      invalidateSpokeGameConfigCache();
      return new Response(
        JSON.stringify({
          success: true,
          game: {
            ...savedGame,
            has_service_key: Boolean(metaRow?.envelope_ciphertext),
            credential_kind: metaRow?.credential_kind || null,
            key_version: metaRow?.key_version || null,
            key_fingerprint: metaRow?.key_fingerprint || '',
            rotated_at: metaRow?.rotated_at || null,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Keeper-only action: list non-secret encryption metadata for all Spoke credentials
    if (action === 'keeper_list_spoke_credentials_meta') {
      if (hubRole !== 'keeper' || hubIsBanned) {
        throw new Error('Forbidden: Only Keepers can inspect Spoke credential status metadata')
      }
      const { data: credRows, error: listErr } = await supabaseAdmin.rpc('internal_list_spoke_credentials')
      if (listErr) throw listErr
      const credentials: Record<string, any> = {}
      for (const row of (credRows || [])) {
        if (!row?.game_id) continue
        credentials[row.game_id] = {
          has_credential: Boolean(row.envelope_ciphertext),
          credential_kind: row.credential_kind || null,
          key_version: row.key_version || null,
          key_fingerprint: row.key_fingerprint || '',
          rotated_at: row.rotated_at || null,
          updated_at: row.updated_at || null,
        }
      }
      return new Response(JSON.stringify({ success: true, credentials }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Special Hub-wide action: propagate a user's Hub username / global ban to all active Spokes
    if (action === 'sync_hub_ban_to_spokes') {
      if (hubRole !== 'keeper' && payload?.target_user_id !== v_user_id) {
        throw new Error('Forbidden: Only Keepers can propagate global profile updates')
      }
      const targetUserId = payload?.target_user_id || v_user_id
      const { data: targetHubProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, username, is_banned, blacklist_reason')
        .eq('id', targetUserId)
        .maybeSingle()

      if (targetHubProfile) {
        const { data: allGames } = await supabaseAdmin
          .from('sanctuary_games')
          .select('id, schema_id, supabase_url, supabase_anon_key')
          .eq('is_active', true)

        const { data: allSecrets } = await supabaseAdmin.rpc('internal_list_spoke_credentials')

        const secretMap = new Map<string, string>()
        for (const s of (allSecrets || [])) {
          if (s?.game_id && s?.envelope_ciphertext) {
            secretMap.set(s.game_id, s.envelope_ciphertext)
          }
        }

        for (const g of (allGames || [])) {
          const envCipher = secretMap.get(g.id)
          if (!g.supabase_url || !envCipher) continue
          try {
            const plainCred = await openSpokeEnvelope(envCipher, {
              gameId: String(g.id),
              schemaId: String(g.schema_id || ''),
              supabaseUrl: String(g.supabase_url || ''),
            })
            const spokeClient = createSpokeClient(g.supabase_url, g.supabase_anon_key || '', plainCred)
            await spokeClient
              .from('profiles')
              .update({
                username: targetHubProfile.username,
                is_banned: targetHubProfile.is_banned ?? false,
                blacklist_reason: targetHubProfile.blacklist_reason ?? null
              })
              .eq('id', targetUserId)
          } catch (e) {
            console.error('Failed to sync ban to spoke:', g.supabase_url, e)
          }
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Special Hub-wide action: test Spoke connection, verify schema.sql tables, seed network status, and bootstrap Founding Wayfinder
    if (action === 'verify_and_bootstrap_spoke' || action === 'keeper_verify_spoke_handshake') {
      if (hubRole !== 'keeper') {
        throw new Error('Forbidden: Only Keepers can verify and bootstrap Spoke uplinks')
      }
      const {
        game_id: existingGameId,
        supabase_url,
        supabase_anon_key,
        spoke_gateway_token,
        supabase_service_key,
        founder_identifier,
      } = payload || {}

      let resolvedServiceKey = String(spoke_gateway_token || supabase_service_key || '').trim()
      let resolvedUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      let resolvedAnonKey = String(supabase_anon_key || '').trim()

      if ((!resolvedServiceKey || !resolvedUrl || !resolvedAnonKey) && (existingGameId || game_id)) {
        const lookup = await resolveGameWithServiceKey(supabaseAdmin, String(existingGameId || game_id))
        if (lookup.game) {
          if (!resolvedUrl) resolvedUrl = String(lookup.game.supabase_url || '').trim().replace(/\/+$/, '')
          if (!resolvedAnonKey) resolvedAnonKey = String(lookup.game.supabase_anon_key || '').trim()
          if (
            !resolvedServiceKey &&
            lookup.serviceKey &&
            normalizeSpokeUrl(resolvedUrl) === normalizeSpokeUrl(lookup.game.supabase_url)
          ) {
            resolvedServiceKey = lookup.serviceKey
          }
        }
      }

      if (!resolvedUrl || (!resolvedServiceKey && !resolvedAnonKey)) {
        throw new Error('Missing Spoke Supabase URL or Key')
      }
      if (!SUPABASE_URL_REGEX.test(resolvedUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      const startPing = Date.now()
      const testDb = resolvedServiceKey
        ? createSpokeClient(resolvedUrl, resolvedAnonKey, resolvedServiceKey)
        : createClient(resolvedUrl, resolvedAnonKey, SERVER_AUTH_OPTS)
      let handshakeAuthMode = resolvedServiceKey ? detectCredentialKind(resolvedServiceKey) : 'anon_read_only'
      if (resolvedServiceKey) {
        const hs = await verifySpokeCredentialHandshake(testDb, detectCredentialKind(resolvedServiceKey))
        handshakeAuthMode = hs.authMode
      }
      const requiredTables = ['mods', 'profiles', 'system_broadcasts', 'dispatch_poll_votes', 'known_exception_rules', 'dlc_registry', 'global_network_status', 'audit_logs']
      const missingTables: string[] = []

      for (const tbl of requiredTables) {
        const { error: tblErr } = await testDb.from(tbl).select('*', { count: 'exact', head: true }).limit(1)
        if (tblErr && (tblErr.code === '42P01' || tblErr.message?.includes('does not exist') || tblErr.message?.includes('schema cache'))) {
          missingTables.push(tbl)
        }
      }

      const latencyMs = Date.now() - startPing

      if (missingTables.length === 0 && resolvedServiceKey) {
        await testDb.from('global_network_status').upsert({
          id: 1,
          defcon_level: 5,
          status_message: 'Network Secure. All systems nominal.'
        }, { onConflict: 'id' })
      }

      let wayfinderProvisioned: string | null = null
      if (founder_identifier && String(founder_identifier).trim() && resolvedServiceKey && missingTables.length === 0) {
        const cleanFounder = String(founder_identifier).trim()
        let founderHub: any = null
        if (UUID_REGEX.test(cleanFounder)) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .eq('id', cleanFounder)
            .maybeSingle()
          founderHub = data
        } else {
          const { data: byUsername } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .ilike('username', cleanFounder)
            .maybeSingle()
          if (byUsername) {
            founderHub = byUsername
          } else {
            const { data: byEmail } = await supabaseAdmin
              .from('profiles')
              .select('id, username, is_banned, blacklist_reason')
              .ilike('email', cleanFounder)
              .maybeSingle()
            founderHub = byEmail
          }
        }
        if (founderHub) {
          const { error: wfErr } = await testDb.from('profiles').upsert({
            id: founderHub.id,
            username: founderHub.username || ('Wayfinder_' + founderHub.id.substring(0, 6)),
            role: 'wayfinder',
            is_banned: founderHub.is_banned ?? false,
            blacklist_reason: founderHub.blacklist_reason ?? null
          }, { onConflict: 'id' })
          if (!wfErr) {
            wayfinderProvisioned = founderHub.username || founderHub.id
          }
        }
      }

      return new Response(JSON.stringify({
        success: missingTables.length === 0,
        schema_ready: missingTables.length === 0,
        missing_tables: missingTables,
        wayfinder_provisioned: wayfinderProvisioned,
        auth_mode: handshakeAuthMode,
        latency_ms: latencyMs
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!game_id) {
      throw new Error('Missing game_id')
    }

    // 4. Resolve Target Spoke DB Configuration & Split-Custody Envelope Credential
    const {
      game,
      serviceKey: gameServiceKey,
      credentialKind: resolvedCredentialKind,
      keyVersion: resolvedKeyVersion,
      keyFingerprint: resolvedKeyFingerprint,
      rotatedAt: resolvedRotatedAt,
      error: gameError,
    } = await resolveGameWithServiceKey(
      supabaseAdmin,
      String(game_id)
    )

    if (gameError || !game) {
      throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    }

    if (game.is_keepers_only === true && hubRole !== 'keeper') {
      throw new Error('Forbidden: This Spoke is restricted to Keepers Core')
    }

    if (action === 'get_spoke_credential_status' && !gameServiceKey) {
      let isSpokeWayfinder = false
      if (hubRole !== 'keeper' && game.supabase_url && game.supabase_anon_key) {
        try {
          const anonSpoke = createClient(game.supabase_url, game.supabase_anon_key, SERVER_AUTH_OPTS)
          const { data: spProf } = await anonSpoke.from('profiles').select('role, is_banned').eq('id', v_user_id).maybeSingle()
          isSpokeWayfinder = !spProf?.is_banned && String(spProf?.role || '').toLowerCase() === 'wayfinder'
        } catch {}
      }
      if (hubRole !== 'keeper' && !isSpokeWayfinder) {
        throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can inspect credential status')
      }
      return new Response(JSON.stringify({
        has_credential: false,
        credential_kind: null,
        key_version: null,
        key_fingerprint: '',
        rotated_at: null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (action === 'sever_spoke_cord' && hubRole === 'keeper') {
      const severReason = payload?.reason?.trim() || 'Keeper Severance Protocol (Cut the Cord)'
      if (gameServiceKey && SUPABASE_URL_REGEX.test(String(game.supabase_url || '').trim())) {
        try {
          const bestEffortSpokeDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)
          await bestEffortSpokeDb.from('audit_logs').insert({
            action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
          })
          await bestEffortSpokeDb.rpc('revoke_spoke_gateway_tokens')
        } catch (e) {
          console.warn('Best-effort Spoke audit/revoke warning on Keeper sever:', e)
        }
      }
      await supabaseAdmin
        .from('sanctuary_games')
        .update({ is_active: false })
        .eq('id', game.id)
      await supabaseAdmin.rpc('internal_delete_spoke_credential', { p_game_id: game.id })
      await supabaseAdmin.from('audit_logs').insert({
        action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
        target_table: 'sanctuary_games',
        target_name: game.name || game.schema_id,
        actor_id: v_user_id,
        reason: severReason,
        game_name: game.name || game.schema_id || 'Keeper Hub',
      })
      invalidateSpokeGameConfigCache();
      return new Response(JSON.stringify({ success: true, severed_by: 'keeper', schema_id: game.schema_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!gameServiceKey) {
      throw new Error('Game DB gateway credential not configured - connection rejected')
    }

    // 5. Initialize Spoke DB Client with Split-Custody Gateway Token (or legacy key)
    const gameDb = createSpokeClient(game.supabase_url, game.supabase_anon_key || '', gameServiceKey)

    // 6. Sync Caller's Hub Identity (id, username, is_banned, blacklist_reason) -> Spoke profiles
    const { data: existingSpokeProfile } = await gameDb
      .from('profiles')
      .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
      .eq('id', v_user_id)
      .maybeSingle()

    let callerSpokeProfile = existingSpokeProfile
    if (!existingSpokeProfile) {
      const { data: insertedProfile, error: insertErr } = await gameDb
        .from('profiles')
        .insert({
          id: v_user_id,
          username: hubUsername,
          role: 'citizen',
          is_banned: hubIsBanned,
          blacklist_reason: hubBlacklistReason
        })
        .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
        .maybeSingle()
      if (insertErr) console.error("Profile insert warning:", insertErr)
      callerSpokeProfile = insertedProfile || {
        id: v_user_id,
        username: hubUsername,
        role: 'citizen',
        is_banned: hubIsBanned,
        blacklist_reason: hubBlacklistReason,
        is_comm_banned: false,
        comm_blacklist_reason: null
      }
    } else if (
      existingSpokeProfile.username !== hubUsername ||
      (hubIsBanned && !existingSpokeProfile.is_banned)
    ) {
      const syncFields: Record<string, any> = { username: hubUsername }
      if (hubIsBanned) {
        syncFields.is_banned = true
        syncFields.blacklist_reason = hubBlacklistReason
      }
      const { data: updatedProfile, error: syncErr } = await gameDb
        .from('profiles')
        .update(syncFields)
        .eq('id', v_user_id)
        .select('id, username, role, is_banned, blacklist_reason, is_comm_banned, comm_blacklist_reason')
        .maybeSingle()
      if (syncErr) console.error("Profile sync warning:", syncErr)
      if (updatedProfile) callerSpokeProfile = updatedProfile
    }

    const callerSpokeRole = (callerSpokeProfile?.role || 'citizen').toLowerCase()
    const isCallerBanned = Boolean(hubIsBanned || callerSpokeProfile?.is_banned)
    const isFoundryTestNodeKeeper = hubRole === 'keeper' && Boolean(game?.is_keepers_only)
    const isCallerStaff = isFoundryTestNodeKeeper || STAFF_ROLES.includes(callerSpokeRole)
    const isCallerCreatorOrStaff = isFoundryTestNodeKeeper || CREATOR_OR_STAFF_ROLES.includes(callerSpokeRole)
    const isArchitectOnlyStaff =
      (callerSpokeRole === 'architect' || callerSpokeRole === 'senior_architect') &&
      !isFoundryTestNodeKeeper
    const isOversightOnlyStaff =
      callerSpokeRole === 'oversight' && !isFoundryTestNodeKeeper

    let cachedMasonIdsPromise: Promise<Set<string>> | null = null;
    async function getCallerOwnedMasonIds(): Promise<Set<string>> {
      if (!cachedMasonIdsPromise) {
        cachedMasonIdsPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
          return new Set((mRows || []).map((r: any) => String(r.id)))
        })();
      }
      return cachedMasonIdsPromise;
    }

    let cachedVerifiedMasonPromise: Promise<boolean> | null = null;
    async function getIsCallerVerifiedMason(): Promise<boolean> {
      if (!cachedVerifiedMasonPromise) {
        cachedVerifiedMasonPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
            .eq('is_verified', true)
            .limit(1)
          return Array.isArray(mRows) && mRows.length > 0
        })();
      }
      return cachedVerifiedMasonPromise;
    }

    async function assertOwnedCollectionSetId(
      setId: unknown,
      errorMessage = 'Forbidden: Collection set_id must belong to your Creator profile'
    ): Promise<void> {
      const cleanSetId = String(setId || '').trim()
      if (!cleanSetId) {
        throw new Error(errorMessage)
      }
      const ownedMasons = await getCallerOwnedMasonIds()
      const { data: colEx } = await gameDb
        .from('collections')
        .select('mason_id')
        .eq('id', cleanSetId)
        .maybeSingle()
      if (!colEx || !ownedMasons.has(String(colEx.mason_id))) {
        throw new Error(errorMessage)
      }
    }

    let resultData = null;

    // 7. Route actions
    switch (action) {
      case 'sync_spoke_profile': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (/^[0-9a-f]{64}$/.test(rawCommitment)) {
          try {
            await gameDb.rpc('internal_upsert_spoke_relink_commitment', {
              p_profile_id: v_user_id,
              p_commitment_hash: rawCommitment,
            })
          } catch (_e) {
            // Best-effort on Spokes running older schemas
          }
        }
        resultData = {
          ...callerSpokeProfile,
          os_role: hubRole
        }
        break;
      }
      case 'register_relink_commitment': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (!/^[0-9a-f]{64}$/.test(rawCommitment)) {
          throw new Error('Invalid SHA-256 relink commitment hash')
        }
        const { data: commitRes, error: commitErr } = await gameDb.rpc(
          'internal_upsert_spoke_relink_commitment',
          {
            p_profile_id: v_user_id,
            p_commitment_hash: rawCommitment,
          }
        )
        if (commitErr) throw commitErr
        resultData = commitRes || { ok: true }
        break;
      }
      case 'update_spoke_profile': {
        const { target_user_id, updates } = payload || {}
        if (!target_user_id || !updates) throw new Error('Missing target_user_id or updates')

        const isSelfBan = target_user_id === v_user_id && updates.is_banned === true && Object.keys(updates).every(k => ['is_banned', 'blacklist_reason'].includes(k))
        const isKeeperOrWayfinder = isFoundryTestNodeKeeper || callerSpokeRole === 'wayfinder'
        const isOversight = callerSpokeRole === 'oversight'
        const isArchitectMasonPromote = (callerSpokeRole === 'architect' || callerSpokeRole === 'senior_architect') && Object.keys(updates).length === 1 && updates.role === 'mason'

        if (!isSelfBan && !isKeeperOrWayfinder && !isOversight && !isArchitectMasonPromote) {
          throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
        }

        const { data: targetSpoke } = await gameDb
          .from('profiles')
          .select('id, role')
          .eq('id', target_user_id)
          .maybeSingle()

        if (isOversight && !isKeeperOrWayfinder) {
          if (['oversight', 'wayfinder', 'admin'].includes(targetSpoke?.role) || ['oversight', 'wayfinder', 'admin'].includes(updates.role)) {
            throw new Error('Forbidden: Oversight cannot modify Wayfinder, Admin, or Oversight roles')
          }
        }

        if (!targetSpoke) {
          const { data: targetHub } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .eq('id', target_user_id)
            .maybeSingle()
          if (targetHub) {
            await gameDb.from('profiles').insert({
              id: targetHub.id,
              username: targetHub.username || ('Citizen_' + targetHub.id.substring(0, 6)),
              role: 'citizen',
              is_banned: targetHub.is_banned ?? false,
              blacklist_reason: targetHub.blacklist_reason ?? null
            })
          }
        }

        const allowedFields: Record<string, any> = {}
        if (updates.role !== undefined && !isSelfBan) allowedFields.role = updates.role
        if (updates.is_banned !== undefined) allowedFields.is_banned = updates.is_banned
        if (updates.blacklist_reason !== undefined) allowedFields.blacklist_reason = updates.blacklist_reason
        if (updates.is_comm_banned !== undefined) allowedFields.is_comm_banned = updates.is_comm_banned
        if (updates.comm_blacklist_reason !== undefined) allowedFields.comm_blacklist_reason = updates.comm_blacklist_reason

        const { data: updatedRows, error: updateErr } = await gameDb
          .from('profiles')
          .update(allowedFields)
          .eq('id', target_user_id)
          .select()

        if (updateErr) throw updateErr

        if ((hubRole === 'keeper' || isSelfBan) && (updates.is_banned !== undefined || updates.blacklist_reason !== undefined)) {
          const hubBanUpdate: Record<string, any> = {}
          if (updates.is_banned !== undefined) hubBanUpdate.is_banned = updates.is_banned
          if (updates.blacklist_reason !== undefined) hubBanUpdate.blacklist_reason = updates.blacklist_reason
          await supabaseAdmin
            .from('profiles')
            .update(hubBanUpdate)
            .eq('id', target_user_id)
        }

        resultData = updatedRows
        break;
      }
      case 'follow_mason': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').insert({
          user_id: v_user_id,
          mason_id: mason_id
        })
        if (error && error.code !== '23505') throw error
        resultData = { success: true, following: true }
        break;
      }
      case 'unfollow_mason': {
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').delete()
          .match({ user_id: v_user_id, mason_id: mason_id })
        if (error) throw error
        resultData = { success: true, following: false }
        break;
      }
      case 'update_mason_profile': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id, profile_data } = payload || {}
        if (!mason_id || !profile_data || typeof profile_data !== 'object') {
          throw new Error('Missing mason_id or profile_data')
        }

        const { data: mason, error: masonError } = await gameDb
          .from('masons')
          .select('profile_id')
          .eq('id', mason_id)
          .single()

        if (masonError || !mason) throw new Error('Mason not found')
        const isOwner = mason.profile_id === v_user_id
        if (!isOwner && !isCallerStaff) {
          throw new Error('Forbidden: You do not own this mason profile')
        }

        const sanitizedData: Record<string, any> = {}
        const ownerAllowedKeys = [
          'name',
          'bio',
          'avatar_url',
          'patreon_url',
          'donation_url',
          'payment_processor',
          'patreon_campaign_id',
          'website_url',
          'discord_url',
          'pinned_mod_id',
          'pinned_asset_id',
          'pinned_blueprint_id',
          'pinned_collection_id',
        ]
        const staffExtraKeys = ['is_verified', 'profile_id', 'followers_count']
        const allowedKeys = isCallerStaff ? [...ownerAllowedKeys, ...staffExtraKeys] : ownerAllowedKeys

        const normalizedInput = normalizeSpokeTableRow('masons', profile_data)
        for (const k of allowedKeys) {
          if (normalizedInput[k] !== undefined) {
            sanitizedData[k] = normalizedInput[k]
          }
        }

        let updatedMason: any = null
        let updateError: any = null
        const masonPayload = { ...sanitizedData }
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await gameDb
            .from('masons')
            .update(masonPayload)
            .eq('id', mason_id)
            .select()
            .single()
          updatedMason = res.data
          updateError = res.error
          if (!updateError) break
          const missingColMatch = String(updateError.message || '').match(/Could not find the '([^']+)' column/i)
          if (missingColMatch && missingColMatch[1] && Object.prototype.hasOwnProperty.call(masonPayload, missingColMatch[1])) {
            delete masonPayload[missingColMatch[1]]
            continue
          }
          break
        }

        if (updateError) throw updateError
        resultData = updatedMason
        break;
      }
      case 'dispatch_broadcast_notifications': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const {
          mason_id,
          type = 'system_broadcast',
          reference_id = null,
          message = '',
          exclude_self = true,
        } = payload || {}

        const cleanMsg = String(message || '').trim()
        if (!cleanMsg) throw new Error('Missing notification message')

        let recipientIds: string[] = []
        if (mason_id) {
          if (!isCallerStaff) {
            const isVerifiedMason = await getIsCallerVerifiedMason()
            if (!isVerifiedMason) {
              throw new Error('Forbidden: Verified Creator status is required to dispatch Comm-Link follower notifications')
            }
            const ownedMasons = await getCallerOwnedMasonIds()
            if (!ownedMasons.has(String(mason_id))) {
              throw new Error('Forbidden: You can only notify followers of your own Creator profile')
            }
          }
          const { data: followerRows, error: folErr } = await gameDb
            .from('mason_followers')
            .select('user_id')
            .eq('mason_id', mason_id)
          if (folErr) throw folErr
          recipientIds = (followerRows || [])
            .map((r: any) => String(r.user_id || ''))
            .filter(Boolean)
        } else {
          if (!isCallerStaff) {
            throw new Error('Forbidden: Staff clearance required for community-wide broadcast notifications')
          }
          const { data: profRows, error: profErr } = await gameDb
            .from('profiles')
            .select('id')
            .eq('is_banned', false)
          if (profErr) throw profErr
          recipientIds = (profRows || [])
            .map((r: any) => String(r.id || ''))
            .filter(Boolean)
        }

        const uniqueRecipients = Array.from(new Set(recipientIds)).filter(
          (uid) => !exclude_self || uid !== v_user_id
        )

        let insertedCount = 0
        const CHUNK_SIZE = 500
        for (let i = 0; i < uniqueRecipients.length; i += CHUNK_SIZE) {
          const batch = uniqueRecipients.slice(i, i + CHUNK_SIZE).map((uid) => ({
            user_id: uid,
            actor_id: v_user_id,
            type: String(type),
            reference_id: reference_id || null,
            message: cleanMsg,
            is_read: false,
          }))
          const { error: insErr } = await gameDb.from('notifications').insert(batch)
          if (insErr) throw insErr
          insertedCount += batch.length
        }

        resultData = { success: true, dispatched: insertedCount }
        break;
      }
      case 'bulk_ingest_vault_mods': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const canBulkIngest = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canBulkIngest) {
          throw new Error('Forbidden: Verified Creator or Staff clearance required for bulk registry ingestion')
        }
        const items = Array.isArray(payload?.items) ? payload.items : []
        if (items.length === 0) {
          resultData = { success: true, processed: 0 }
          break
        }
        const { data: rpcRes, error: rpcErr } = await gameDb.rpc('bulk_ingest_vault_mods', {
          p_items: items,
        })
        if (rpcErr) throw rpcErr
        resultData = rpcRes
        break;
      }
      case 'upsert_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, payload_data } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || !payload_data) {
          throw new Error('Missing target_table or payload_data')
        }

        const restrictedTables = ['profiles', 'auth.users', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Insufficient permissions to modify ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (cleanTable === 'masons') {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
            }
          } else if (!isCallerStaff && !(await getIsCallerVerifiedMason())) {
            throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
          }
        } else if (!CITIZEN_TABLES.has(cleanTable)) {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const isArrayInput = Array.isArray(payload_data)
        const rawRows = (isArrayInput ? payload_data : [payload_data]).map((r) =>
          normalizeSpokeTableRow(cleanTable, r)
        )

        // Architects flagging Tier 1-4 on mods/collections always route to Oversight Compliance as 'pending'
        if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
          for (const row of rawRows) {
            if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
              row.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(row.compliance_tier))))
              row.status = 'pending'
            }
          }
        }

        // Oversight cannot link/unlink Mason entities belonging to Wayfinder/Oversight/Admin accounts
        if (isOversightOnlyStaff && cleanTable === 'masons') {
          for (const row of rawRows) {
            if (!row || typeof row !== 'object') continue
            if (row.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', row.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }
            if (row.id) {
              const { data: exMason } = await gameDb
                .from('masons')
                .select('profile_id')
                .eq('id', row.id)
                .maybeSingle()
              if (exMason?.profile_id) {
                const { data: exProf } = await gameDb
                  .from('profiles')
                  .select('role')
                  .eq('id', exMason.profile_id)
                  .maybeSingle()
                if (exProf && ['wayfinder', 'oversight', 'admin'].includes(String(exProf.role || '').toLowerCase())) {
                  throw new Error('Forbidden: Oversight cannot modify Creator records owned by Wayfinder or Oversight')
                }
              }
            }
          }
        }

        // Strict row-ownership & anti-IDOR enforcement for non-staff callers
        if (!isCallerStaff) {
          const ownedMasons =
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members' ||
            cleanTable === 'blueprints' ||
            cleanTable === 'mods'
              ? await getCallerOwnedMasonIds()
              : new Set<string>()

          for (const row of rawRows) {
            if (!row || typeof row !== 'object') {
              throw new Error('Invalid payload row')
            }

            if (cleanTable === 'audit_logs') {
              row.actor_id = v_user_id
              delete row.id
            } else if (cleanTable === 'mason_post_comments') {
              if (callerSpokeProfile?.is_comm_banned) {
                throw new Error('Forbidden: Community posting privileges are suspended')
              }
              row.author_id = v_user_id
              delete row.is_hidden
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('mason_post_comments')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen comment')
                }
              }
            } else if (
              cleanTable === 'mason_post_likes' ||
              cleanTable === 'mason_post_views' ||
              cleanTable === 'dispatch_poll_votes'
            ) {
              row.user_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('user_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot modify another citizen record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'blueprints') {
              if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                throw new Error('Forbidden: Blueprint mason_id must belong to caller')
              }
              if (!row.mason_id) {
                row.mason_id = v_user_id
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('blueprints')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.mason_id !== v_user_id && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Blueprint')
                }
              }
              if (row.code) {
                const { data: exByCode } = await gameDb
                  .from('blueprints')
                  .select('id, mason_id')
                  .eq('code', row.code)
                  .maybeSingle()
                if (exByCode && exByCode.mason_id !== v_user_id && !ownedMasons.has(String(exByCode.mason_id))) {
                  throw new Error('Forbidden: Blueprint code belongs to another citizen')
                }
              }
            } else if (cleanTable === 'nexus_assets') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
              }
              row.author_id = v_user_id
              delete row.is_community_default
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('nexus_assets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Nexus asset')
                }
              }
            } else if (cleanTable === 'sanctuary_tickets') {
              row.author_id = v_user_id
              delete row.assigned_to
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('sanctuary_tickets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen ticket')
                }
              }
            } else if (
              cleanTable === 'content_flags' ||
              cleanTable === 'nexus_reports' ||
              cleanTable === 'blueprint_reports'
            ) {
              row.reporter_id = v_user_id
              delete row.resolved_by
              delete row.resolution_note
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('reporter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.reporter_id && ex.reporter_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot overwrite another report in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'scout_suggestions') {
              row.submitter_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('scout_suggestions')
                  .select('submitter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.submitter_id && ex.submitter_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Scout suggestion')
                }
              }
            } else if (cleanTable === 'notifications') {
              row.actor_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('notifications')
                  .select('user_id, actor_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id && ex.actor_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen notification')
                }
              }
            } else if (cleanTable === 'citizen_staging_queue') {
              if (!row.user_token || String(row.user_token).length < 16) {
                throw new Error('Invalid staging token')
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('citizen_staging_queue')
                  .select('user_token')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_token !== row.user_token) {
                  throw new Error('Forbidden: Staging token mismatch')
                }
              }
            } else if (cleanTable === 'masons') {
              delete row.is_verified
              delete row.followers_count
              if (row.id) {
                if (!ownedMasons.has(String(row.id))) {
                  throw new Error('Forbidden: You can only update your own Creator profile')
                }
              }
              row.profile_id = v_user_id
            } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error(
                  cleanTable === 'mason_posts'
                    ? 'Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches'
                    : 'Forbidden: Verified Creator status is required to publish or update Nexus collections'
                )
              }
              if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
              }
              if (cleanTable === 'collections') {
                delete row.is_official
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: Cannot overwrite another Creator record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'collection_members') {
              await assertOwnedCollectionSetId(row.set_id)
              if (row.id) {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMember?.set_id && String(exMember.set_id) !== String(row.set_id)) {
                  await assertOwnedCollectionSetId(exMember.set_id)
                }
              }
            } else if (cleanTable === 'mods') {
              if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                delete row.highlander_group_id
              }
              if (row.id) {
                const { data: exMod } = await gameDb
                  .from('mods')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMod?.mason_id && !ownedMasons.has(String(exMod.mason_id))) {
                  const { data: ownerMason } = await gameDb
                    .from('masons')
                    .select('profile_id')
                    .eq('id', exMod.mason_id)
                    .maybeSingle()
                  if (ownerMason?.profile_id && ownerMason.profile_id !== v_user_id) {
                    throw new Error('Forbidden: Cannot overwrite an artifact owned by another claimed Creator')
                  }
                }
              }
            }
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, false)
          }
        } else {
          for (const row of rawRows) {
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
          }
        }

        let currentPayload: any = isArrayInput ? rawRows : rawRows[0]
        let data: any = null
        let error: any = null

        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await gameDb
            .from(cleanTable)
            .upsert(currentPayload)
            .select()
          data = res.data
          error = res.error
          if (!error) break
          const missingColMatch = String(error.message || '').match(/Could not find the '([^']+)' column/i)
          const missingCol = missingColMatch?.[1]
          if (missingCol) {
            if (Array.isArray(currentPayload)) {
              currentPayload = currentPayload.map((row) => {
                if (row && typeof row === 'object') {
                  const next = { ...row }
                  delete next[missingCol]
                  return next
                }
                return row
              })
              continue
            } else if (currentPayload && typeof currentPayload === 'object' && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
              if (missingCol === 'image_url' && currentPayload.image_url && typeof currentPayload.content === 'string') {
                currentPayload.content = `[IMG:${currentPayload.image_url}]\n\n` + currentPayload.content
              }
              delete currentPayload[missingCol]
              continue
            }
          }
          break
        }

        if (error) {
          if (error.code === '23505' && cleanTable === 'mason_post_views') {
            resultData = [payload_data]
          } else {
            throw error
          }
        } else {
          resultData = data
        }
        break;
      }
      case 'delete_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, id_value } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || id_value === undefined || id_value === null) {
          throw new Error('Missing target_table or id_value')
        }

        const restrictedTables = ['profiles', 'auth.users', 'audit_logs', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members'
          ) {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to delete from ${cleanTable}`)
            }
            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'masons') {
                if (!ownedMasons.has(String(id_value))) {
                  throw new Error('Forbidden: You can only delete your own Creator profile')
                }
              } else if (cleanTable === 'collection_members') {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', id_value)
                  .maybeSingle()
                const { data: exCol } = exMember?.set_id
                  ? await gameDb
                      .from('collections')
                      .select('mason_id')
                      .eq('id', exMember.set_id)
                      .maybeSingle()
                  : { data: null }
                if (!exMember?.set_id || !exCol || !ownedMasons.has(String(exCol.mason_id))) {
                  throw new Error('Forbidden: You can only delete members of your own collections')
                }
              } else {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', id_value)
                  .maybeSingle()
                if (!ex || !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
                }
              }
            }
          } else if (!isCallerStaff && !(await getIsCallerVerifiedMason())) {
            throw new Error(`Forbidden: Verified Creator or Staff clearance required to delete from ${cleanTable}`)
          }
        } else if (CITIZEN_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            const ownerColumnMap: Record<string, string> = {
              mason_post_comments: 'author_id',
              mason_post_likes: 'user_id',
              dispatch_poll_votes: 'user_id',
              blueprints: 'mason_id',
              nexus_assets: 'author_id',
              sanctuary_tickets: 'author_id',
              notifications: 'user_id',
            }
            const ownerCol = ownerColumnMap[cleanTable]
            if (ownerCol) {
              const { data: existingRow } = await gameDb
                .from(cleanTable)
                .select(ownerCol)
                .eq('id', id_value)
                .maybeSingle()
              const ownedMasons = cleanTable === 'blueprints' ? await getCallerOwnedMasonIds() : new Set<string>()
              const rowOwner = existingRow?.[ownerCol]
              const isOwned =
                rowOwner === v_user_id ||
                (cleanTable === 'blueprints' && rowOwner && ownedMasons.has(String(rowOwner)))
              if (!existingRow || !isOwned) {
                throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
              }
            } else if (cleanTable !== 'citizen_staging_queue') {
              throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
            }
          }
        } else {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const { error } = await gameDb
          .from(cleanTable)
          .delete()
          .eq('id', id_value)

        if (error) throw error
        resultData = { success: true }
        break;
      }
      case 'fetch_notifications': {
        const { data, error } = await gameDb
          .from('notifications')
          .select('*')
          .eq('user_id', v_user_id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        resultData = data;
        break;
      }
      case 'mark_notifications_read': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').update({ is_read: true }).eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'mark_all_notifications_read': {
        const { error } = await gameDb
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_notifications': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').delete().eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_all_notifications': {
        const { error } = await gameDb
          .from('notifications')
          .delete()
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'wayfinder_update_spoke_donations': {
        // Strictly isolated to the Spoke's own Wayfinder — Hub Keepers cannot view or alter Spoke donation configs
        if (callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can manage Spoke donation settings.')
        }
        const cleanDonUrl = typeof payload?.donation_url === 'string' ? payload.donation_url.trim() : ''
        const rawProc = typeof payload?.payment_processor === 'string' ? payload.payment_processor.trim().toUpperCase() : 'STRIPE'
        const cleanProc = rawProc === 'SANDBOX' || !rawProc ? 'STRIPE' : rawProc
        const goalCents = Math.max(0, Math.round(Number(payload?.monthly_goal_cents) || 0))
        const coveredCents = Math.max(0, Math.round(Number(payload?.monthly_covered_cents) || 0))

        const { error: updateDonErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            donation_url: cleanDonUrl || null,
            payment_processor: cleanProc,
          })
          .eq('id', game.id)
        if (updateDonErr) throw updateDonErr

        const schemaKey = String(game.schema_id || game.id || 'default').toLowerCase()
        const broadcastTitle = `SPOKE_DONATION_${schemaKey.toUpperCase()}`
        const payloadStr = JSON.stringify({
          schema_id: schemaKey,
          game_id: game.id,
          donation_url: cleanDonUrl,
          payment_processor: cleanProc,
          monthly_goal_cents: goalCents,
          monthly_covered_cents: coveredCents,
          spoke_cost_breakdown: payload?.spoke_cost_breakdown,
          updated_at: new Date().toISOString(),
        })

        const { data: existingBroadcast } = await supabaseAdmin
          .from('keeper_system_broadcasts')
          .select('id')
          .eq('category', 'SpokeDonationConfig')
          .eq('title', broadcastTitle)
          .limit(1)
          .maybeSingle()

        if (existingBroadcast?.id) {
          await supabaseAdmin
            .from('keeper_system_broadcasts')
            .update({
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
            })
            .eq('id', existingBroadcast.id)
        } else {
          await supabaseAdmin.from('keeper_system_broadcasts').insert([
            {
              title: broadcastTitle,
              category: 'SpokeDonationConfig',
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
              is_pinned: false,
            },
          ])
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: 'Updated Spoke Donation Settings',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Payment processor: ${cleanProc}`,
          })
        } catch (e) {
          console.warn('Spoke audit log warning on donation update:', e)
        }

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          donation_url: cleanDonUrl || null,
          payment_processor: cleanProc,
        }
        break;
      }
      case 'get_spoke_credential_status': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can inspect credential status')
        }
        resultData = {
          has_credential: true,
          credential_kind: resolvedCredentialKind,
          key_version: resolvedKeyVersion,
          key_fingerprint: resolvedKeyFingerprint,
          rotated_at: resolvedRotatedAt,
        }
        break;
      }
      case 'rotate_spoke_gateway_token': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can rotate the Spoke Gateway Token')
        }
        if (!game.supabase_anon_key) {
          throw new Error('Spoke supabase_anon_key must be configured before minting a scoped Gateway Token')
        }
        const { data: mintData, error: mintErr } = await gameDb.rpc('mint_spoke_gateway_token', {
          p_label: 'Hub Gateway Uplink',
          p_grace_seconds: 60,
        })
        if (mintErr || !mintData?.token) {
          throw new Error('Failed to mint new Spoke Gateway Token: ' + (mintErr?.message || 'Empty response — apply latest schema.sql on Spoke first'))
        }
        const newToken = String(mintData.token).trim()
        const verifyClient = createSpokeClient(game.supabase_url, game.supabase_anon_key, newToken)
        await verifySpokeCredentialHandshake(verifyClient, 'spoke_gateway')

        const { envelope, keyVersion } = await sealSpokeEnvelope(newToken, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: String(game.supabase_url || ''),
        })
        const newFp = maskCredentialFingerprint(newToken)
        const { error: upsErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: 'spoke_gateway',
          p_key_fingerprint: newFp,
        })
        if (upsErr) throw upsErr

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: 'Rotated Scoped Spoke Gateway Token',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `New Fingerprint: ${newFp} (${keyVersion})`,
            game_name: game.name || game.schema_id,
          })
        } catch {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: 'spoke_gateway',
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'sever_spoke_cord': {
        if (hubRole !== 'keeper' && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Core OS Keeper can sever the uplink cord.')
        }
        const severReason = payload?.reason?.trim() || (callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Bilateral Sovereignty Severance)' : 'Keeper Severed Spoke Uplink')
        const actionTitle = callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Severed Uplink)' : 'Keeper Severed Spoke Uplink'

        try {
          await gameDb.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason
          })
          await gameDb.rpc('revoke_spoke_gateway_tokens')
        } catch (e) {
          console.warn('Spoke audit log / token revocation warning on sever:', e)
        }

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
            game_name: game.name || game.schema_id
          })
        } catch (e) {
          console.warn('Hub audit log insert warning on sever:', e)
        }

        const { error: severErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            is_active: false
          })
          .eq('id', game.id)

        if (severErr) throw severErr

        await supabaseAdmin.rpc('internal_delete_spoke_credential', { p_game_id: game.id })

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          severed_by: callerSpokeRole === 'wayfinder' ? 'wayfinder' : 'keeper',
          schema_id: game.schema_id
        }
        break;
      }
      case 'flag_mod_for_compliance': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const rawModId = String(payload?.mod_id || '').trim()
        const rawHash = String(payload?.dna_hash || payload?.hash || '').trim().toLowerCase()
        const rawModName = String(payload?.mod_name || payload?.name || '').trim().slice(0, 200)
        const rawAuthor = String(payload?.author || payload?.master_author || '').trim().slice(0, 120)
        const rawTier = Math.round(Number(payload?.tier || 1))
        const requestedTier = Math.min(4, Math.max(1, Number.isFinite(rawTier) ? rawTier : 1))
        const cleanReason = String(payload?.reason || '').trim().slice(0, 1000) || `Flagged Tier ${requestedTier} for Compliance Review`
        const canApproveCompliance = callerSpokeRole === 'oversight' || callerSpokeRole === 'wayfinder' || callerSpokeRole === 'admin' || isFoundryTestNodeKeeper

        let modId = rawModId
        if (!modId && /^[0-9a-f]{64}$/.test(rawHash)) {
          const { data: verMatch } = await gameDb
            .from('mod_versions')
            .select('mod_id')
            .eq('dna_hash', rawHash)
            .maybeSingle()
          if (verMatch?.mod_id) {
            modId = String(verMatch.mod_id)
          }
        }

        const roleTag = isCallerStaff ? callerSpokeRole.toUpperCase() : (callerSpokeRole === 'mason' ? 'MASON' : 'CITIZEN')
        const taggedReason = `[${roleTag} FLAG - TIER ${requestedTier}] ${cleanReason}`

        let updatedMod: any = null

        if (!modId) {
          if (!/^[0-9a-f]{64}$/.test(rawHash)) {
            throw new Error('Missing mod_id or valid 64-character SHA-256 hash')
          }
          const newModId = crypto.randomUUID()
          const slugBase = (rawModName || 'flagged-artifact')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'flagged-artifact'
          const newSlug = `${slugBase}-${rawHash.slice(0, 8)}`
          const initialStatus = canApproveCompliance ? 'verified' : 'pending'

          const insertPayload: Record<string, any> = {
            id: newModId,
            name: rawModName || `Flagged Artifact (${rawHash.slice(0, 12)})`,
            slug: newSlug,
            master_author: rawAuthor || null,
            compliance_tier: requestedTier,
            status: initialStatus,
            status_reason: taggedReason,
          }
          let insRes = await gameDb
            .from('mods')
            .insert(insertPayload)
            .select()
            .maybeSingle()
          if (insRes.error && String(insRes.error.message || '').includes('status_reason')) {
            delete insertPayload.status_reason
            insRes = await gameDb
              .from('mods')
              .insert(insertPayload)
              .select()
              .maybeSingle()
          }
          if (insRes.error) throw insRes.error
          updatedMod = insRes.data || insertPayload
          modId = newModId

          const { error: verInsErr } = await gameDb
            .from('mod_versions')
            .insert({
              mod_id: newModId,
              dna_hash: rawHash,
              version_label: 'flagged',
              is_core_file: true,
            })
          if (verInsErr && verInsErr.code !== '23505') throw verInsErr
        } else {
          const { data: existingMod, error: fetchModErr } = await gameDb
            .from('mods')
            .select('id, name, compliance_tier, status, status_reason')
            .eq('id', modId)
            .maybeSingle()

          if (fetchModErr) throw fetchModErr
          if (!existingMod) throw new Error('Target artifact not found in Spoke registry')

          const currentTier = Number(existingMod.compliance_tier || 0)
          const currentStatusLower = String(existingMod.status || '').toLowerCase()
          const isCurrentlyPending = ['pending', 'under_review', 'unverified'].includes(currentStatusLower)
          const isConfirmedActiveOrBlocked = currentTier >= 1 && !isCurrentlyPending

          updatedMod = existingMod
          if (!isConfirmedActiveOrBlocked || requestedTier > currentTier) {
            const nextTier = isCurrentlyPending ? Math.max(currentTier, requestedTier) : requestedTier
            const nextStatus = canApproveCompliance
              ? (isCurrentlyPending ? 'pending' : 'verified')
              : 'pending'
            const nextReason =
              isConfirmedActiveOrBlocked && existingMod.status_reason
                ? `${existingMod.status_reason}\n${taggedReason}`
                : taggedReason

            let updRes = await gameDb
              .from('mods')
              .update({
                compliance_tier: nextTier,
                status: nextStatus,
                status_reason: nextReason,
              })
              .eq('id', modId)
              .select()
              .maybeSingle()

            if (updRes.error && String(updRes.error.message || '').includes('status_reason')) {
              updRes = await gameDb
                .from('mods')
                .update({
                  compliance_tier: nextTier,
                  status: nextStatus,
                })
                .eq('id', modId)
                .select()
                .maybeSingle()
            }
            if (updRes.error) throw updRes.error
            if (updRes.data) updatedMod = updRes.data
          }
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: `Flagged Artifact for Compliance (Tier ${requestedTier})`,
            target_table: 'mods',
            target_name: updatedMod?.name || rawModName || modId,
            actor_id: v_user_id,
            reason: taggedReason,
          })
        } catch (auditErr) {
          console.warn('Compliance flag audit log warning:', auditErr)
        }

        resultData = {
          success: true,
          queued_pending: String(updatedMod?.status || 'pending').toLowerCase() === 'pending',
          mod: updatedMod,
        }
        break;
      }
      case 'update_spoke_uplink': {
        if (!isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can update Spoke uplink keys.')
        }
        const newUrl = (payload?.supabase_url?.trim() || game.supabase_url || '').replace(/\/+$/, '')
        const newAnonKey = payload?.supabase_anon_key?.trim() || game.supabase_anon_key
        const submittedSecret = String(payload?.spoke_gateway_token || payload?.supabase_service_key || '').trim()

        if (!submittedSecret && normalizeSpokeUrl(newUrl) !== normalizeSpokeUrl(game.supabase_url)) {
          throw new Error('Changing Spoke URL requires supplying a valid Spoke Gateway Token for the target project.')
        }

        const newServiceKey = submittedSecret || gameServiceKey

        if (!newUrl || !newAnonKey || !newServiceKey) {
          throw new Error('Missing required Spoke URL, Anon Key, or Gateway Token.')
        }
        if (!SUPABASE_URL_REGEX.test(newUrl)) {
          throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
        }

        const newKind = detectCredentialKind(newServiceKey)
        const verifyClient = createSpokeClient(newUrl, newAnonKey, newServiceKey)
        await verifySpokeCredentialHandshake(verifyClient, newKind)

        const { error: updErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            supabase_url: newUrl,
            supabase_anon_key: newAnonKey,
            is_active: true
          })
          .eq('id', game.id)

        if (updErr) throw updErr

        const { envelope, keyVersion } = await sealSpokeEnvelope(newServiceKey, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: newUrl,
        })
        const newFp = maskCredentialFingerprint(newServiceKey)
        const { error: secErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: newKind,
          p_key_fingerprint: newFp,
        })
        if (secErr) throw secErr

        try {
          await verifyClient.from('audit_logs').insert({
            action: 'Rotated Spoke Uplink Credentials',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Wayfinder / Keeper Uplink Key Rotation (${newFp})`
          })
        } catch (e) {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: newKind,
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'spoke_query':
      case 'spoke_query_batch': {
        const executeSingleSpokeQuery = async (specPayload: any) => {
          const payload = specPayload || {}
          const cleanTable = String(payload?.table || '').trim().toLowerCase()
          const op = String(payload?.op || 'select').trim().toLowerCase()
          if (!cleanTable) throw new Error('Missing table for spoke_query')
          if (cleanTable === 'auth.users' || cleanTable === 'hardware_bans') {
            throw new Error('Forbidden table target')
          }

          const isKnownSpokeTable =
            cleanTable === 'profiles' ||
            cleanTable === 'pwa_push_subscriptions' ||
            STAFF_ONLY_TABLES.has(cleanTable) ||
            CREATOR_OR_STAFF_TABLES.has(cleanTable) ||
            CITIZEN_TABLES.has(cleanTable)

          if (!isKnownSpokeTable) {
            throw new Error(`Forbidden: Table ${cleanTable} is not in the Spoke registry`)
          }

          if (op === 'select') {
            const selectColumns = typeof payload?.selectColumns === 'string' && payload.selectColumns.trim()
              ? payload.selectColumns
              : '*'
            const selectOpts = payload?.selectOpts && typeof payload.selectOpts === 'object'
              ? payload.selectOpts
              : undefined

            if (cleanTable === 'malware_reports' && !isCallerStaff) {
              throw new Error('Forbidden: Staff clearance required to view malware reports')
            }

            if (cleanTable === 'notifications' || cleanTable === 'pwa_push_subscriptions') {
              let q = gameDb.from(cleanTable).select(selectColumns, selectOpts).eq('user_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if (cleanTable === 'sanctuary_tickets' && !isCallerStaff) {
              if (callerSpokeRole === 'mason') {
                const ownedMasons = await getCallerOwnedMasonIds()
                const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                const { data: modRows } = await gameDb
                  .from('mods')
                  .select('id')
                  .in('mason_id', masonIdsArr)
                const ownedModIds = new Set((modRows || []).map((m: any) => String(m.id)))

                let q = gameDb.from('sanctuary_tickets').select(selectColumns === '*' ? '*' : '*')
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const rows = (Array.isArray(res.data) ? res.data : []).filter((t: any) => {
                  if (!t) return false
                  if (t.author_id === v_user_id || t.assigned_to === v_user_id) return true
                  const meta = t.metadata || {}
                  if (meta.target_user_id === v_user_id || meta.target_mason === v_user_id || meta.mason_id === v_user_id) return true
                  if (meta.target_mason && ownedMasons.has(String(meta.target_mason))) return true
                  if (meta.mason_id && ownedMasons.has(String(meta.mason_id))) return true
                  if (meta.target_mod_id && ownedModIds.has(String(meta.target_mod_id))) return true
                  return false
                })
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              let q = gameDb.from('sanctuary_tickets').select(selectColumns, selectOpts).eq('author_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if ((cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') && !isCallerStaff) {
              if (callerSpokeRole === 'mason' && (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports')) {
                const ownedMasons = await getCallerOwnedMasonIds()
                let ownedTargetIds = new Set<string>()
                if (cleanTable === 'nexus_reports') {
                  const { data: myAssets } = await gameDb
                    .from('nexus_assets')
                    .select('id')
                    .eq('author_id', v_user_id)
                  ownedTargetIds = new Set((myAssets || []).map((a: any) => String(a.id)))
                } else {
                  const masonFilterIds = [v_user_id, ...Array.from(ownedMasons)]
                  const { data: myBps } = await gameDb
                    .from('blueprints')
                    .select('id')
                    .in('mason_id', masonFilterIds)
                  ownedTargetIds = new Set((myBps || []).map((b: any) => String(b.id)))
                }
                let q = gameDb.from(cleanTable).select(selectColumns)
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const fkField = cleanTable === 'nexus_reports' ? 'asset_id' : 'blueprint_id'
                const rows = (Array.isArray(res.data) ? res.data : []).filter(
                  (r: any) => r && (r.reporter_id === v_user_id || (r[fkField] && ownedTargetIds.has(String(r[fkField]))))
                )
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              let q = gameDb.from(cleanTable).select(selectColumns, selectOpts).eq('reporter_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            const canReadComplianceTiers =
              callerSpokeRole === 'oversight' ||
              callerSpokeRole === 'wayfinder' ||
              callerSpokeRole === 'admin' ||
              isFoundryTestNodeKeeper

            let effectiveSelectColumns = selectColumns
            let effectiveSelectOpts = selectOpts
            const injectedModId =
              !canReadComplianceTiers &&
              cleanTable === 'mod_versions' &&
              selectColumns !== '*' &&
              !/\bmod_id\b/.test(selectColumns)
            if (injectedModId) {
              effectiveSelectColumns = `${selectColumns},mod_id`
            }
            const needsPostCountFilter =
              !canReadComplianceTiers &&
              Boolean(selectOpts?.head) &&
              ['mods', 'collections', 'mod_versions'].includes(cleanTable)
            if (needsPostCountFilter) {
              effectiveSelectColumns = cleanTable === 'mod_versions' ? 'mod_id' : 'id, compliance_tier'
              effectiveSelectOpts = undefined
            }

            let q = gameDb.from(cleanTable).select(effectiveSelectColumns, effectiveSelectOpts)
            q = applySpokeQueryModifiers(q, payload)
            const res = await q
            if (res.error) throw res.error

            let responseData = res.data
            let responseCount = res.count ?? null

            if (!canReadComplianceTiers && ['mods', 'collections'].includes(cleanTable) && responseData !== null) {
              const isPublicComplianceRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const tier = Number(r.compliance_tier ?? 0)
                return !(tier >= 1 && tier <= 4)
              }
              if (Array.isArray(responseData)) {
                const filtered = responseData.filter(isPublicComplianceRow)
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicComplianceRow(responseData)) {
                responseData = null
                responseCount = 0
              }
            }

            if (!canReadComplianceTiers && cleanTable === 'mod_versions' && responseData !== null) {
              const rowsArr = Array.isArray(responseData) ? responseData : [responseData]
              const modIdsToCheck = Array.from(
                new Set(
                  rowsArr
                    .map((r: any) => {
                      const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                      if (joinedMod && typeof joinedMod.compliance_tier === 'number') return null
                      return r?.mod_id ? String(r.mod_id) : null
                    })
                    .filter(Boolean)
                )
              ) as string[]

              const restrictedModIds = new Set<string>()
              if (modIdsToCheck.length > 0) {
                for (let i = 0; i < modIdsToCheck.length; i += 200) {
                  const chunk = modIdsToCheck.slice(i, i + 200)
                  const { data: modTiers } = await gameDb
                    .from('mods')
                    .select('id, compliance_tier')
                    .in('id', chunk)
                  for (const m of modTiers || []) {
                    const tier = Number((m as any)?.compliance_tier ?? 0)
                    if (tier >= 1 && tier <= 4) {
                      restrictedModIds.add(String((m as any).id))
                    }
                  }
                }
              }

              const isPublicVersionRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                if (joinedMod && typeof joinedMod.compliance_tier === 'number') {
                  const t = Number(joinedMod.compliance_tier)
                  if (t >= 1 && t <= 4) return false
                }
                if (r.mod_id && restrictedModIds.has(String(r.mod_id))) return false
                return true
              }

              if (Array.isArray(responseData)) {
                let filtered = responseData.filter(isPublicVersionRow)
                if (injectedModId) {
                  filtered = filtered.map((r: any) => {
                    if (!r || typeof r !== 'object') return r
                    const { mod_id: _omitted, ...rest } = r
                    return rest
                  })
                }
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicVersionRow(responseData)) {
                responseData = null
                responseCount = 0
              } else if (injectedModId && typeof responseData === 'object') {
                const { mod_id: _omitted, ...rest } = responseData as any
                responseData = rest
              }
            }

            if (
              !isCallerStaff &&
              responseData !== null &&
              ['mason_posts', 'mason_post_comments', 'nexus_assets', 'blueprints', 'collections'].includes(cleanTable)
            ) {
              const hasFlaggedRow = Array.isArray(responseData)
                ? responseData.some((r: any) => r?.has_pending_flag === true)
                : (responseData as any)?.has_pending_flag === true
              if (hasFlaggedRow) {
                const ownedMasons =
                  cleanTable === 'mason_posts' || cleanTable === 'blueprints' || cleanTable === 'collections'
                    ? await getCallerOwnedMasonIds()
                    : new Set<string>()
                const isOwnFlaggedRow = (r: any) => {
                  if (!r || typeof r !== 'object') return false
                  if (r.has_pending_flag !== true) return true
                  if (r.author_id && r.author_id === v_user_id) return true
                  if (r.mason_id && (r.mason_id === v_user_id || ownedMasons.has(String(r.mason_id)))) return true
                  return false
                }
                if (Array.isArray(responseData)) {
                  const filtered = responseData.filter(isOwnFlaggedRow)
                  return { __spoke_query_v1: true, data: filtered, count: filtered.length }
                }
                if (!isOwnFlaggedRow(responseData)) {
                  return { __spoke_query_v1: true, data: null, count: 0 }
                }
              }
            }
            return { __spoke_query_v1: true, data: responseData, count: responseCount }
          }

          // Mutations: insert | upsert | update | delete
          if (cleanTable === 'profiles') {
            if (op !== 'update') throw new Error('Forbidden direct profile operation')
            const rawVals = payload?.values && typeof payload.values === 'object' ? payload.values : {}
            const isSelfBanOnly =
              Object.keys(rawVals).length > 0 &&
              rawVals.is_banned === true &&
              Object.keys(rawVals).every((k) => ['is_banned', 'blacklist_reason'].includes(k))
            if (!isCallerStaff && !isSelfBanOnly) {
              throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
            }
            let q = gameDb.from('profiles').update(
              isSelfBanOnly
                ? { is_banned: true, blacklist_reason: rawVals.blacklist_reason ?? null }
                : rawVals
            )
            if (!isCallerStaff) {
              q = q.eq('id', v_user_id)
            } else {
              q = applySpokeQueryFilters(q, payload?.filters || [])
            }
            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }
            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          if (isCallerBanned) {
            throw new Error('Forbidden: Account is suspended')
          }

          if (STAFF_ONLY_TABLES.has(cleanTable) && !isCallerStaff) {
            throw new Error(`Forbidden: Staff clearance required to modify ${cleanTable}`)
          }
          if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
            const isDeleteOwnLegacyContent =
              op === 'delete' &&
              ['mason_posts', 'collections', 'collection_members'].includes(cleanTable)
            const canModifyCreatorTable =
              cleanTable === 'masons' || isDeleteOwnLegacyContent
                ? isCallerCreatorOrStaff || (await getIsCallerVerifiedMason())
                : isCallerStaff || (await getIsCallerVerifiedMason())
            if (!canModifyCreatorTable) {
              throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
            }
          }
          if (
            !STAFF_ONLY_TABLES.has(cleanTable) &&
            !CREATOR_OR_STAFF_TABLES.has(cleanTable) &&
            !CITIZEN_TABLES.has(cleanTable) &&
            cleanTable !== 'pwa_push_subscriptions'
          ) {
            throw new Error(`Forbidden: Table ${cleanTable} cannot be modified`)
          }

          if (op === 'insert' || op === 'upsert') {
            const isArr = Array.isArray(payload?.values)
            const rows = (isArr ? payload.values : [payload?.values]).map((r: any) =>
              normalizeSpokeTableRow(cleanTable, r)
            )
            if (!isCallerStaff) {
              const ownedMasons =
                cleanTable === 'masons' ||
                cleanTable === 'mason_posts' ||
                cleanTable === 'collections' ||
                cleanTable === 'collection_members' ||
                cleanTable === 'blueprints'
                  ? await getCallerOwnedMasonIds()
                  : new Set<string>()
              for (const row of rows) {
                if (!row || typeof row !== 'object') throw new Error('Invalid payload row')
                if (cleanTable === 'audit_logs') {
                  row.actor_id = v_user_id
                  delete row.id
                } else if (cleanTable === 'mason_post_comments') {
                  if (callerSpokeProfile?.is_comm_banned) {
                    throw new Error('Forbidden: Community posting privileges are suspended')
                  }
                  row.author_id = v_user_id
                  delete row.is_hidden
                } else if (
                  cleanTable === 'mason_post_likes' ||
                  cleanTable === 'mason_post_views' ||
                  cleanTable === 'dispatch_poll_votes' ||
                  cleanTable === 'pwa_push_subscriptions'
                ) {
                  row.user_id = v_user_id
                } else if (cleanTable === 'blueprints') {
                  if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                    throw new Error('Forbidden: Blueprint mason_id must belong to caller')
                  }
                  if (!row.mason_id) row.mason_id = v_user_id
                } else if (cleanTable === 'nexus_assets') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                  row.author_id = v_user_id
                  delete row.is_community_default
                } else if (cleanTable === 'sanctuary_tickets') {
                  row.author_id = v_user_id
                  delete row.assigned_to
                } else if (
                  cleanTable === 'content_flags' ||
                  cleanTable === 'nexus_reports' ||
                  cleanTable === 'blueprint_reports'
                ) {
                  row.reporter_id = v_user_id
                  delete row.resolved_by
                  delete row.resolution_note
                } else if (cleanTable === 'scout_suggestions') {
                  row.submitter_id = v_user_id
                } else if (cleanTable === 'notifications') {
                  row.actor_id = v_user_id
                } else if (cleanTable === 'masons') {
                  delete row.is_verified
                  delete row.followers_count
                  row.profile_id = v_user_id
                } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error(
                      cleanTable === 'mason_posts'
                        ? 'Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches'
                        : 'Forbidden: Verified Creator status is required to publish or update Nexus collections'
                    )
                  }
                  if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                    throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                  }
                  if (cleanTable === 'collections') delete row.is_official
                } else if (cleanTable === 'collection_members') {
                  await assertOwnedCollectionSetId(row.set_id)
                } else if (cleanTable === 'mods') {
                  if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                    delete row.highlander_group_id
                  }
                }
                await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, false)
              }
            } else {
              for (const row of rows) {
                await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
              }
            }

            if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
              for (const row of rows) {
                if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
                  row.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(row.compliance_tier))))
                  row.status = 'pending'
                }
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons') {
              for (const row of rows) {
                if (row?.profile_id) {
                  const { data: targetProf } = await gameDb
                    .from('profiles')
                    .select('role')
                    .eq('id', row.profile_id)
                    .maybeSingle()
                  if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                    throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
                  }
                }
              }
            }

            let currentBody: any = isArr ? rows : rows[0]
            let resData: any = null
            let resErr: any = null
            for (let attempt = 0; attempt < 5; attempt++) {
              let q =
                op === 'upsert'
                  ? gameDb.from(cleanTable).upsert(currentBody, payload?.upsertOpts || undefined)
                  : gameDb.from(cleanTable).insert(currentBody)
              if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
                q = q.select(payload.returnSelect || '*')
                if (payload?.singleMode === 'single') q = q.single()
                else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
              }
              const res = await q
              resData = res.data
              resErr = res.error
              if (!resErr) break
              const missingCol = String(resErr.message || '').match(/Could not find the '([^']+)' column/i)?.[1]
              if (missingCol) {
                if (Array.isArray(currentBody)) {
                  currentBody = currentBody.map((r: any) => {
                    if (r && typeof r === 'object') {
                      const next = { ...r }
                      delete next[missingCol]
                      return next
                    }
                    return r
                  })
                  continue
                } else if (currentBody && typeof currentBody === 'object' && Object.prototype.hasOwnProperty.call(currentBody, missingCol)) {
                  delete currentBody[missingCol]
                  continue
                }
              }
              break
            }
            if (resErr) {
              if (resErr.code === '23505' && cleanTable === 'mason_post_views') {
                return { __spoke_query_v1: true, data: [currentBody], count: 1 }
              }
              throw resErr
            }
            if (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') {
              for (const insertedRow of rows) {
                if (!insertedRow || typeof insertedRow !== 'object') continue
                try {
                  if (cleanTable === 'nexus_reports' && insertedRow.asset_id) {
                    await gameDb.from('nexus_assets').update({ has_pending_flag: true }).eq('id', insertedRow.asset_id)
                  } else if (cleanTable === 'blueprint_reports' && insertedRow.blueprint_id) {
                    await gameDb.from('blueprints').update({ has_pending_flag: true }).eq('id', insertedRow.blueprint_id)
                  } else if (cleanTable === 'content_flags' && insertedRow.content_id) {
                    const normCt = String(insertedRow.content_type || '').toLowerCase()
                    const cTable =
                      normCt === 'collection' || normCt === 'collections'
                        ? 'collections'
                        : normCt === 'comment' || normCt === 'mason_post_comment'
                          ? 'mason_post_comments'
                          : 'mason_posts'
                    await gameDb.from(cTable).update({ has_pending_flag: true }).eq('id', insertedRow.content_id)
                  }
                } catch {
                  // Gracefully ignore if older Spoke schema does not yet have has_pending_flag
                }
              }
            }
            return { __spoke_query_v1: true, data: resData, count: null }
          }

          if (op === 'update' || op === 'delete') {
            if (cleanTable === 'audit_logs') {
              throw new Error('Forbidden: Audit logs are immutable')
            }
            if (!Array.isArray(payload?.filters) || payload.filters.length === 0) {
              throw new Error(`Refusing unfiltered ${op} on ${cleanTable}`)
            }

            let updateVals = payload?.values && typeof payload.values === 'object'
              ? { ...payload.values }
              : {}
            if (op === 'update') {
              assertNoOversizedInlineImageBlobs(cleanTable, updateVals)
            }

            if (isArchitectOnlyStaff && op === 'update' && (cleanTable === 'mods' || cleanTable === 'collections')) {
              if (Number(updateVals.compliance_tier || 0) >= 1) {
                updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                updateVals.status = 'pending'
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons' && updateVals.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', updateVals.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }

            if (!isCallerStaff) {
              if (cleanTable === 'masons') {
                delete updateVals.is_verified
                delete updateVals.followers_count
                delete updateVals.profile_id
              } else if (cleanTable === 'nexus_assets') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                }
                delete updateVals.is_community_default
                delete updateVals.author_id
              } else if (cleanTable === 'mason_posts') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches')
                  }
                }
              } else if (cleanTable === 'collections') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus collections')
                  }
                }
                delete updateVals.is_official
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mods') {
                if (updateVals.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                  delete updateVals.highlander_group_id
                }
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mason_post_comments') {
                delete updateVals.is_hidden
                delete updateVals.author_id
              }

              if (
                op === 'update' &&
                updateVals.mason_id !== undefined &&
                (cleanTable === 'mason_posts' || cleanTable === 'collections' || cleanTable === 'mods')
              ) {
                const ownedMasonsCheck = await getCallerOwnedMasonIds()
                if (!ownedMasonsCheck.has(String(updateVals.mason_id))) {
                  throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                }
              }
            }

            let q = op === 'update'
              ? gameDb.from(cleanTable).update(updateVals)
              : gameDb.from(cleanTable).delete()

            q = applySpokeQueryFilters(q, payload.filters)

            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'mason_post_comments') {
                q = q.eq('author_id', v_user_id)
              } else if (
                cleanTable === 'mason_post_likes' ||
                cleanTable === 'dispatch_poll_votes' ||
                cleanTable === 'notifications' ||
                cleanTable === 'pwa_push_subscriptions'
              ) {
                q = q.eq('user_id', v_user_id)
              } else if (cleanTable === 'nexus_assets') {
                q = q.eq('author_id', v_user_id)
              } else if (cleanTable === 'masons') {
                q = q.eq('profile_id', v_user_id)
              } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'collection_members') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                const { data: myCols } = await gameDb
                  .from('collections')
                  .select('id')
                  .in('mason_id', mIds)
                const ownedSetIds = (myCols || []).map((c: any) => String(c.id))
                if (ownedSetIds.length === 0) throw new Error('Forbidden: No owned collections')
                if (op === 'update' && updateVals.set_id !== undefined && !ownedSetIds.includes(String(updateVals.set_id))) {
                  throw new Error('Forbidden: Collection set_id must belong to your Creator profile')
                }
                q = q.in('set_id', ownedSetIds)
              } else if (cleanTable === 'mods') {
                if (op === 'delete') throw new Error('Forbidden: Creators cannot delete cloud registry artifacts directly')
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'blueprints') {
                const mIds = [v_user_id, ...Array.from(ownedMasons)]
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'sanctuary_tickets') {
                if (op === 'delete') throw new Error('Forbidden: Citizens/Creators cannot delete tickets')
                if (callerSpokeRole !== 'mason') {
                  q = q.eq('author_id', v_user_id)
                }
              } else if (
                cleanTable === 'nexus_reports' ||
                cleanTable === 'blueprint_reports'
              ) {
                if (op === 'delete' || callerSpokeRole !== 'mason') {
                  throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
                }
              } else if (
                cleanTable === 'content_flags' ||
                cleanTable === 'malware_reports'
              ) {
                throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
              }
            }

            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }

            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          throw new Error(`Unsupported spoke_query op: ${op}`)
        }

        if (action === 'spoke_query_batch') {
          const queries = Array.isArray(payload?.queries) ? payload.queries.slice(0, 32) : []
          const results = await Promise.all(
            queries.map(async (qSpec: any) => {
              try {
                const out = await executeSingleSpokeQuery(qSpec)
                return { ok: true, ...out }
              } catch (err: any) {
                return { ok: false, error: err?.message || String(err), original_error: err }
              }
            })
          )
          resultData = { __spoke_batch_v1: true, results }
          break
        }

        resultData = await executeSingleSpokeQuery(payload)
        break
      }
      case 'upload_spoke_theme_asset': {
        if (isCallerBanned) {
          throw new Error('Forbidden: Account is suspended')
        }
        const canUploadThemeAsset = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canUploadThemeAsset) {
          throw new Error(
            'Forbidden: Verified Creator or Staff status is required to upload Nexus theme wallpapers'
          )
        }

        const rawKind = String(payload?.kind || 'bg').trim().toLowerCase()
        const safeKind = ['bg', 'thumb', 'preview'].includes(rawKind) ? rawKind : 'bg'
        const rawMime = String(payload?.mime_type || 'image/webp').trim().toLowerCase()
        const allowedMimeExt: Record<string, string> = {
          'image/webp': 'webp',
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
        }
        const ext = allowedMimeExt[rawMime]
        if (!ext) {
          throw new Error('Unsupported theme image format. Use WebP, PNG, or JPEG.')
        }
        const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime

        const base64Raw = String(payload?.base64_data || '')
          .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '')
          .replace(/\s+/g, '')
        if (!base64Raw) {
          throw new Error('Missing image payload')
        }
        // 390 KB binary cap (~520 KB base64)
        if (base64Raw.length > 535_000) {
          throw new Error('Compressed theme wallpaper exceeds the 380 KB cloud upload budget.')
        }

        let bytes: Uint8Array
        try {
          const bin = atob(base64Raw)
          bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i)
          }
        } catch {
          throw new Error('Invalid base64 image encoding')
        }

        if (bytes.byteLength < 12 || bytes.byteLength > 390_000) {
          throw new Error('Theme image byte size out of bounds (max 380 KB)')
        }

        // Magic-byte header verification (WebP, PNG, JPEG)
        const isWebp =
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50
        const isPng =
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

        if (!isWebp && !isPng && !isJpeg) {
          throw new Error('Rejected file: invalid raster image header')
        }

        const actualMime = isWebp ? 'image/webp' : isPng ? 'image/png' : 'image/jpeg'
        const actualExt = isWebp ? 'webp' : isPng ? 'png' : 'jpg'
        if (actualMime !== normalizedMime && !(isWebp && ext === 'webp')) {
          // Use verified header mime/ext
        }

        const digestBuf = await crypto.subtle.digest('SHA-256', bytes)
        const shaHex = Array.from(new Uint8Array(digestBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const bucket = 'backgrounds'
        const storagePath = `themes/${safeKind}_${shaHex}.${actualExt}`

        // Ensure bucket exists with 512 KB cap on newly onboarded Spokes
        const { error: getBucketErr } = await gameDb.storage.getBucket(bucket)
        if (getBucketErr && resolvedCredentialKind !== 'spoke_gateway') {
          await gameDb.storage
            .createBucket(bucket, {
              public: true,
              fileSizeLimit: 524288,
              allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
            })
            .catch(() => {})
        }

        let finalPublicUrl: string | null = null
        let finalStoragePath = storagePath
        const { error: uploadErr } = await gameDb.storage
          .from(bucket)
          .upload(storagePath, bytes, {
            contentType: actualMime,
            cacheControl: '31536000',
            upsert: true,
          })

        if (!uploadErr) {
          const { data: pubData } = gameDb.storage.from(bucket).getPublicUrl(storagePath)
          finalPublicUrl = pubData?.publicUrl || null
        } else if (resolvedCredentialKind === 'spoke_gateway') {
          // Storage API only evaluates JWT roles on some projects; fall back safely to Hub's hardened backgrounds CDN
          const spokeSlug = String(game.schema_id || 'spoke').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'spoke'
          finalStoragePath = `spoke-themes/${spokeSlug}/${safeKind}_${shaHex}.${actualExt}`
          const { error: hubBucketErr } = await supabaseAdmin.storage.getBucket(bucket)
          if (hubBucketErr) {
            await supabaseAdmin.storage
              .createBucket(bucket, {
                public: true,
                fileSizeLimit: 524288,
                allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
              })
              .catch(() => {})
          }
          const { error: hubUpErr } = await supabaseAdmin.storage
            .from(bucket)
            .upload(finalStoragePath, bytes, {
              contentType: actualMime,
              cacheControl: '31536000',
              upsert: true,
            })
          if (hubUpErr) {
            throw new Error(`Theme wallpaper upload failed: ${hubUpErr.message}`)
          }
          const { data: hubPub } = supabaseAdmin.storage.from(bucket).getPublicUrl(finalStoragePath)
          finalPublicUrl = hubPub?.publicUrl || null
        } else {
          throw new Error(`Theme wallpaper upload failed: ${uploadErr.message}`)
        }

        resultData = {
          publicUrl: finalPublicUrl,
          storagePath: finalStoragePath,
          sha256: shaHex,
          byteLength: bytes.byteLength,
        }
        break
      }
      default:
        throw new Error('Unknown action: ' + action)
    }

    return new Response(JSON.stringify(resultData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Edge Function Error:', error.message)
    return new Response(JSON.stringify({ error: error.message, original_error: error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
