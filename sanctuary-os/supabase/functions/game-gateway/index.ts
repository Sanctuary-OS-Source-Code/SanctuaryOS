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
  'sanctuary_schemas',
  'sanctuary_lexicons',
  'sanctuary_themes',
  'sanctuary_support_categories',
  'sanctuary_telemetry_sources',
  'dlc_registry',
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
  'flavor_groups',
  'flavor_group_members',
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

const spokeGameConfigCache = new Map<string, { game: any; serviceKey: string | null; expiresAt: number }>();
const SPOKE_GAME_CACHE_TTL_MS = 45_000;

function invalidateSpokeGameConfigCache() {
  spokeGameConfigCache.clear();
}

async function resolveGameWithServiceKey(supabaseAdmin: any, gameIdOrSchema: string) {
  const cacheKey = String(gameIdOrSchema || '').trim().toLowerCase();
  const cached = spokeGameConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { game: cached.game, serviceKey: cached.serviceKey, error: null };
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
    return { game: null, serviceKey: null, error: gameError };
  }

  const { data: secretRow } = await supabaseAdmin
    .from('sanctuary_game_secrets')
    .select('supabase_service_key')
    .eq('game_id', game.id)
    .maybeSingle();

  const serviceKey = (secretRow?.supabase_service_key || '').trim() || null;
  const entry = { game, serviceKey, expiresAt: Date.now() + SPOKE_GAME_CACHE_TTL_MS };
  spokeGameConfigCache.set(cacheKey, entry);
  if (game.id) spokeGameConfigCache.set(String(game.id).toLowerCase(), entry);
  if (game.schema_id) spokeGameConfigCache.set(String(game.schema_id).toLowerCase(), entry);
  return { game, serviceKey, error: null };
}

function normalizeSpokeTableRow(_table: string, row: any) {
  if (!row || typeof row !== 'object') return row;
  return { ...row };
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

    // Keeper-only action: create or update a Spoke Game entry while storing supabase_service_key exclusively in sanctuary_game_secrets
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
      const cleanService = String(supabase_service_key || '').trim()

      if (!cleanName || !cleanSchemaId || !cleanUrl || !cleanAnon) {
        throw new Error('Missing required Spoke Game fields (name, schema_id, supabase_url, supabase_anon_key)')
      }
      if (!SUPABASE_URL_REGEX.test(cleanUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
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
          await supabaseAdmin
            .from('sanctuary_game_secrets')
            .delete()
            .eq('game_id', savedGame.id)
        } else if (cleanService) {
          const { error: secErr } = await supabaseAdmin
            .from('sanctuary_game_secrets')
            .upsert(
              {
                game_id: savedGame.id,
                supabase_service_key: cleanService,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'game_id' }
            )
          if (secErr) throw secErr
        }
      }

      const { data: hasSec } = await supabaseAdmin
        .from('sanctuary_game_secrets')
        .select('game_id')
        .eq('game_id', savedGame.id)
        .maybeSingle()

      invalidateSpokeGameConfigCache();
      return new Response(
        JSON.stringify({
          success: true,
          game: { ...savedGame, has_service_key: Boolean(hasSec?.game_id) },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
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
          .select('id, supabase_url')
          .eq('is_active', true)

        const { data: allSecrets } = await supabaseAdmin
          .from('sanctuary_game_secrets')
          .select('game_id, supabase_service_key')

        const secretMap = new Map<string, string>()
        for (const s of (allSecrets || [])) {
          if (s?.game_id && s?.supabase_service_key) {
            secretMap.set(s.game_id, s.supabase_service_key)
          }
        }

        for (const g of (allGames || [])) {
          const svcKey = secretMap.get(g.id)
          if (!g.supabase_url || !svcKey) continue
          try {
            const spokeClient = createClient(g.supabase_url, svcKey, SERVER_AUTH_OPTS)
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
        supabase_service_key,
        founder_identifier,
      } = payload || {}

      let resolvedServiceKey = String(supabase_service_key || '').trim()
      let resolvedUrl = String(supabase_url || '').trim().replace(/\/+$/, '')
      let resolvedAnonKey = String(supabase_anon_key || '').trim()

      if ((!resolvedServiceKey || !resolvedUrl) && (existingGameId || game_id)) {
        const lookup = await resolveGameWithServiceKey(supabaseAdmin, String(existingGameId || game_id))
        if (lookup.game) {
          if (!resolvedUrl) resolvedUrl = String(lookup.game.supabase_url || '').trim().replace(/\/+$/, '')
          if (!resolvedAnonKey) resolvedAnonKey = String(lookup.game.supabase_anon_key || '').trim()
          if (!resolvedServiceKey && lookup.serviceKey) resolvedServiceKey = lookup.serviceKey
        }
      }

      const targetKey = resolvedServiceKey || resolvedAnonKey
      if (!resolvedUrl || !targetKey) {
        throw new Error('Missing Spoke Supabase URL or Key')
      }
      if (!SUPABASE_URL_REGEX.test(resolvedUrl)) {
        throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
      }

      const startPing = Date.now()
      const testDb = createClient(resolvedUrl, targetKey, SERVER_AUTH_OPTS)
      const requiredTables = ['mods', 'profiles', 'system_broadcasts', 'dispatch_poll_votes', 'global_network_status', 'audit_logs']
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
        latency_ms: latencyMs
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!game_id) {
      throw new Error('Missing game_id')
    }

    // 4. Resolve Target Spoke DB Configuration & Isolated Service Key
    const { game, serviceKey: gameServiceKey, error: gameError } = await resolveGameWithServiceKey(
      supabaseAdmin,
      String(game_id)
    )

    if (gameError || !game) {
      throw new Error('Game DB not found: ' + (gameError?.message || 'No row') + ' | ID was: ' + game_id)
    }

    if (game.is_keepers_only === true && hubRole !== 'keeper') {
      throw new Error('Forbidden: This Spoke is restricted to Keepers Core')
    }

    if (action === 'sever_spoke_cord' && hubRole === 'keeper') {
      const severReason = payload?.reason?.trim() || 'Keeper Severance Protocol (Cut the Cord)'
      if (gameServiceKey && SUPABASE_URL_REGEX.test(String(game.supabase_url || '').trim())) {
        try {
          const bestEffortSpokeDb = createClient(game.supabase_url, gameServiceKey, SERVER_AUTH_OPTS)
          await bestEffortSpokeDb.from('audit_logs').insert({
            action: 'Keeper Severed Spoke Uplink (Cut the Cord)',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
          })
        } catch (e) {
          console.warn('Best-effort Spoke audit log warning on Keeper sever:', e)
        }
      }
      await supabaseAdmin
        .from('sanctuary_games')
        .update({ is_active: false })
        .eq('id', game.id)
      await supabaseAdmin
        .from('sanctuary_game_secrets')
        .delete()
        .eq('game_id', game.id)
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
      throw new Error('Game DB service key not configured - connection rejected')
    }

    // 5. Initialize Spoke DB Client with Isolated Service Role Key
    const gameDb = createClient(game.supabase_url, gameServiceKey, SERVER_AUTH_OPTS)

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

    let resultData = null;

    // 7. Route actions
    switch (action) {
      case 'sync_spoke_profile': {
        resultData = {
          ...callerSpokeProfile,
          os_role: hubRole
        }
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
        if (!isCallerCreatorOrStaff) {
          throw new Error('Forbidden: Creator or Staff role required for bulk registry ingestion')
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
          if (!isCallerCreatorOrStaff) {
            throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
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
            } else if (cleanTable === 'mods' && row.id) {
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
          if (!isCallerCreatorOrStaff) {
            throw new Error(`Forbidden: Creator or Staff role required to delete from ${cleanTable}`)
          }
          if (!isCallerStaff && (cleanTable === 'mason_posts' || cleanTable === 'collections' || cleanTable === 'masons')) {
            const ownedMasons = await getCallerOwnedMasonIds()
            if (cleanTable === 'masons') {
              if (!ownedMasons.has(String(id_value))) {
                throw new Error('Forbidden: You can only delete your own Creator profile')
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
        } catch (e) {
          console.warn('Spoke audit log insert warning on sever:', e)
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

        await supabaseAdmin
          .from('sanctuary_game_secrets')
          .delete()
          .eq('game_id', game.id)

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
        const modId = String(payload?.mod_id || '').trim()
        const rawTier = Math.round(Number(payload?.tier || 1))
        const requestedTier = Math.min(4, Math.max(1, Number.isFinite(rawTier) ? rawTier : 1))
        const cleanReason = String(payload?.reason || '').trim().slice(0, 1000) || `Flagged Tier ${requestedTier} for Compliance Review`

        if (!modId) {
          throw new Error('Missing mod_id')
        }

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

        const roleTag = isCallerStaff ? callerSpokeRole.toUpperCase() : (callerSpokeRole === 'mason' ? 'MASON' : 'CITIZEN')
        const taggedReason = `[${roleTag} FLAG - TIER ${requestedTier}] ${cleanReason}`

        let updatedMod = existingMod
        if (!isConfirmedActiveOrBlocked || (isCallerStaff && requestedTier > currentTier)) {
          const nextTier = isCurrentlyPending ? Math.max(currentTier, requestedTier) : requestedTier
          const nextStatus =
            callerSpokeRole === 'oversight' || callerSpokeRole === 'wayfinder' || isFoundryTestNodeKeeper
              ? (isCurrentlyPending ? 'pending' : 'verified')
              : 'pending'

          let updRes = await gameDb
            .from('mods')
            .update({
              compliance_tier: nextTier,
              status: nextStatus,
              status_reason: taggedReason,
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

        try {
          await gameDb.from('audit_logs').insert({
            action: `Flagged Artifact for Compliance (Tier ${requestedTier})`,
            target_table: 'mods',
            target_name: existingMod.name || modId,
            actor_id: v_user_id,
            reason: taggedReason,
          })
        } catch (auditErr) {
          console.warn('Compliance flag audit log warning:', auditErr)
        }

        resultData = {
          success: true,
          queued_pending: true,
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
        const newServiceKey = payload?.supabase_service_key?.trim() || gameServiceKey

        if (!newUrl || !newAnonKey || !newServiceKey) {
          throw new Error('Missing required Spoke URL, Anon Key, or Service Key.')
        }
        if (!SUPABASE_URL_REGEX.test(newUrl)) {
          throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
        }

        const verifyClient = createClient(newUrl, newServiceKey, SERVER_AUTH_OPTS)
        const { error: pingErr } = await verifyClient.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
        if (pingErr) {
          throw new Error('Spoke handshake failed with new credentials: ' + pingErr.message)
        }

        const { error: updErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            supabase_url: newUrl,
            supabase_anon_key: newAnonKey,
            is_active: true
          })
          .eq('id', game.id)

        if (updErr) throw updErr

        const { error: secErr } = await supabaseAdmin
          .from('sanctuary_game_secrets')
          .upsert(
            {
              game_id: game.id,
              supabase_service_key: newServiceKey,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'game_id' }
          )
        if (secErr) throw secErr

        try {
          await gameDb.from('audit_logs').insert({
            action: 'Rotated Spoke Uplink Credentials',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: 'Wayfinder / Keeper Uplink Key Rotation'
          })
        } catch (e) {}

        invalidateSpokeGameConfigCache()
        resultData = { success: true, schema_id: game.schema_id }
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

            let q = gameDb.from(cleanTable).select(selectColumns, selectOpts)
            q = applySpokeQueryModifiers(q, payload)
            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
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
          if (CREATOR_OR_STAFF_TABLES.has(cleanTable) && !isCallerCreatorOrStaff) {
            throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
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
                  if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                    throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                  }
                  if (cleanTable === 'collections') delete row.is_official
                }
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
                delete updateVals.is_community_default
                delete updateVals.author_id
              } else if (cleanTable === 'collections') {
                delete updateVals.is_official
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mods') {
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mason_post_comments') {
                delete updateVals.is_hidden
                delete updateVals.author_id
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
